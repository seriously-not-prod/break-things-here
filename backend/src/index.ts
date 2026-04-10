import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcrypt';
import { initializeDatabase, getDatabase } from './db/database.js';
import apiRouter from './routes/api-routes.js';

const app = express();
const port = parseInt(process.env.PORT || '4000', 10);

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3000'] }));
app.use(express.json());
app.use(limiter);

// ── Mount existing auth/profile/rbac routes ────────────────────────────────
app.use('/api', apiRouter);

// ── Health ─────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'healthy', uptime: process.uptime() });
});

// ── Dashboard stats ────────────────────────────────────────────────────────
app.get('/api/dashboard/stats', async (_req, res) => {
  const db = getDatabase();
  const [users, projects, tasks, completed] = await Promise.all([
    db.get<{ count: number }>('SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL'),
    db.get<{ count: number }>('SELECT COUNT(*) as count FROM projects'),
    db.get<{ count: number }>('SELECT COUNT(*) as count FROM tasks'),
    db.get<{ count: number }>(`SELECT COUNT(*) as count FROM tasks WHERE status = 'done'`),
  ]);
  res.json({
    totalUsers: users?.count ?? 0,
    totalProjects: projects?.count ?? 0,
    totalTasks: tasks?.count ?? 0,
    completedTasks: completed?.count ?? 0,
  });
});

// ── Projects ───────────────────────────────────────────────────────────────
app.get('/api/projects', async (_req, res) => {
  const db = getDatabase();
  const rows = await db.all(`
    SELECT p.*, u.display_name as owner_name
    FROM projects p
    LEFT JOIN users u ON u.id = p.owner_id
    ORDER BY p.created_at DESC
  `);
  res.json(rows);
});

app.post('/api/projects', async (req, res) => {
  const { title, description, status, owner_id } = req.body;
  if (!title) { res.status(400).json({ error: 'title is required' }); return; }
  const db = getDatabase();
  const result = await db.run(
    `INSERT INTO projects (title, description, status, owner_id) VALUES (?, ?, ?, ?)`,
    [title, description ?? null, status ?? 'active', owner_id ?? null],
  );
  const row = await db.get('SELECT * FROM projects WHERE id = ?', [result.lastID]);
  // log activity
  await db.run(
    `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, description) VALUES (?,?,?,?,?)`,
    [owner_id ?? null, 'created', 'project', result.lastID, `Created project: ${title}`],
  );
  res.status(201).json(row);
});

app.get('/api/projects/:id', async (req, res) => {
  const db = getDatabase();
  const row = await db.get(`
    SELECT p.*, u.display_name as owner_name
    FROM projects p LEFT JOIN users u ON u.id = p.owner_id
    WHERE p.id = ?`, [req.params.id]);
  if (!row) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(row);
});

