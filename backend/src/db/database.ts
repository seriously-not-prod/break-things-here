/**
 * PostgreSQL database initialization and management
 * Sets up the connection pool and runs schema migrations
 */

import pg from 'pg';
import { hashPassword } from '../utils/auth-helpers.js';
import { isSecureDeploymentEnv } from '../config/security-controls.js';

export interface RunResult {
  lastID?: number;
  changes: number;
}

interface DatabaseRow {
  [key: string]: unknown;
}

type QueryParams = unknown[];

export interface DatabaseAdapter {
  get<T = DatabaseRow>(sql: string, params?: QueryParams): Promise<T | undefined>;
  all<T = DatabaseRow>(sql: string, params?: QueryParams): Promise<T[]>;
  run(sql: string, params?: QueryParams): Promise<RunResult>;
  exec(sql: string): Promise<void>;
  close?(): Promise<void>;
  withUserContext?<T>(userId: number, fn: (db: DatabaseAdapter) => Promise<T>): Promise<T>;
  transaction?<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T>;
}

function convertPlaceholders(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}


const SLOW_QUERY_MS = 1000;

function logSlowQuery(sql: string, durationMs: number): void {
  if (durationMs >= SLOW_QUERY_MS) {
    console.warn(`[SLOW QUERY ${durationMs}ms] ${sql.trim().substring(0, 200)}`);
  }
}

