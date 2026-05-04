#!/usr/bin/env node
/**
 * Seed admin and regular test users into the PostgreSQL database.
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/seed-admin-pg.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/festival_planner';

const USERS = [
  {
    email: 'admin@festival.local',
    password: 'Admin1234!',
    displayName: 'Admin User',
    roleId: 3, // Admin
  },
  {
    email: 'organizer@festival.local',
    password: 'Organizer1!',
    displayName: 'Event Organizer',
    roleId: 2, // Organizer
  },
  {
    email: 'user@festival.local',
    password: 'User1234!',
    displayName: 'Test Attendee',
    roleId: 1, // Attendee
  },
];

const pool = new Pool({ connectionString: DATABASE_URL });

async function upsertUser({ email, password, displayName, roleId }) {
  const hash = await bcrypt.hash(password, 12);

  const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);

  if (existing.rows.length > 0) {
    await pool.query(
      `UPDATE users
         SET password_hash = $1, display_name = $2, email_verified = 1,
             role_id = $3, account_locked = 0, login_attempts = 0,
             updated_at = CURRENT_TIMESTAMP
       WHERE LOWER(email) = LOWER($4)`,
      [hash, displayName, roleId, email],
    );
    console.log(`  ✅ Updated   ${email}`);
  } else {
    await pool.query(
      `INSERT INTO users (email, password_hash, display_name, email_verified, role_id, account_locked, login_attempts)
       VALUES ($1, $2, $3, 1, $4, 0, 0)`,
      [email, hash, displayName, roleId],
    );
    console.log(`  ✅ Created   ${email}`);
  }
}

async function main() {
  console.log(`\nSeeding users into: ${DATABASE_URL}\n`);
  for (const u of USERS) {
    await upsertUser(u);
  }

  const { rows } = await pool.query(`
    SELECT u.id, u.email, u.display_name, r.name AS role, u.email_verified, u.account_locked
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
     ORDER BY u.id
  `);
  console.log('\nCurrent users:');
  console.table(rows);

  console.log('\nLogin credentials:');
  for (const u of USERS) {
    console.log(`  ${u.email}  /  ${u.password}`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