app.put('/api/projects/:id', async (req, res) => {
  const { title, description, status } = req.body;
  const db = getDatabase();
  await db.run(
    `UPDATE projects SET title=COALESCE(?,title), description=COALESCE(?,description),
     status=COALESCE(?,status), updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [title ?? null, description ?? null, status ?? null, req.params.id],
  );
  const row = await db.get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
  res.json(row);
});

app.delete('/api/projects/:id', async (req, res) => {
  const db = getDatabase();
  await db.run('DELETE FROM projects WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ── Tasks ──────────────────────────────────────────────────────────────────
app.get('/api/tasks', async (req, res) => {
  const db = getDatabase();
  const projectId = req.query.project_id;
  const rows = await db.all(`
    SELECT t.*, u.display_name as assignee_name, p.title as project_title
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assignee_id
    LEFT JOIN projects p ON p.id = t.project_id
    ${projectId ? 'WHERE t.project_id = ?' : ''}
    ORDER BY t.created_at DESC
  `, projectId ? [projectId] : []);
  res.json(rows);
});

app.post('/api/tasks', async (req, res) => {
  const { title, description, status, priority, project_id, assignee_id } = req.body;
  if (!title) { res.status(400).json({ error: 'title is required' }); return; }
  const db = getDatabase();
  const result = await db.run(
    `INSERT INTO tasks (title, description, status, priority, project_id, assignee_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [title, description ?? null, status ?? 'todo', priority ?? 'medium',
     project_id ?? null, assignee_id ?? null],
  );
  const row = await db.get(`
    SELECT t.*, u.display_name as assignee_name, p.title as project_title
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assignee_id
    LEFT JOIN projects p ON p.id = t.project_id
    WHERE t.id = ?`, [result.lastID]);
  await db.run(
    `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, description) VALUES (?,?,?,?,?)`,
    [assignee_id ?? null, 'created', 'task', result.lastID, `Created task: ${title}`],
  );
  res.status(201).json(row);
});

app.put('/api/tasks/:id', async (req, res) => {
  const { title, description, status, priority, assignee_id } = req.body;
  const db = getDatabase();
  await db.run(
    `UPDATE tasks SET
      title=COALESCE(?,title), description=COALESCE(?,description),
      status=COALESCE(?,status), priority=COALESCE(?,priority),
      assignee_id=COALESCE(?,assignee_id), updated_at=CURRENT_TIMESTAMP
     WHERE id=?`,
    [title??null, description??null, status??null, priority??null, assignee_id??null, req.params.id],
  );
  const row = await db.get(`
    SELECT t.*, u.display_name as assignee_name, p.title as project_title
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assignee_id
    LEFT JOIN projects p ON p.id = t.project_id
    WHERE t.id = ?`, [req.params.id]);
  res.json(row);
});

app.delete('/api/tasks/:id', async (req, res) => {
  const db = getDatabase();
  await db.run('DELETE FROM tasks WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ── Activity Logs ──────────────────────────────────────────────────────────
app.get('/api/activity-logs', async (_req, res) => {
  const db = getDatabase();
  const rows = await db.all(`
    SELECT a.*, u.display_name as user_name, u.email as user_email
    FROM activity_logs a
    LEFT JOIN users u ON u.id = a.user_id
    ORDER BY a.created_at DESC
    LIMIT 100
  `);
  res.json(rows);
});

// ── Users list (admin) ─────────────────────────────────────────────────────
app.get('/api/users', async (_req, res) => {
  const db = getDatabase();
  const rows = await db.all(`
    SELECT u.id, u.email, u.display_name, u.created_at, u.email_verified,
           r.name as role_name
    FROM users u
    LEFT JOIN roles r ON r.id = u.role_id
    WHERE u.deleted_at IS NULL
    ORDER BY u.created_at DESC
  `);
  res.json(rows);
});

// ── Bootstrap DB and seed ──────────────────────────────────────────────────
async function bootstrap() {
  await initializeDatabase();
  const db = getDatabase();

  // Extend schema with projects, tasks, activity_logs
  await db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'active',
      owner_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'todo',
      priority TEXT DEFAULT 'medium',
      project_id INTEGER,
      assignee_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  // Seed default users
  const adminExists = await db.get('SELECT id FROM users WHERE email = ?', ['admin@example.com']);
  if (!adminExists) {
    const adminHash = await bcrypt.hash('Admin@123', 12);
    await db.run(
      `INSERT INTO users (email, password_hash, display_name, email_verified, role_id)
       VALUES (?, ?, ?, 1, 3)`,
      ['admin@example.com', adminHash, 'Alice Admin'],
    );
    const userHash = await bcrypt.hash('User@123', 12);
    await db.run(
      `INSERT INTO users (email, password_hash, display_name, email_verified, role_id)
       VALUES (?, ?, ?, 1, 1)`,
      ['user@example.com', userHash, 'Bob User'],
    );
    const devHash = await bcrypt.hash('Dev@12345', 12);
    await db.run(
      `INSERT INTO users (email, password_hash, display_name, email_verified, role_id)
       VALUES (?, ?, ?, 1, 2)`,
      ['dev@example.com', devHash, 'Carol Dev'],
    );
    console.log('✓ Seeded default users');
  }

  // Seed projects
  const projExists = await db.get('SELECT id FROM projects LIMIT 1');
  if (!projExists) {
    const admin = await db.get<{ id: number }>('SELECT id FROM users WHERE email = ?', ['admin@example.com']);
    const user  = await db.get<{ id: number }>('SELECT id FROM users WHERE email = ?', ['user@example.com']);
    const adminId = admin!.id;
    const userId  = user!.id;

    await db.run(`INSERT INTO projects (title, description, status, owner_id) VALUES (?,?,?,?)`,
      ['Festival App MVP', 'Core user management and event planning features.', 'active', adminId]);
    await db.run(`INSERT INTO projects (title, description, status, owner_id) VALUES (?,?,?,?)`,
      ['Marketing Site', 'Landing page and promotional materials.', 'active', userId]);

    const p1 = await db.get<{ id: number }>(`SELECT id FROM projects WHERE title = 'Festival App MVP'`);
    const p2 = await db.get<{ id: number }>(`SELECT id FROM projects WHERE title = 'Marketing Site'`);

    const tasks = [
      ['Design login flow', 'Create wireframes and implement login UI', 'done', 'high', p1!.id, adminId],
      ['Build REST API', 'Implement auth, users and project endpoints', 'done', 'high', p1!.id, adminId],
      ['User profile page', 'Allow users to edit their profile and photo', 'in_progress', 'medium', p1!.id, userId],
      ['Dashboard analytics', 'Summary cards and activity feed on dashboard', 'todo', 'medium', p1!.id, userId],
      ['Write unit tests', 'Vitest unit tests for all controllers', 'todo', 'low', p1!.id, adminId],
      ['Create hero section', 'Animated hero with CTA and feature highlights', 'in_progress', 'high', p2!.id, userId],
      ['SEO meta tags', 'Add dynamic meta descriptions and OG images', 'todo', 'low', p2!.id, userId],
      ['Email capture form', 'Newsletter signup with validation', 'todo', 'medium', p2!.id, adminId],
    ];

    for (const [title, desc, status, priority, pid, aid] of tasks) {
      await db.run(
        `INSERT INTO tasks (title, description, status, priority, project_id, assignee_id) VALUES (?,?,?,?,?,?)`,
        [title, desc, status, priority, pid, aid],
      );
    }

    // Seed activity logs
    const entries = [
      [adminId, 'login', null, null, 'Alice Admin logged in'],
      [adminId, 'created', 'project', p1!.id, 'Created project: Festival App MVP'],
      [userId,  'created', 'project', p2!.id, 'Created project: Marketing Site'],
      [adminId, 'completed', 'task', 1, 'Completed task: Design login flow'],
      [userId,  'updated', 'task', 3, 'Updated task: User profile page'],
    ];
    for (const [uid, action, etype, eid, desc] of entries) {
      await db.run(
        `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, description) VALUES (?,?,?,?,?)`,
        [uid, action, etype, eid, desc],
      );
    }
    console.log('✓ Seeded projects, tasks, and activity logs');
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Festival Planner API running on http://localhost:${port}`);
    console.log('   Admin: admin@example.com / Admin@123');
    console.log('   User:  user@example.com  / User@123');
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