// Postgres wrapper (keeps existing behaviour)
class PgWrapper {
  private pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.pool = pool;
  }

  async get<T = DatabaseRow>(sql: string, params?: QueryParams): Promise<T | undefined> {
    const converted = convertPlaceholders(sql);
    const t0 = Date.now();
    const result = await this.pool.query<DatabaseRow>(converted, params ?? []);
    logSlowQuery(sql, Date.now() - t0);
    return result.rows[0] as T | undefined;
  }

  async all<T = DatabaseRow>(sql: string, params?: QueryParams): Promise<T[]> {
    const converted = convertPlaceholders(sql);
    const t0 = Date.now();
    const result = await this.pool.query<DatabaseRow>(converted, params ?? []);
    logSlowQuery(sql, Date.now() - t0);
    return result.rows as T[];
  }

  async run(sql: string, params?: QueryParams): Promise<RunResult> {
    const trimmedUpper = sql.trim().toUpperCase();
    const converted = convertPlaceholders(sql);
    const t0 = Date.now();
    const result = await this.pool.query<{ id?: number }>(converted, params ?? []);
    logSlowQuery(sql, Date.now() - t0);
    const lastID = /\bRETURNING\b/.test(trimmedUpper) ? result.rows[0]?.id : undefined;
    return { lastID, changes: result.rowCount ?? 0 };
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const txDb: DatabaseAdapter = {
        async get<R = DatabaseRow>(sql: string, params?: QueryParams): Promise<R | undefined> {
          const res = await client.query<DatabaseRow>(convertPlaceholders(sql), params ?? []);
          return res.rows[0] as R | undefined;
        },
        async all<R = DatabaseRow>(sql: string, params?: QueryParams): Promise<R[]> {
          const res = await client.query<DatabaseRow>(convertPlaceholders(sql), params ?? []);
          return res.rows as R[];
        },
        async run(sql: string, params?: QueryParams): Promise<RunResult> {
          const upper = sql.trim().toUpperCase();
          const res = await client.query<{ id?: number }>(convertPlaceholders(sql), params ?? []);
          const lastID = /\bRETURNING\b/.test(upper) ? res.rows[0]?.id : undefined;
          return { lastID, changes: res.rowCount ?? 0 };
        },
        async exec(sql: string): Promise<void> {
          await client.query(sql);
        },
      };
      const result = await fn(txDb);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async withUserContext<T>(userId: number, fn: (db: DatabaseAdapter) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', ['app.current_user_id', String(userId)]);
      const contextDb: DatabaseAdapter = {
        async get<R = DatabaseRow>(sql: string, params?: QueryParams): Promise<R | undefined> {
          const res = await client.query<DatabaseRow>(convertPlaceholders(sql), params ?? []);
          return res.rows[0] as R | undefined;
        },
        async all<R = DatabaseRow>(sql: string, params?: QueryParams): Promise<R[]> {
          const res = await client.query<DatabaseRow>(convertPlaceholders(sql), params ?? []);
          return res.rows as R[];
        },
        async run(sql: string, params?: QueryParams): Promise<RunResult> {
          const upper = sql.trim().toUpperCase();
          const res = await client.query<{ id?: number }>(convertPlaceholders(sql), params ?? []);
          const lastID = /\bRETURNING\b/.test(upper) ? res.rows[0]?.id : undefined;
          return { lastID, changes: res.rowCount ?? 0 };
        },
        async exec(sql: string): Promise<void> {
          await client.query(sql);
        },
      };
      const result = await fn(contextDb);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

let dbWrapper: DatabaseAdapter | null = null;
let pool: pg.Pool | null = null;

function assertSecureDatabaseConnectionString(connectionString: string): void {
  if (!isSecureDeploymentEnv(process.env.NODE_ENV)) return;

  const requireSsl = process.env.DB_SSL_REQUIRED === 'true';
  if (!requireSsl) return;

  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL.');
  }

  const scheme = parsed.protocol.replace(':', '');
  if (!['postgres', 'postgresql'].includes(scheme)) {
    throw new Error('DATABASE_URL must use a PostgreSQL protocol (postgres:// or postgresql://).');
  }

  const sslMode = parsed.searchParams.get('sslmode')?.toLowerCase();
  const secureModes = new Set(['verify-ca', 'verify-full']);
  if (!sslMode || !secureModes.has(sslMode)) {
    throw new Error(
      'In production/staging, DATABASE_URL must include sslmode=verify-ca or sslmode=verify-full.',
    );
  }
}

function resolvePoolSslOptions(connectionString: string): false | { rejectUnauthorized: boolean } {
  let sslMode: string | null = null;
  try {
    sslMode = new URL(connectionString).searchParams.get('sslmode')?.toLowerCase() ?? null;
  } catch {
    sslMode = null;
  }

  if (!sslMode) {
    return false;
  }

  const sslEnabledModes = new Set(['verify-ca', 'verify-full']);
  if (!sslEnabledModes.has(sslMode)) {
    return false;
  }

  return { rejectUnauthorized: true };
}

const ORGANIZER_PERMISSION_NAMES = [
  'events.view',
  'events.create',
  'events.edit',
  'events.delete',
  'roles.view',
  'rsvp.create',
  'rsvp.view',
  'rsvp.manage',
  'tasks.view',
  'tasks.edit',
  'guests.view',
  'guests.manage',
  'budget.view',
  'budget.edit',
  'gallery.view',
  'gallery.upload',
  'gallery.moderate',
  'users.view',
  'checkin.perform',
  'reports.view',
];

const COLLABORATOR_PERMISSION_NAMES = [
  'events.view',
  'events.edit',
  'rsvp.view',
  'tasks.view',
  'tasks.edit',
  'guests.view',
  'budget.view',
  'gallery.view',
  'gallery.upload',
  'users.view',
  'checkin.perform',
];

const GUEST_PERMISSION_NAMES = [
  'events.view',
  'rsvp.create',
  'rsvp.view',
  'gallery.view',
];

const VIEWER_PERMISSION_NAMES = [
  'events.view',
  'rsvp.view',
  'gallery.view',
];

const ATTENDEE_PERMISSION_NAMES = GUEST_PERMISSION_NAMES;

const ROLE_NAMES = {
  attendee:     'Attendee',
  organizer:    'Organizer',
  admin:        'Admin',
  collaborator: 'Collaborator',
  guest:        'Guest',
  viewer:       'Viewer',
} as const;

const DEV_DEMO_USERS = [
  {
    email: 'admin@festival.local',
    password: 'festivalAdmin2025',
    displayName: 'Admin User',
    roleId: 3,
  },
  {
    email: 'organizer@festival.local',
    password: 'Organizer123!',
    displayName: 'Sarah Organizer',
    roleId: 2,
  },
  {
    email: 'organizer2@festival.local',
    password: 'Organizer123!',
    displayName: 'James Organizer',
    roleId: 2,
  },
  {
    email: 'alice@festival.local',
    password: 'Password123!',
    displayName: 'Alice Johnson',
    roleId: 1,
  },
  {
    email: 'bob@festival.local',
    password: 'Password123!',
    displayName: 'Bob Williams',
    roleId: 1,
  },
  {
    email: 'carol@festival.local',
    password: 'Password123!',
    displayName: 'Carol Davis',
    roleId: 1,
  },
  {
    email: 'alice@email.com',
    password: 'Password123!',
    displayName: 'Alice',
    roleId: 1,
  },
] as const;

const DEV_DEMO_EVENT = {
  title: 'eQuip Fest Launch Festival',
  date: '2026-06-18',
  endDate: '2026-06-20',
  location: 'Riverfront Park',
  description: 'Seeded demo event for exploring the full eQuip Fest workspace.',
  capacity: 250,
  status: 'Active',
  eventType: 'Music',
  tags: 'launch,summer,vip',
} as const;

type RoleName = (typeof ROLE_NAMES)[keyof typeof ROLE_NAMES];

async function seedRolePermissions(db: DatabaseAdapter): Promise<void> {
  // Ensure extended permissions exist for new BRD v2 role model (#537, #573)
  const extendedPermissions = [
    ['rsvp.create',      'Submit an RSVP'],
    ['rsvp.view',        'View own RSVP'],
    ['rsvp.manage',      'Manage all RSVPs for an event'],
    ['tasks.view',       'View event tasks'],
    ['tasks.edit',       'Create and update tasks'],
    ['guests.view',      'View guest list'],
    ['guests.manage',    'Manage guest records'],
    ['budget.view',      'View budget'],
    ['budget.edit',      'Edit budget items'],
    ['gallery.view',     'View gallery'],
    ['gallery.upload',   'Upload gallery media'],
    ['gallery.moderate', 'Moderate gallery items'],
    ['checkin.perform',  'Perform attendee check-in'],
    ['reports.view',     'View analytics and reports'],
    ['users.manage',     'Manage user accounts (admin only)'],
  ];
  for (const [name, description] of extendedPermissions) {
    await db.run(
      `INSERT INTO permissions (name, description) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING`,
      [name, description],
    );
  }

  const [adminRoleId, organizerRoleId, attendeeRoleId] = await Promise.all([
    getRoleIdByName(db, ROLE_NAMES.admin),
    getRoleIdByName(db, ROLE_NAMES.organizer),
    getRoleIdByName(db, ROLE_NAMES.attendee),
  ]);

  // Seed new BRD v2 roles — created with ON CONFLICT DO NOTHING so idempotent
  const collaboratorRole = await db.get<{ id: number }>('SELECT id FROM roles WHERE name = $1', [ROLE_NAMES.collaborator]);
  const guestRole        = await db.get<{ id: number }>('SELECT id FROM roles WHERE name = $1', [ROLE_NAMES.guest]);
  const viewerRole       = await db.get<{ id: number }>('SELECT id FROM roles WHERE name = $1', [ROLE_NAMES.viewer]);

  await insertRolePermissions(db, adminRoleId);
  await insertRolePermissions(db, organizerRoleId, ORGANIZER_PERMISSION_NAMES);
  await insertRolePermissions(db, attendeeRoleId, ATTENDEE_PERMISSION_NAMES);

  if (collaboratorRole) {
    await insertRolePermissions(db, collaboratorRole.id, COLLABORATOR_PERMISSION_NAMES);
  }
  if (guestRole) {
    await insertRolePermissions(db, guestRole.id, GUEST_PERMISSION_NAMES);
  }
  if (viewerRole) {
    await insertRolePermissions(db, viewerRole.id, VIEWER_PERMISSION_NAMES);
  }
}

async function getRoleIdByName(db: DatabaseAdapter, roleName: RoleName): Promise<number> {
  const role = await db.get<{ id: number }>('SELECT id FROM roles WHERE name = $1', [roleName]);
  if (!role) {
    throw new Error(`Role ${roleName} was not found during permission seeding`);
  }

  return role.id;
}

async function insertRolePermissions(
  db: DatabaseAdapter,
  roleId: number,
  permissionNames?: string[],
): Promise<void> {
  const params = [roleId, ...(permissionNames ?? [])];
  const permissionFilter = permissionNames?.length
    ? ` WHERE name IN (${permissionNames.map((_, i) => `$${i + 2}`).join(', ')})`
    : '';
  await db.run(
    `INSERT INTO role_permissions (role_id, permission_id)
     SELECT $1, id FROM permissions${permissionFilter} ON CONFLICT (role_id, permission_id) DO NOTHING`,
    params,
  );
}

async function seedDevelopmentDemoUsers(db: DatabaseAdapter): Promise<void> {
  if (process.env.NODE_ENV === 'production') return;

  for (const user of DEV_DEMO_USERS) {
    const passwordHash = await hashPassword(user.password);
    await db.run(
      `INSERT INTO users (email, password_hash, display_name, email_verified, role_id, created_at, updated_at)
       VALUES ($1, $2, $3, 1, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         display_name = EXCLUDED.display_name,
         email_verified = 1,
         role_id = EXCLUDED.role_id,
         deleted_at = NULL,
         account_locked = 0,
         locked_until = NULL,
         login_attempts = 0,
         updated_at = CURRENT_TIMESTAMP`,
      [user.email, passwordHash, user.displayName, user.roleId],
    );
  }
}

async function seedDevelopmentDemoWorkspace(db: DatabaseAdapter): Promise<void> {
  if (process.env.NODE_ENV === 'production') return;

  const admin = await db.get<{ id: number }>('SELECT id FROM users WHERE email = $1', ['admin@festival.local']);
  const attendee = await db.get<{ id: number }>('SELECT id FROM users WHERE email = $1', ['alice@email.com']);

  if (!admin) return;

  let event = await db.get<{ id: number }>(
    'SELECT id FROM events WHERE title = $1 AND created_by = $2 AND deleted_at IS NULL ORDER BY id LIMIT 1',
    [DEV_DEMO_EVENT.title, admin.id],
  );

  if (!event) {
    const created = await db.run(
      `INSERT INTO events (
        title, date, location, description, capacity, status, created_by,
        created_at, updated_at, event_type, tags, is_public, end_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $8, $9, TRUE, $10)
      RETURNING id`,
      [
        DEV_DEMO_EVENT.title,
        DEV_DEMO_EVENT.date,
        DEV_DEMO_EVENT.location,
        DEV_DEMO_EVENT.description,
        DEV_DEMO_EVENT.capacity,
        DEV_DEMO_EVENT.status,
        admin.id,
        DEV_DEMO_EVENT.eventType,
        DEV_DEMO_EVENT.tags,
        DEV_DEMO_EVENT.endDate,
      ],
    );
    event = { id: created.lastID ?? 0 };
  }

  if (!event?.id) return;

  await db.run(
    `INSERT INTO event_members (event_id, user_id, role)
     VALUES ($1, $2, 'Owner')
     ON CONFLICT (event_id, user_id) DO NOTHING`,
    [event.id, admin.id],
  );

  if (attendee) {
    await db.run(
      `INSERT INTO event_members (event_id, user_id, role)
       VALUES ($1, $2, 'Member')
       ON CONFLICT (event_id, user_id) DO NOTHING`,
      [event.id, attendee.id],
    );
  }

  const budgetCategoryCount = await db.get<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM budget_categories WHERE event_id = $1',
    [event.id],
  );
  if (Number(budgetCategoryCount?.count ?? '0') === 0) {
    await db.run(
      `INSERT INTO budget_categories (event_id, name, allocated_amount, color)
       VALUES
       ($1, 'Production', 18000, '#6366f1'),
       ($2, 'Catering', 7000, '#10b981'),
       ($3, 'Marketing', 5000, '#f59e0b')`,
      [event.id, event.id, event.id],
    );
  }

  const categories = await db.all<{ id: number; name: string }>(
    'SELECT id, name FROM budget_categories WHERE event_id = $1 ORDER BY id',
    [event.id],
  );
  const productionCategory = categories.find((category) => category.name === 'Production');
  const cateringCategory = categories.find((category) => category.name === 'Catering');

  const expenseCount = await db.get<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM expenses WHERE event_id = $1',
    [event.id],
  );
  if (Number(expenseCount?.count ?? '0') === 0 && productionCategory && cateringCategory) {
    await db.run(
      `INSERT INTO expenses (event_id, category_id, title, amount, payment_status, vendor_name, notes, created_by)
       VALUES
       ($1, $2, 'Main stage lighting', 4200, 'paid', 'Luma Sound Co.', 'Paid deposit confirmed.', $3),
       ($4, $5, 'Artist green room catering', 1500, 'pending', 'Fresh Plate Catering', 'Final headcount due next week.', $6)`,
      [event.id, productionCategory.id, admin.id, event.id, cateringCategory.id, admin.id],
    );
  }

  const taskCount = await db.get<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM tasks WHERE event_id = $1',
    [event.id],
  );
  if (Number(taskCount?.count ?? '0') === 0) {
    await db.run(
      `INSERT INTO tasks (event_id, title, notes, assignee_name, assigned_user_id, due_date, status, priority, created_by, description)
       VALUES
       ($1, 'Confirm headline artist', 'Lock final arrival schedule and tech rider.', 'Admin User', $2, '2026-06-01', 'In Progress', 'High', $3, 'Artist confirmation and technical requirements.'),
       ($4, 'Review volunteer roster', 'Assign the evening gate team.', 'Alice', $5, '2026-06-05', 'Pending', 'Medium', $6, 'Volunteer shift review for festival weekend.'),
       ($7, 'Print VIP wristbands', 'Prepare 75 gold wristbands.', 'Admin User', $8, '2026-06-10', 'Blocked', 'Low', $9, 'Waiting on final sponsor guest list.')`,
      [
        event.id, admin.id, admin.id,
        event.id, attendee?.id ?? null, admin.id,
        event.id, admin.id, admin.id,
      ],
    );
  }

  const rsvpCount = await db.get<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM rsvps WHERE event_id = $1',
    [event.id],
  );
  if (Number(rsvpCount?.count ?? '0') === 0) {
    await db.run(
      `INSERT INTO rsvps (event_id, name, email, guests, status, notes, source, checked_in)
       VALUES
       ($1, 'Alice', 'alice@email.com', 2, 'Going', 'VIP guest with one plus-one.', 'dashboard', TRUE),
       ($2, 'Marcus Lee', 'marcus@example.com', 1, 'Pending', 'Waiting on travel approval.', 'public', FALSE),
       ($3, 'Sofia Patel', 'sofia@example.com', 3, 'Maybe', 'Needs accessible seating.', 'admin', FALSE)`,
      [event.id, event.id, event.id],
    );
  }

  const seatingTableCount = await db.get<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM seating_tables WHERE event_id = $1',
    [event.id],
  );
  if (Number(seatingTableCount?.count ?? '0') === 0) {
    await db.run(
      `INSERT INTO seating_tables (event_id, name, capacity, layout_x, layout_y)
       VALUES
       ($1, 'VIP Table', 8, 60, 60),
       ($2, 'Team Table', 10, 380, 60)`,
      [event.id, event.id],
    );
  }

  const seatingAssignmentCount = await db.get<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM seating_assignments sa JOIN seating_tables st ON st.id = sa.table_id WHERE st.event_id = $1',
    [event.id],
  );
  if (Number(seatingAssignmentCount?.count ?? '0') === 0) {
    const vipTable = await db.get<{ id: number }>('SELECT id FROM seating_tables WHERE event_id = $1 AND name = $2', [event.id, 'VIP Table']);
    const firstGuest = await db.get<{ id: number }>('SELECT id FROM rsvps WHERE event_id = $1 ORDER BY id LIMIT 1', [event.id]);
    if (vipTable && firstGuest) {
      await db.run(
        `INSERT INTO seating_assignments (table_id, rsvp_id)
         VALUES ($1, $2)
         ON CONFLICT (table_id, rsvp_id) DO NOTHING`,
        [vipTable.id, firstGuest.id],
      );
    }
  }

  const vendorCount = await db.get<{ count: string }>('SELECT COUNT(*)::text AS count FROM vendors WHERE event_id = $1', [event.id]);
  if (Number(vendorCount?.count ?? '0') === 0) {
    await db.run(
      `INSERT INTO vendors (event_id, name, category, email, phone, website, status, quoted_amount, notes, rating, created_by)
       VALUES ($1, 'Luma Sound Co.', 'Production', 'hello@lumasound.co', '555-0101', 'https://lumasound.example', 'Confirmed', 8200, 'Stage and lighting package booked.', 5, $2)`,
      [event.id, admin.id],
    );
  }

  const shoppingList = await db.get<{ id: number }>('SELECT id FROM shopping_lists WHERE event_id = $1 ORDER BY id LIMIT 1', [event.id]);
  let shoppingListId = shoppingList?.id;
  if (!shoppingListId) {
    const createdList = await db.run(
      `INSERT INTO shopping_lists (event_id, name, created_by)
       VALUES ($1, 'Launch Weekend Supplies', $2)
       RETURNING id`,
      [event.id, admin.id],
    );
    shoppingListId = createdList.lastID;
  }

  const shoppingItemCount = shoppingListId
    ? await db.get<{ count: string }>('SELECT COUNT(*)::text AS count FROM shopping_items WHERE list_id = $1', [shoppingListId])
    : undefined;
  if (shoppingListId && Number(shoppingItemCount?.count ?? '0') === 0) {
    await db.run(
      `INSERT INTO shopping_items (list_id, name, quantity, unit, estimated_cost, actual_cost, status, assigned_to, notes)
       VALUES
       ($1, 'LED wristbands', 250, 'pcs', 500, NULL, 'Needed', $2, 'For opening night crowd effect.'),
       ($3, 'Backstage water cases', 20, 'cases', 180, 172, 'Purchased', $4, 'Delivered to storage.')`,
      [shoppingListId, admin.id, shoppingListId, attendee?.id ?? admin.id],
    );
  }

  const timelineCount = await db.get<{ count: string }>('SELECT COUNT(*)::text AS count FROM timeline_activities WHERE event_id = $1', [event.id]);
  if (Number(timelineCount?.count ?? '0') === 0) {
    await db.run(
      `INSERT INTO timeline_activities (event_id, title, description, start_time, end_time, location, sort_order, created_by)
       VALUES
       ($1, 'Gates open', 'General admission opens for all attendees.', '2026-06-18T16:00:00Z', '2026-06-18T16:30:00Z', 'Main Gate', 1, $2),
       ($3, 'Headline set', 'Main stage performance begins.', '2026-06-18T21:00:00Z', '2026-06-18T22:30:00Z', 'Main Stage', 2, $4),
       ($5, 'VIP after-party', 'Private lounge access for sponsors and VIP guests.', '2026-06-18T23:00:00Z', '2026-06-19T01:00:00Z', 'Sky Lounge', 3, $6)`,
      [event.id, admin.id, event.id, admin.id, event.id, admin.id],
    );
  }

  const messageCount = await db.get<{ count: string }>('SELECT COUNT(*)::text AS count FROM event_messages WHERE event_id = $1', [event.id]);
  if (Number(messageCount?.count ?? '0') === 0) {
    await db.run(
      `INSERT INTO event_messages (event_id, sender_id, body)
       VALUES
       ($1, $2, 'Welcome to the Eventora demo workspace. Use this event to explore each module.'),
       ($3, $4, 'Budget, guests, seating, vendors, shopping, and timeline now have sample data.')`,
      [event.id, admin.id, event.id, attendee?.id ?? admin.id],
    );
  }
}

async function seedDevelopmentExtraData(db: DatabaseAdapter): Promise<void> {
  if (process.env.NODE_ENV === 'production') return;

  const admin = await db.get<{ id: number }>('SELECT id FROM users WHERE email = $1', ['admin@festival.local']);
  const attendee = await db.get<{ id: number }>('SELECT id FROM users WHERE email = $1', ['alice@email.com']);
  if (!admin) return;

  const draftTitle = 'Autumn Wine Festival (Draft)';
  const draft = await db.get<{ id: number }>(
    'SELECT id FROM events WHERE title = $1 AND created_by = $2 AND deleted_at IS NULL ORDER BY id LIMIT 1',
    [draftTitle, admin.id],
  );
  if (!draft) {
    await db.run(
      `INSERT INTO events (title, date, location, description, capacity, status, created_by,
        created_at, updated_at, event_type, tags, is_public, end_date)
       VALUES ($1, $2, $3, $4, $5, 'Draft', $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Food', 'wine,fall,private', FALSE, $7)`,
      [draftTitle, '2026-10-12', 'Vine & Hill Estate', 'Planning stage for the autumn invitational tasting.', 120, admin.id, '2026-10-13'],
    );
  }

  const completedTitle = 'Spring Tech Conference 2026';
  const completed = await db.get<{ id: number }>(
    'SELECT id FROM events WHERE title = $1 AND created_by = $2 AND deleted_at IS NULL ORDER BY id LIMIT 1',
    [completedTitle, admin.id],
  );
  if (!completed) {
    await db.run(
      `INSERT INTO events (title, date, location, description, capacity, status, created_by,
        created_at, updated_at, event_type, tags, is_public, end_date)
       VALUES ($1, $2, $3, $4, $5, 'Completed', $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Conference', 'tech,past', TRUE, $7)`,
      [completedTitle, '2026-03-04', 'Innovation Hall', 'Annual tech meetup that wrapped up successfully.', 400, admin.id, '2026-03-06'],
    );
  }

  const launchEvent = await db.get<{ id: number }>(
    'SELECT id FROM events WHERE title = $1 AND created_by = $2 AND deleted_at IS NULL ORDER BY id LIMIT 1',
    [DEV_DEMO_EVENT.title, admin.id],
  );

  if (launchEvent?.id) {
    const musicCategory = await db.get<{ id: number }>('SELECT id FROM categories WHERE name = $1', ['Music']);
    if (musicCategory) {
      await db.run(
        `INSERT INTO event_categories (event_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [launchEvent.id, musicCategory.id],
      );
    }

    const albumCount = await db.get<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM gallery_albums WHERE event_id = $1',
      [launchEvent.id],
    );
    if (Number(albumCount?.count ?? '0') === 0) {
      await db.run(
        `INSERT INTO gallery_albums (event_id, name, description, created_by)
         VALUES ($1, 'Soundcheck Day', 'Behind-the-scenes from rehearsals.', $2)`,
        [launchEvent.id, admin.id],
      );
    }

    const activityCount = await db.get<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM activity_feed WHERE event_id = $1',
      [launchEvent.id],
    );
    if (Number(activityCount?.count ?? '0') === 0) {
      await db.run(
        `INSERT INTO activity_feed (event_id, user_id, action_type, description, link)
         VALUES
         ($1, $2, 'event_created', 'Eventora Launch Festival workspace created.', $3),
         ($4, $5, 'rsvp_added', 'Alice confirmed her RSVP.', $6),
         ($7, $8, 'expense_added', 'Main stage lighting expense recorded.', $9)`,
        [
          launchEvent.id, admin.id, `/events/${launchEvent.id}`,
          launchEvent.id, admin.id, `/events/${launchEvent.id}/rsvps`,
          launchEvent.id, admin.id, `/events/${launchEvent.id}/budget`,
        ],
      );
    }

    const commLogCount = await db.get<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM communication_log WHERE event_id = $1',
      [launchEvent.id],
    );
    if (Number(commLogCount?.count ?? '0') === 0) {
      await db.run(
        `INSERT INTO communication_log (event_id, guest_email, communication_type, subject, content, status, sent_by)
         VALUES
         ($1, 'alice@email.com', 'rsvp_confirmation', 'Your RSVP is confirmed', 'Thanks for confirming. See you on June 18!', 'sent', $2),
         ($3, 'marcus@example.com', 'reminder', 'Don''t forget to RSVP', 'A friendly reminder to confirm your spot.', 'sent', $4)`,
        [launchEvent.id, admin.id, launchEvent.id, admin.id],
      );
    }
  }

  const notifCount = await db.get<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM notifications WHERE user_id = $1',
    [admin.id],
  );
  if (Number(notifCount?.count ?? '0') === 0) {
    await db.run(
      `INSERT INTO notifications (user_id, type, title, body, link, is_read)
       VALUES
       ($1, 'rsvp', 'New RSVP received', 'Sofia Patel responded Maybe.', '/events', FALSE),
       ($2, 'task', 'Task due soon', 'Confirm headline artist is due in 3 days.', '/events', FALSE),
       ($3, 'budget', 'Budget alert', 'Catering category at 21% of allocated.', '/events', TRUE)`,
      [admin.id, admin.id, admin.id],
    );
  }

  if (attendee) {
    const attendeeNotif = await db.get<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM notifications WHERE user_id = $1',
      [attendee.id],
    );
    if (Number(attendeeNotif?.count ?? '0') === 0) {
      await db.run(
        `INSERT INTO notifications (user_id, type, title, body, link, is_read)
         VALUES ($1, 'invite', 'You were invited', 'Welcome to Eventora Launch Festival.', '/events', FALSE)`,
        [attendee.id],
      );
    }
  }
}

export async function initializeDatabase(): Promise<DatabaseAdapter> {
  if (dbWrapper) return dbWrapper;

  const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL environment variable is required. Set it to a PostgreSQL connection string.',
    );
  }

  assertSecureDatabaseConnectionString(connectionString);
  const ssl = resolvePoolSslOptions(connectionString);

  const { Pool } = pg;
  pool = new Pool({
    connectionString,
    ssl,
    statement_timeout: 30000,
    query_timeout: 30000,
  });
  const client = await pool.connect();
  client.release();
  dbWrapper = new PgWrapper(pool);
  await runMigrations(dbWrapper);
  await seedDevelopmentDemoUsers(dbWrapper);
  await seedDevelopmentDemoWorkspace(dbWrapper);
  await seedDevelopmentExtraData(dbWrapper);
  return dbWrapper;
}

export function getDatabase(): DatabaseAdapter {
  if (!dbWrapper) throw new Error('Database not initialized. Call initializeDatabase() first.');
  return dbWrapper;
}

export function getPool(): pg.Pool {
  if (!pool) throw new Error('Database pool not initialized. Call initializeDatabase() first.');
  return pool;
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    dbWrapper = null;
  }
}

async function runMigrations(db: DatabaseAdapter): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      email_verified INTEGER DEFAULT 0,
      email_verified_at TIMESTAMP,
      email_verification_token TEXT,
      pending_email TEXT,
      pending_email_token TEXT,
      pending_email_token_expiry TIMESTAMP,
      role_id INTEGER DEFAULT 1,
      account_locked INTEGER DEFAULT 0,
      locked_until TIMESTAMP,
      login_attempts INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      refresh_token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      email TEXT NOT NULL,
      token_selector TEXT NOT NULL DEFAULT '',
      token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      used INTEGER DEFAULT 0,
      used_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_rate_limit (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      request_count INTEGER DEFAULT 1,
      window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(email)
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      email TEXT,
      action TEXT NOT NULL,
      description TEXT,
      ip_address TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // BRD v2 #538/#572: extend audit_log with richer security event fields
  await db.exec(`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS actor_id    INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await db.exec(`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS target_type TEXT`);
  await db.exec(`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS target_id   TEXT`);
  await db.exec(`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS context     JSONB`);
  await db.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'audit_log' AND column_name = 'severity'
      ) THEN
        ALTER TABLE audit_log ADD COLUMN severity TEXT DEFAULT 'INFO'
          CHECK (severity IN ('INFO','WARN','ERROR','CRITICAL'));
      END IF;
    END $$
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_log_action     ON audit_log(action)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_log_user_id    ON audit_log(user_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC)`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    INSERT INTO roles (id, name, description) VALUES
    (1, 'Attendee',     'Default role for new users'),
    (2, 'Organizer',    'Can create and manage events'),
    (3, 'Admin',        'Full system access'),
    (4, 'Collaborator', 'Can contribute to events they are assigned to'),
    (5, 'Guest',        'Invited event attendee; can RSVP and check in'),
    (6, 'Viewer',       'Read-only access to public events and own RSVPs')
    ON CONFLICT (id) DO UPDATE
      SET name        = EXCLUDED.name,
          description = EXCLUDED.description
  `);

  await db.exec(`SELECT setval('roles_id_seq', GREATEST((SELECT MAX(id) FROM roles), 6))`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS permissions (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INTEGER NOT NULL,
      permission_id INTEGER NOT NULL,
      PRIMARY KEY (role_id, permission_id),
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
      FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE NOT NULL,
      bio TEXT,
      phone_number TEXT,
      profile_photo_url TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      zip_code TEXT,
      country TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await db.exec(`
    INSERT INTO permissions (name, description) VALUES
    ('users.view',   'View user profiles'),
    ('users.edit',   'Edit user profiles'),
    ('users.delete', 'Delete users'),
    ('events.view',  'View events'),
    ('events.create','Create events'),
    ('events.edit',  'Edit events'),
    ('events.delete','Delete events'),
    ('roles.view',   'View roles'),
    ('roles.manage', 'Manage roles and permissions')
    ON CONFLICT (name) DO NOTHING
  `);

  await seedRolePermissions(db);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      location TEXT NOT NULL,
      description TEXT,
      capacity INTEGER,
      status TEXT CHECK(status IN ('Draft', 'Active', 'Completed')) DEFAULT 'Draft',
      created_by INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await db.exec(`ALTER TABLE events ADD COLUMN IF NOT EXISTS cover_image_url TEXT`);
  await db.exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMP`);
  await db.exec(`ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type TEXT DEFAULT 'Other'`);
  await db.exec(`ALTER TABLE events ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE`);
  await db.exec(`ALTER TABLE events ADD COLUMN IF NOT EXISTS rsvp_deadline TIMESTAMP`);
  await db.exec(`ALTER TABLE events ADD COLUMN IF NOT EXISTS tags TEXT`);
  await db.exec(`ALTER TABLE events ADD COLUMN IF NOT EXISTS capacity INTEGER`);
  await db.exec(`ALTER TABLE events ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`);
  // Rename legacy event_date column to date if the old schema is still present.
  // Guard: skip rename if date already exists (handles DB state where both columns coexist).
  {
    const [legacyCol, dateCol] = await Promise.all([
      db.get<{ exists: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='event_date') AS exists`,
      ),
      db.get<{ exists: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='date') AS exists`,
      ),
    ]);
    if (legacyCol?.exists && !dateCol?.exists) {
      await db.exec(`ALTER TABLE events RENAME COLUMN event_date TO date`);
    } else if (legacyCol?.exists && dateCol?.exists) {
      // Both columns exist — drop the legacy one to resolve the drift
      await db.exec(`ALTER TABLE events DROP COLUMN IF EXISTS event_date`);
    }
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS activity_feed (
      id SERIAL PRIMARY KEY,
      event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action_type TEXT NOT NULL,
      description TEXT NOT NULL,
      link TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      notes TEXT,
      assignee_name TEXT,
      assigned_user_id INTEGER,
      due_date TEXT,
      status TEXT CHECK(status IN ('Pending', 'In Progress', 'Blocked', 'Complete')) DEFAULT 'Pending',
      priority TEXT CHECK(priority IN ('Low', 'Medium', 'High')) DEFAULT 'Medium',
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS rsvps (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      guests INTEGER DEFAULT 1,
      status TEXT CHECK(status IN ('Pending', 'Going', 'Maybe', 'Not Going', 'Declined')) DEFAULT 'Pending',
      notes TEXT,
      source TEXT DEFAULT 'public',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(event_id, email),
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )
  `);

  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS checked_in BOOLEAN DEFAULT FALSE`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMP`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS phone TEXT`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS dietary_restriction TEXT DEFAULT 'None'`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS accessibility_needs TEXT`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS plus_one BOOLEAN DEFAULT FALSE`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS plus_one_name TEXT`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS guest_group TEXT`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS rsvp_deadline TIMESTAMP`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'public'`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS communication_log (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      guest_email TEXT,
      communication_type TEXT NOT NULL,
      subject TEXT,
      content TEXT,
      status TEXT DEFAULT 'sent',
      sent_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec('CREATE INDEX IF NOT EXISTS idx_communication_log_event_id ON communication_log(event_id)');

  // ── Communication tracking (#419, #465, #466) ───────────────────────────
  // Append-only event log for email opens (pixel) and clicks (redirect).
  await db.exec(`
    CREATE TABLE IF NOT EXISTS communication_tracking_events (
      id SERIAL PRIMARY KEY,
      communication_log_id INTEGER NOT NULL REFERENCES communication_log(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL CHECK (event_type IN ('open','click')),
      target_url TEXT,
      ip_address TEXT,
      user_agent TEXT,
      occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.exec(
    'CREATE INDEX IF NOT EXISTS idx_comm_tracking_log_id ON communication_tracking_events(communication_log_id)',
  );
  await db.exec(
    'CREATE INDEX IF NOT EXISTS idx_comm_tracking_type ON communication_tracking_events(event_type)',
  );

  await db.exec(`
    CREATE TABLE IF NOT EXISTS budget_categories (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      allocated_amount NUMERIC(10,2) DEFAULT 0,
      tax_rate NUMERIC(5,2) DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
      gratuity_rate NUMERIC(5,2) DEFAULT 0 CHECK (gratuity_rate >= 0 AND gratuity_rate <= 100),
      contingency_rate NUMERIC(5,2) DEFAULT 0 CHECK (contingency_rate >= 0 AND contingency_rate <= 100),
      color TEXT DEFAULT '#6366f1',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      category_id INTEGER REFERENCES budget_categories(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      amount NUMERIC(10,2) NOT NULL,
      payment_status TEXT DEFAULT 'pending',
      vendor_name TEXT,
      notes TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Backfill legacy PascalCase payment_status values BEFORE re-applying the
  // lowercase CHECK constraint. Idempotent on already-lowercase data.
  await db.exec(`
    UPDATE expenses
       SET payment_status = LOWER(payment_status)
     WHERE payment_status IN ('Pending', 'Paid', 'Overdue', 'Cancelled')
  `);
  // Drop any existing constraint (legacy PascalCase or older variant) and
  // recreate with the BRD v2 lowercase whitelist.
  await db.exec(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_payment_status_check') THEN
        ALTER TABLE expenses DROP CONSTRAINT expenses_payment_status_check;
      END IF;
    END $$
  `);
  await db.exec(`
    ALTER TABLE expenses ADD CONSTRAINT expenses_payment_status_check
      CHECK (payment_status IN ('pending','paid','overdue','cancelled'))
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS seating_tables (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      capacity INTEGER DEFAULT 8,
      layout_x INTEGER,
      layout_y INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`ALTER TABLE seating_tables ADD COLUMN IF NOT EXISTS layout_x INTEGER`);
  await db.exec(`ALTER TABLE seating_tables ADD COLUMN IF NOT EXISTS layout_y INTEGER`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS seating_assignments (
      table_id INTEGER NOT NULL REFERENCES seating_tables(id) ON DELETE CASCADE,
      rsvp_id INTEGER NOT NULL REFERENCES rsvps(id) ON DELETE CASCADE,
      PRIMARY KEY (table_id, rsvp_id)
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      link TEXT,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS event_documents (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL,
      original_name TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  await db.exec('CREATE INDEX IF NOT EXISTS idx_event_documents_event_id ON event_documents(event_id)');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS event_members (
      event_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT DEFAULT 'Helper',
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (event_id, user_id),
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Normalize legacy role labels to BRD role model.
  await db.exec(`UPDATE event_members SET role = 'Helper' WHERE LOWER(COALESCE(role, '')) = 'member'`);

  // ── Vendor Management (BRD 3.6) ──────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS vendors (
      id             SERIAL PRIMARY KEY,
      event_id       INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name           TEXT NOT NULL,
      category       TEXT NOT NULL,
      email          TEXT,
      phone          TEXT,
      website        TEXT,
      status         TEXT CHECK(status IN ('Contacted','Quote Received','Booked','Confirmed','Cancelled')) DEFAULT 'Contacted',
      quoted_amount  NUMERIC(10,2),
      contract_file  TEXT,
      notes          TEXT,
      rating         INTEGER CHECK(rating BETWEEN 1 AND 5),
      created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Shopping Lists & Items (BRD 3.7) ─────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS shopping_lists (
      id         SERIAL PRIMARY KEY,
      event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS shopping_items (
      id             SERIAL PRIMARY KEY,
      list_id        INTEGER NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
      name           TEXT NOT NULL,
      quantity       INTEGER DEFAULT 1,
      unit           TEXT,
      estimated_cost NUMERIC(10,2),
      actual_cost    NUMERIC(10,2),
      status         TEXT CHECK(status IN ('Needed','Purchased','Not Available','Ordered')) DEFAULT 'Needed',
      assigned_to    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      notes          TEXT,
      created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Event Timeline (BRD 3.8) ──────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS timeline_activities (
      id          SERIAL PRIMARY KEY,
      event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      description TEXT,
      start_time  TIMESTAMP,
      end_time    TIMESTAMP,
      location    TEXT,
      vendor_id   INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
      sort_order  INTEGER DEFAULT 0,
      created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Task enhancements (BRD 3.5, issues #373 #374) ────────────────────────
  await db.exec(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description TEXT`);
  await db.exec(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(5,2)`);
  // Schema drift fix: tasks created before full migration were missing these columns
  await db.exec(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await db.exec(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'Medium'`);
  await db.exec(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);

  // ── Vendors schema drift fix ──────────────────────────────────────────────
  // Older DB had company_name/booking_status; current code expects name/status
  {
    const col = await db.get<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vendors' AND column_name='company_name') AS exists`,
    );
    if (col?.exists) await db.exec(`ALTER TABLE vendors RENAME COLUMN company_name TO name`);
  }
  {
    const col = await db.get<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vendors' AND column_name='booking_status') AS exists`,
    );
    if (col?.exists) await db.exec(`ALTER TABLE vendors RENAME COLUMN booking_status TO status`);
  }
  await db.exec(`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS website TEXT`);
  await db.exec(`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS contract_file TEXT`);
  await db.exec(`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS rating INTEGER`);

  // ── Expenses schema drift fix ─────────────────────────────────────────────
  // Older DB stored vendor FK; current code stores vendor_name as free text
  await db.exec(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS vendor_name TEXT`);

  // ── Budget planning schema drift fix (#596, #597) ─────────────────────────
  await db.exec(`ALTER TABLE budget_categories ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) DEFAULT 0`);
  await db.exec(`ALTER TABLE budget_categories ADD COLUMN IF NOT EXISTS gratuity_rate NUMERIC(5,2) DEFAULT 0`);
  await db.exec(`ALTER TABLE budget_categories ADD COLUMN IF NOT EXISTS contingency_rate NUMERIC(5,2) DEFAULT 0`);
  await db.exec(`
    DO $$
    BEGIN
      ALTER TABLE budget_categories
      ADD CONSTRAINT budget_categories_tax_rate_range_chk
      CHECK (tax_rate >= 0 AND tax_rate <= 100);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);
  await db.exec(`
    DO $$
    BEGIN
      ALTER TABLE budget_categories
      ADD CONSTRAINT budget_categories_gratuity_rate_range_chk
      CHECK (gratuity_rate >= 0 AND gratuity_rate <= 100);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);
  await db.exec(`
    DO $$
    BEGIN
      ALTER TABLE budget_categories
      ADD CONSTRAINT budget_categories_contingency_rate_range_chk
      CHECK (contingency_rate >= 0 AND contingency_rate <= 100);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS task_comments (
      id         SERIAL PRIMARY KEY,
      task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body       TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS task_subtasks (
      id         SERIAL PRIMARY KEY,
      task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      completed  BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_task_subtasks_task_id ON task_subtasks(task_id)`);

  // ── Event Messages / Team Conversation (issue #messages) ─────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS event_messages (
      id         SERIAL PRIMARY KEY,
      event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      sender_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body       TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP
    )
  `);

  await db.exec(`CREATE INDEX IF NOT EXISTS idx_event_messages_event_id ON event_messages(event_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_event_messages_sender_id ON event_messages(sender_id)`);

  // ── Multi-day events: add end_date column (#217) ──────────────────────────
  await db.exec(`ALTER TABLE events ADD COLUMN IF NOT EXISTS end_date TEXT`);

  // ── Event Categories — lookup table + junction table (#217) ───────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id          SERIAL PRIMARY KEY,
      name        TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    INSERT INTO categories (name) VALUES
    ('Music'),
    ('Food & Beverage'),
    ('Entertainment'),
    ('Sports'),
    ('Art & Culture'),
    ('Business'),
    ('Technology'),
    ('Education'),
    ('Charity'),
    ('Other')
    ON CONFLICT (name) DO NOTHING
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS event_categories (
      event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      PRIMARY KEY (event_id, category_id)
    )
  `);

  await db.exec(`CREATE INDEX IF NOT EXISTS idx_event_categories_event_id ON event_categories(event_id)`);

  // ── Gallery caption support (#409, #430) ─────────────────────────────────
  await db.exec(`ALTER TABLE event_documents ADD COLUMN IF NOT EXISTS caption TEXT`);

  // ── Task dependencies (#440) ──────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS task_dependencies (
      id              SERIAL PRIMARY KEY,
      task_id         INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      depends_on_id   INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(task_id, depends_on_id),
      CONSTRAINT task_dependencies_no_self_ref CHECK(task_id <> depends_on_id)
    )
  `);
  // Idempotent: add named self-ref constraint if table pre-existed without it
  await db.exec(`
    DO $$
    BEGIN
      ALTER TABLE task_dependencies
        ADD CONSTRAINT task_dependencies_no_self_ref CHECK(task_id <> depends_on_id);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON task_dependencies(task_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on_id ON task_dependencies(depends_on_id)`);

  // ── Budget templates (#438) ───────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS budget_templates (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT,
      created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS budget_template_items (
      id               SERIAL PRIMARY KEY,
      template_id      INTEGER NOT NULL REFERENCES budget_templates(id) ON DELETE CASCADE,
      name             TEXT NOT NULL,
      allocated_amount NUMERIC(10,2) DEFAULT 0,
      color            TEXT DEFAULT '#6366f1',
      created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_budget_template_items_template_id ON budget_template_items(template_id)`);

  // ── Task templates & time entries (#450) ─────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS task_templates (
      id              SERIAL PRIMARY KEY,
      event_id        INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name            TEXT NOT NULL,
      description     TEXT,
      priority        TEXT CHECK(priority IN ('Low','Medium','High')) DEFAULT 'Medium',
      estimated_hours NUMERIC(5,2),
      created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_task_templates_event_id ON task_templates(event_id)`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS task_time_entries (
      id          SERIAL PRIMARY KEY,
      task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      hours_spent NUMERIC(5,2) NOT NULL CHECK(hours_spent > 0),
      notes       TEXT,
      logged_at   DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_task_time_entries_task_id ON task_time_entries(task_id)`);

  // Recurring task support columns
  await db.exec(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE`);
  await db.exec(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_pattern TEXT`);
  await db.exec(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_end_date TEXT`);
  // Guard: only add FK column once task_templates is confirmed to exist
  {
    const tmplExists = await db.get<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='task_templates') AS exists`,
    );
    if (tmplExists?.exists) {
      await db.exec(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS template_id INTEGER REFERENCES task_templates(id) ON DELETE SET NULL`);
    }
  }

  // ── Recurring expenses (#449) ─────────────────────────────────────────────
  await db.exec(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE`);
  // Add column without inline CHECK first (idempotent), then add named constraint separately
  await db.exec(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS recurrence_pattern TEXT`);
  await db.exec(`
    DO $$
    BEGIN
      ALTER TABLE expenses
        ADD CONSTRAINT expenses_recurrence_pattern_valid
        CHECK (recurrence_pattern IS NULL OR recurrence_pattern IN ('weekly','monthly','quarterly','annually'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);
  await db.exec(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS recurrence_end_date DATE`);
  await db.exec(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_installment BOOLEAN DEFAULT FALSE`);
  await db.exec(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS installment_total INTEGER`);
  await db.exec(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS installment_number INTEGER`);

  // ── Vendor communication log (#452) ──────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS vendor_communication_log (
      id         SERIAL PRIMARY KEY,
      event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      vendor_id  INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
      type       TEXT NOT NULL CHECK(type IN ('email','call','meeting','quote','follow_up','other')),
      subject    TEXT NOT NULL,
      body       TEXT,
      sent_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_vendor_comm_log_vendor_id ON vendor_communication_log(vendor_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_vendor_comm_log_event_id ON vendor_communication_log(event_id)`);

  // ── Vendor lifecycle parity (#553, #609, #610, #611) ───────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS vendor_favorites (
      id         SERIAL PRIMARY KEY,
      event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      vendor_id  INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(event_id, vendor_id, user_id)
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_vendor_favorites_event_id ON vendor_favorites(event_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_vendor_favorites_vendor_id ON vendor_favorites(vendor_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_vendor_favorites_user_id ON vendor_favorites(user_id)`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS vendor_bookings (
      id                 SERIAL PRIMARY KEY,
      event_id           INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      vendor_id          INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
      status             TEXT NOT NULL DEFAULT 'requested',
      contract_signed_at TIMESTAMP,
      service_start_at   TIMESTAMP,
      service_end_at     TIMESTAMP,
      total_amount       NUMERIC(10,2),
      currency_code      TEXT DEFAULT 'USD',
      notes              TEXT,
      created_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(event_id, vendor_id),
      CHECK(status IN ('requested','quoted','negotiating','approved','contracted','scheduled','in_progress','completed','cancelled'))
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_vendor_bookings_event_id ON vendor_bookings(event_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_vendor_bookings_vendor_id ON vendor_bookings(vendor_id)`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS vendor_payment_schedules (
      id             SERIAL PRIMARY KEY,
      event_id       INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      vendor_id      INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
      vendor_booking_id INTEGER REFERENCES vendor_bookings(id) ON DELETE SET NULL,
      due_date       DATE NOT NULL,
      amount         NUMERIC(10,2) NOT NULL,
      status         TEXT NOT NULL DEFAULT 'pending',
      paid_at        TIMESTAMP,
      note           TEXT,
      created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CHECK(status IN ('pending','paid','overdue','cancelled')),
      CHECK(amount >= 0)
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_vendor_payment_sched_event_id ON vendor_payment_schedules(event_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_vendor_payment_sched_vendor_id ON vendor_payment_schedules(vendor_id)`);

  // ── Store suggestions (#464) ──────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS store_suggestions (
      id           SERIAL PRIMARY KEY,
      event_id     INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      website      TEXT,
      notes        TEXT,
      category     TEXT,
      suggested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status       TEXT CHECK(status IN ('pending','approved','rejected')) DEFAULT 'pending',
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_store_suggestions_event_id ON store_suggestions(event_id)`);
  await db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_store_suggestions_unique
    ON store_suggestions(event_id, lower(name))
  `);

  // ── RLS pilot: schema alignment (#475) ───────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS event_documents (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      original_name TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      caption TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS event_messages (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS event_categories (
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      PRIMARY KEY (event_id, category_id)
    )
  `);

  await db.exec(`ALTER TABLE events ADD COLUMN IF NOT EXISTS end_date TEXT`);

  // ── Entra ID identity linking (#468, #470) ────────────────────────────────
  await db.exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS entra_oid TEXT`);
  await db.exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'local'`);
  await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_entra_oid ON users(entra_oid) WHERE entra_oid IS NOT NULL`);

  // ── RLS pilot: enable row-level security (#472) ───────────────────────────
  if (process.env.RLS_PILOT_ENABLED === 'true') {
    console.log('[RLS] Applying RLS pilot policies on events and event_members…');

    await db.exec(`ALTER TABLE events ENABLE ROW LEVEL SECURITY`);
    await db.exec(`ALTER TABLE events FORCE ROW LEVEL SECURITY`);
    await db.exec(`ALTER TABLE event_members ENABLE ROW LEVEL SECURITY`);
    await db.exec(`ALTER TABLE event_members FORCE ROW LEVEL SECURITY`);

    await db.exec(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'rls_events_owner'
        ) THEN
          CREATE POLICY rls_events_owner ON events
            USING (
              created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
            );
        END IF;
      END $$;
    `);

    await db.exec(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'rls_events_member'
        ) THEN
          CREATE POLICY rls_events_member ON events
            USING (
              id IN (
                SELECT event_id FROM event_members
                WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
              )
            );
        END IF;
      END $$;
    `);

    await db.exec(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'event_members' AND policyname = 'rls_event_members_self'
        ) THEN
          CREATE POLICY rls_event_members_self ON event_members
            USING (
              user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
            );
        END IF;
      END $$;
    `);

    console.log('[RLS] RLS pilot policies applied.');
  }

  // ── RLS v2: extend RLS to tasks, expenses, vendors, rsvps (#564, #632, #633) ──
  if (process.env.RLS_PILOT_ENABLED === 'true') {
    console.log('[RLS] Applying RLS v2 policies on tasks, expenses, vendors, rsvps…');
    for (const tbl of ['tasks', 'expenses', 'vendors', 'rsvps']) {
      await db.exec(`ALTER TABLE ${tbl} ENABLE ROW LEVEL SECURITY`);
      await db.exec(`ALTER TABLE ${tbl} FORCE ROW LEVEL SECURITY`);
    }
    await db.exec(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'rls_tasks_event_member'
        ) THEN
          CREATE POLICY rls_tasks_event_member ON tasks
            USING (
              event_id IN (
                SELECT event_id FROM event_members
                WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
              )
            );
        END IF;
      END $$;
    `);
    await db.exec(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'expenses' AND policyname = 'rls_expenses_event_member'
        ) THEN
          CREATE POLICY rls_expenses_event_member ON expenses
            USING (
              event_id IN (
                SELECT event_id FROM event_members
                WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
              )
            );
        END IF;
      END $$;
    `);
    await db.exec(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'vendors' AND policyname = 'rls_vendors_event_member'
        ) THEN
          CREATE POLICY rls_vendors_event_member ON vendors
            USING (
              event_id IN (
                SELECT event_id FROM event_members
                WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
              )
            );
        END IF;
      END $$;
    `);
    await db.exec(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'rsvps' AND policyname = 'rls_rsvps_access'
        ) THEN
          CREATE POLICY rls_rsvps_access ON rsvps
            USING (
              event_id IN (
                SELECT event_id FROM event_members
                WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
                  AND LOWER(role) IN ('organizer', 'admin', 'collaborator', 'owner', 'co-organizer', 'helper')
              )
            );
        END IF;
      END $$;
    `);
    console.log('[RLS] RLS v2 policies applied.');
  }

  // ── Guest merge audit (#411, #435) ───────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS guest_merge_audit (
      id                 SERIAL PRIMARY KEY,
      event_id           INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      surviving_rsvp_id  INTEGER REFERENCES rsvps(id) ON DELETE SET NULL,
      merged_rsvp_id     INTEGER NOT NULL,
      merged_email       TEXT NOT NULL,
      merged_name        TEXT NOT NULL,
      merged_snapshot    JSONB NOT NULL,
      merged_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
      merged_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      notes              TEXT
    )
  `);
  await db.exec(
    `CREATE INDEX IF NOT EXISTS idx_guest_merge_audit_event_id ON guest_merge_audit(event_id)`,
  );
  await db.exec(
    `CREATE INDEX IF NOT EXISTS idx_guest_merge_audit_surviving ON guest_merge_audit(surviving_rsvp_id)`,
  );

  // ── RSVP access tokens for QR codes (#411, #437) ──────────────────────────
  // A stable per-RSVP token used to render QR codes that link to the guest
  // RSVP page. Tokens are opaque and can be rotated independently.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS rsvp_access_tokens (
      rsvp_id      INTEGER PRIMARY KEY REFERENCES rsvps(id) ON DELETE CASCADE,
      token        TEXT NOT NULL UNIQUE,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      revoked_at   TIMESTAMP
    )
  `);
  await db.exec(
    `CREATE INDEX IF NOT EXISTS idx_rsvp_access_tokens_token ON rsvp_access_tokens(token) WHERE revoked_at IS NULL`,
  );

  // ── Waitlist columns on rsvps (#413, #442) ────────────────────────────────
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS waitlist_position INTEGER`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS waitlisted_at TIMESTAMP`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMP`);
  await db.exec(
    `CREATE INDEX IF NOT EXISTS idx_rsvps_event_waitlist ON rsvps(event_id, waitlist_position) WHERE waitlist_position IS NOT NULL`,
  );

  // ── Custom RSVP questions (#413, #443) ────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS rsvp_questions (
      id            SERIAL PRIMARY KEY,
      event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      prompt        TEXT NOT NULL,
      question_type TEXT NOT NULL CHECK (question_type IN ('short_text','long_text','single_choice','multi_choice','number','boolean')),
      options       JSONB,
      required      BOOLEAN DEFAULT FALSE,
      sort_order    INTEGER DEFAULT 0,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.exec(
    `CREATE INDEX IF NOT EXISTS idx_rsvp_questions_event_id ON rsvp_questions(event_id)`,
  );

  await db.exec(`
    CREATE TABLE IF NOT EXISTS rsvp_question_responses (
      id          SERIAL PRIMARY KEY,
      rsvp_id     INTEGER NOT NULL REFERENCES rsvps(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES rsvp_questions(id) ON DELETE CASCADE,
      response    TEXT,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (rsvp_id, question_id)
    )
  `);
  await db.exec(
    `CREATE INDEX IF NOT EXISTS idx_rsvp_question_responses_rsvp ON rsvp_question_responses(rsvp_id)`,
  );

  // ── Planned-vs-actual timeline workflow (#460) ───────────────────────────
  await db.exec(`ALTER TABLE timeline_activities ADD COLUMN IF NOT EXISTS planned_start_time TIMESTAMP`);
  await db.exec(`ALTER TABLE timeline_activities ADD COLUMN IF NOT EXISTS planned_end_time TIMESTAMP`);
  await db.exec(`ALTER TABLE timeline_activities ADD COLUMN IF NOT EXISTS actual_start_time TIMESTAMP`);
  await db.exec(`ALTER TABLE timeline_activities ADD COLUMN IF NOT EXISTS actual_end_time TIMESTAMP`);
  await db.exec(`ALTER TABLE timeline_activities ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'planned' CHECK (status IN ('planned','in-progress','completed','skipped'))`);

  // ── Currency & exchange rates (#418, #461) ────────────────────────────────
  await db.exec(`ALTER TABLE events ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'USD'`);
  await db.exec(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS currency_code TEXT`);
  await db.exec(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS amount_base NUMERIC(14,4)`);
  await db.exec(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,8)`);
  await db.exec(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await db.exec(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending'`);
  await db.exec(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approval_note TEXT`);
  await db.exec(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await db.exec(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP`);
  await db.exec(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reimbursement_status TEXT NOT NULL DEFAULT 'not_requested'`);
  await db.exec(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reimbursement_requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await db.exec(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reimbursement_requested_at TIMESTAMP`);
  await db.exec(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reimbursed_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await db.exec(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reimbursed_at TIMESTAMP`);
  await db.exec(`ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_approval_status_check`);
  await db.exec(`ALTER TABLE expenses ADD CONSTRAINT expenses_approval_status_check CHECK (approval_status IN ('pending','approved','rejected'))`);
  await db.exec(`ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_reimbursement_status_check`);
  await db.exec(`ALTER TABLE expenses ADD CONSTRAINT expenses_reimbursement_status_check CHECK (reimbursement_status IN ('not_requested','requested','reimbursed','rejected'))`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS expense_workflow_events (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      from_state TEXT,
      to_state TEXT,
      note TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_expense_workflow_events_event_id ON expense_workflow_events(event_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_expense_workflow_events_expense_id ON expense_workflow_events(expense_id)`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS expense_receipt_ocr (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
      receipt_text TEXT NOT NULL,
      extracted_title TEXT,
      extracted_amount NUMERIC(10,2),
      extracted_vendor_name TEXT,
      extracted_date TEXT,
      confidence NUMERIC(4,3) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'extracted',
      error_code TEXT,
      error_message TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      applied_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      applied_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CHECK (status IN ('extracted','applied','failed')),
      CHECK (confidence >= 0 AND confidence <= 1)
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_expense_receipt_ocr_event_id ON expense_receipt_ocr(event_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_expense_receipt_ocr_expense_id ON expense_receipt_ocr(expense_id)`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS expense_reconciliation_logs (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
      ocr_id INTEGER NOT NULL REFERENCES expense_receipt_ocr(id) ON DELETE RESTRICT,
      before_data JSONB NOT NULL,
      extracted_data JSONB NOT NULL,
      applied_data JSONB NOT NULL,
      overrides_count INTEGER NOT NULL DEFAULT 0,
      override_reason TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      updated_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CHECK (overrides_count >= 0)
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_expense_reconciliation_logs_event_id ON expense_reconciliation_logs(event_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_expense_reconciliation_logs_expense_id ON expense_reconciliation_logs(expense_id)`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS exchange_rates (
      base_currency  TEXT NOT NULL,
      quote_currency TEXT NOT NULL,
      rate           NUMERIC(18,8) NOT NULL CHECK (rate > 0),
      source         TEXT NOT NULL DEFAULT 'manual',
      fetched_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (base_currency, quote_currency)
    )
  `);

  // ─── Pre-BRD v2 tables mirrored from init.sql (#417, #459, #432, #454) ────
  // These tables exist in init.sql but were not previously mirrored in the
  // runtime migration. BRD v2 (#619, #579) adds FKs into them, so they must
  // precede the BRD v2 section to keep the runtime migration self-contained
  // on fresh databases (e.g. CI integration tests).
  await db.exec(`
    CREATE TABLE IF NOT EXISTS event_templates (
      id           SERIAL PRIMARY KEY,
      name         TEXT NOT NULL,
      description  TEXT,
      default_title TEXT,
      default_location TEXT,
      default_capacity INTEGER,
      default_event_type TEXT,
      default_status   TEXT DEFAULT 'Draft',
      default_tags TEXT,
      default_is_public BOOLEAN DEFAULT FALSE,
      default_waitlist_enabled BOOLEAN DEFAULT FALSE,
      created_by   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      deleted_at   TIMESTAMP
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_event_templates_created_by ON event_templates(created_by)`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS event_filter_presets (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      filters     TEXT NOT NULL,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_event_filter_presets_user ON event_filter_presets(user_id)`);
  await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_event_filter_presets_user_name ON event_filter_presets(user_id, name)`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS gallery_albums (
      id          SERIAL PRIMARY KEY,
      event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      description TEXT,
      created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_gallery_albums_event_id ON gallery_albums(event_id)`);

  await db.exec(`ALTER TABLE event_documents ADD COLUMN IF NOT EXISTS album_id INTEGER REFERENCES gallery_albums(id) ON DELETE SET NULL`);
  await db.exec(`ALTER TABLE event_documents ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'approved'`);
  await db.exec(`ALTER TABLE event_documents ADD COLUMN IF NOT EXISTS submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_event_documents_album_id ON event_documents(album_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_event_documents_moderation ON event_documents(event_id, moderation_status)`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS gallery_slideshows (
      id          SERIAL PRIMARY KEY,
      event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_gallery_slideshows_event_id ON gallery_slideshows(event_id)`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS slideshow_items (
      id           SERIAL PRIMARY KEY,
      slideshow_id INTEGER NOT NULL REFERENCES gallery_slideshows(id) ON DELETE CASCADE,
      document_id  INTEGER NOT NULL REFERENCES event_documents(id) ON DELETE CASCADE,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      UNIQUE (slideshow_id, document_id)
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_slideshow_items_slideshow_id ON slideshow_items(slideshow_id)`);

  // ─── BRD v2 parity: lifecycle, archive, custom fields, gallery, reports ────
  // Stories #528, #533 — tasks #539-#542, #560-#563, #574-#581, #617-#622.

  // Widen the event status constraint to full BRD v2 lifecycle (#575).
  await db.exec(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_status_check') THEN
        ALTER TABLE events DROP CONSTRAINT events_status_check;
      END IF;
    END $$
  `);
  await db.exec(`
    ALTER TABLE events ADD CONSTRAINT events_status_check
      CHECK (status IN ('Draft','Planning','Confirmed','Active','Completed','Cancelled'))
  `);

  // Archival fields distinct from soft-delete (#540, #578).
  await db.exec(`ALTER TABLE events ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP`);
  await db.exec(`ALTER TABLE events ADD COLUMN IF NOT EXISTS archived_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await db.exec(`ALTER TABLE events ADD COLUMN IF NOT EXISTS archive_reason TEXT`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_events_archived_at ON events(archived_at) WHERE archived_at IS NOT NULL`);

  // Audit field (#542) — who last updated the event.
  await db.exec(`ALTER TABLE events ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);

  // Gallery permission flags per-event (#618, #621).
  await db.exec(`ALTER TABLE events ADD COLUMN IF NOT EXISTS gallery_comments_enabled BOOLEAN NOT NULL DEFAULT TRUE`);
  await db.exec(`ALTER TABLE events ADD COLUMN IF NOT EXISTS gallery_guest_uploads BOOLEAN NOT NULL DEFAULT FALSE`);
  await db.exec(`ALTER TABLE events ADD COLUMN IF NOT EXISTS gallery_public BOOLEAN NOT NULL DEFAULT FALSE`);

  // Storage quota (#622) — bytes, default 500MB.
  await db.exec(`ALTER TABLE events ADD COLUMN IF NOT EXISTS storage_quota_bytes BIGINT NOT NULL DEFAULT 524288000`);
  await db.exec(`ALTER TABLE events ADD COLUMN IF NOT EXISTS storage_used_bytes BIGINT NOT NULL DEFAULT 0`);

  // Cover image resize pipeline (#541, #576).
  await db.exec(`ALTER TABLE events ADD COLUMN IF NOT EXISTS cover_image_sizes JSONB`);

  // Event custom fields (#577).
  await db.exec(`
    CREATE TABLE IF NOT EXISTS event_custom_fields (
      id          SERIAL PRIMARY KEY,
      event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      field_key   TEXT NOT NULL,
      label       TEXT NOT NULL,
      field_type  TEXT NOT NULL CHECK (field_type IN ('text','number','boolean','date','url','select')),
      options     JSONB,
      value       TEXT,
      required    BOOLEAN NOT NULL DEFAULT FALSE,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (event_id, field_key)
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_event_custom_fields_event_id ON event_custom_fields(event_id)`);

  // Gallery per-photo permissions + conversion metadata (#560, #617, #618).
  await db.exec(`ALTER TABLE event_documents ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'event'`);
  await db.exec(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_documents_visibility_check') THEN
        ALTER TABLE event_documents DROP CONSTRAINT event_documents_visibility_check;
      END IF;
    END $$
  `);
  await db.exec(`
    ALTER TABLE event_documents ADD CONSTRAINT event_documents_visibility_check
      CHECK (visibility IN ('private','event','public'))
  `);
  await db.exec(`ALTER TABLE event_documents ADD COLUMN IF NOT EXISTS allow_download BOOLEAN NOT NULL DEFAULT TRUE`);
  await db.exec(`ALTER TABLE event_documents ADD COLUMN IF NOT EXISTS allow_comments BOOLEAN NOT NULL DEFAULT TRUE`);
  await db.exec(`ALTER TABLE event_documents ADD COLUMN IF NOT EXISTS conversion_status TEXT NOT NULL DEFAULT 'none'`);
  await db.exec(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_documents_conversion_status_check') THEN
        ALTER TABLE event_documents DROP CONSTRAINT event_documents_conversion_status_check;
      END IF;
    END $$
  `);
  await db.exec(`
    ALTER TABLE event_documents ADD CONSTRAINT event_documents_conversion_status_check
      CHECK (conversion_status IN ('none','pending','converted','failed'))
  `);
  await db.exec(`ALTER TABLE event_documents ADD COLUMN IF NOT EXISTS original_format TEXT`);
  await db.exec(`ALTER TABLE event_documents ADD COLUMN IF NOT EXISTS converted_file_name TEXT`);
  await db.exec(`ALTER TABLE event_documents ADD COLUMN IF NOT EXISTS thumbnail_url TEXT`);
  await db.exec(`ALTER TABLE event_documents ADD COLUMN IF NOT EXISTS medium_url TEXT`);
  await db.exec(`ALTER TABLE event_documents ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_event_documents_visibility ON event_documents(event_id, visibility)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_event_documents_conversion ON event_documents(conversion_status) WHERE conversion_status <> 'none'`);

  // Gallery share links (#619).
  await db.exec(`
    CREATE TABLE IF NOT EXISTS gallery_share_links (
      id              SERIAL PRIMARY KEY,
      event_id        INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      album_id        INTEGER REFERENCES gallery_albums(id) ON DELETE CASCADE,
      token           TEXT NOT NULL UNIQUE,
      password_hash   TEXT,
      allow_download  BOOLEAN NOT NULL DEFAULT TRUE,
      expires_at      TIMESTAMP,
      view_count      INTEGER NOT NULL DEFAULT 0,
      last_viewed_at  TIMESTAMP,
      revoked_at      TIMESTAMP,
      created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_gallery_share_links_event_id ON gallery_share_links(event_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_gallery_share_links_album_id ON gallery_share_links(album_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_gallery_share_links_token_active ON gallery_share_links(token) WHERE revoked_at IS NULL`);

  // Gallery comments (#621).
  await db.exec(`
    CREATE TABLE IF NOT EXISTS gallery_comments (
      id           SERIAL PRIMARY KEY,
      event_id     INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      document_id  INTEGER NOT NULL REFERENCES event_documents(id) ON DELETE CASCADE,
      parent_id    INTEGER REFERENCES gallery_comments(id) ON DELETE CASCADE,
      user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      body         TEXT NOT NULL CHECK (length(body) <= 2000),
      is_hidden    BOOLEAN NOT NULL DEFAULT FALSE,
      hidden_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      hidden_at    TIMESTAMP,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_by   INTEGER REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_gallery_comments_document_id ON gallery_comments(document_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_gallery_comments_event_id ON gallery_comments(event_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_gallery_comments_parent_id ON gallery_comments(parent_id)`);

  // Scheduled reports (#562).
  await db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_reports (
      id            SERIAL PRIMARY KEY,
      event_id      INTEGER REFERENCES events(id) ON DELETE CASCADE,
      report_type   TEXT NOT NULL CHECK (report_type IN ('rsvp_summary','budget_summary','task_summary','storage_summary','full')),
      frequency     TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly')),
      recipients    JSONB NOT NULL DEFAULT '[]'::jsonb,
      filters       JSONB,
      next_run_at   TIMESTAMP,
      last_run_at   TIMESTAMP,
      is_active     BOOLEAN NOT NULL DEFAULT TRUE,
      created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_scheduled_reports_event_id ON scheduled_reports(event_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_scheduled_reports_due ON scheduled_reports(next_run_at) WHERE is_active = TRUE`);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_report_deliveries (
      id            SERIAL PRIMARY KEY,
      report_id     INTEGER NOT NULL REFERENCES scheduled_reports(id) ON DELETE CASCADE,
      delivered_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      recipients    JSONB NOT NULL DEFAULT '[]'::jsonb,
      status        TEXT NOT NULL CHECK (status IN ('success','partial','failed')),
      error_message TEXT,
      payload_kind  TEXT NOT NULL DEFAULT 'json'
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_scheduled_report_deliveries_report_id ON scheduled_report_deliveries(report_id)`);

  // Event template depth (#579).
  await db.exec(`
    CREATE TABLE IF NOT EXISTS event_template_sections (
      id            SERIAL PRIMARY KEY,
      template_id   INTEGER NOT NULL REFERENCES event_templates(id) ON DELETE CASCADE,
      section_key   TEXT NOT NULL CHECK (section_key IN ('tasks','budget','timeline','custom_fields','vendors','shopping','rsvp_questions')),
      payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (template_id, section_key)
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_event_template_sections_template_id ON event_template_sections(template_id)`);

  // ── Guest profile completeness fields (#529, #543, #547, #582) ────────────
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS address_line1 TEXT`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS address_line2 TEXT`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS city TEXT`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS state_region TEXT`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS postal_code TEXT`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS country TEXT`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS company TEXT`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS title TEXT`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS relation_type TEXT`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS age_group TEXT`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS profile_completeness INTEGER DEFAULT 0`);

  // ── RSVP taxonomy alignment (#544, #584) ─────────────────────────────────
  // Add canonical_status that maps legacy free-text status to the BRD/FRD set:
  // pending | confirmed | declined | maybe | waitlist | cancelled | checked_in | no_show
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS canonical_status TEXT`);
  await db.exec(
    `CREATE INDEX IF NOT EXISTS idx_rsvps_canonical_status ON rsvps(event_id, canonical_status)`,
  );

  // ── Meal selection (#591) ────────────────────────────────────────────────
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS meal_choice TEXT`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS meal_options_locked BOOLEAN DEFAULT FALSE`);

  // ── Late arrival flag (#594) ─────────────────────────────────────────────
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS late_arrival BOOLEAN DEFAULT FALSE`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS arrival_delay_minutes INTEGER`);

  // ── Unsubscribe / communication preferences (#545, #590) ─────────────────
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMP`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS unsubscribe_token TEXT`);
  await db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_rsvps_unsubscribe_token ON rsvps(unsubscribe_token) WHERE unsubscribe_token IS NOT NULL`,
  );

  // Per-event meal catalog (#591)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS event_meal_options (
      id         SERIAL PRIMARY KEY,
      event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      description TEXT,
      is_active  BOOLEAN DEFAULT TRUE,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (event_id, name)
    )
  `);
  await db.exec(
    `CREATE INDEX IF NOT EXISTS idx_event_meal_options_event ON event_meal_options(event_id)`,
  );

  // ── Communication templates (#590) ───────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS communication_templates (
      id         SERIAL PRIMARY KEY,
      event_id   INTEGER REFERENCES events(id) ON DELETE CASCADE,
      slug       TEXT NOT NULL,
      name       TEXT NOT NULL,
      subject    TEXT NOT NULL,
      body       TEXT NOT NULL,
      is_default BOOLEAN DEFAULT FALSE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (event_id, slug)
    )
  `);
  await db.exec(
    `CREATE INDEX IF NOT EXISTS idx_comm_templates_event ON communication_templates(event_id)`,
  );

  // ── Attendance audit log (#594, #595) — every scan/check-in event ────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS attendance_events (
      id           SERIAL PRIMARY KEY,
      event_id     INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      rsvp_id      INTEGER NOT NULL REFERENCES rsvps(id) ON DELETE CASCADE,
      action       TEXT NOT NULL CHECK (action IN ('checked_in','undo_checkin','scanned','no_show')),
      source       TEXT NOT NULL DEFAULT 'manual',
      occurred_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      actor_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      metadata     JSONB
    )
  `);
  await db.exec(
    `CREATE INDEX IF NOT EXISTS idx_attendance_events_event ON attendance_events(event_id, occurred_at DESC)`,
  );

  // ── Group seating (#593) ─────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS seating_groups (
      id          SERIAL PRIMARY KEY,
      event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      seat_together BOOLEAN DEFAULT TRUE,
      preferred_table_id INTEGER REFERENCES seating_tables(id) ON DELETE SET NULL,
      notes       TEXT,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (event_id, name)
    )
  `);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS seating_group_id INTEGER`);
  await db.exec(
    `CREATE INDEX IF NOT EXISTS idx_rsvps_seating_group ON rsvps(seating_group_id)`,
  );

  // Backfill canonical_status from legacy free-text status on first run.
  await db.exec(`
    UPDATE rsvps SET canonical_status = CASE
      WHEN canonical_status IS NOT NULL THEN canonical_status
      WHEN waitlist_position IS NOT NULL THEN 'waitlist'
      WHEN checked_in = TRUE THEN 'checked_in'
      WHEN LOWER(status) IN ('going','yes','confirmed','accepted') THEN 'confirmed'
      WHEN LOWER(status) IN ('not going','declined','no','rejected') THEN 'declined'
      WHEN LOWER(status) IN ('maybe','tentative') THEN 'maybe'
      WHEN LOWER(status) IN ('cancelled','canceled') THEN 'cancelled'
      WHEN LOWER(status) IN ('pending','invited','sent') THEN 'pending'
      ELSE 'pending'
    END
    WHERE canonical_status IS NULL OR canonical_status = ''
  `);
}
