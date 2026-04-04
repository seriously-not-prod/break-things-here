import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db: Database | null = null;

export async function initializeDatabase(): Promise<Database> {
  if (db) {
    return db;
  }

  const dbPath = process.env.DATABASE_URL || path.join(__dirname, '../../festival-planner.db');

  db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  await db.exec('PRAGMA foreign_keys = ON');

  // Create tables
  await createTables();

  return db;
}

async function createTables(): Promise<void> {
  if (!db) throw new Error('Database not initialized');

  // Roles table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Permissions table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Role-Permission mapping
  await db.exec(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INTEGER NOT NULL,
      permission_id INTEGER NOT NULL,
      PRIMARY KEY (role_id, permission_id),
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
      FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
    )
  `);

  // Users table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      email_verified BOOLEAN DEFAULT 0,
      email_verified_at DATETIME,
      email_verification_token TEXT,
      account_locked BOOLEAN DEFAULT 0,
      locked_until DATETIME,
      login_attempts INTEGER DEFAULT 0,
      role_id INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME,
      FOREIGN KEY (role_id) REFERENCES roles(id)
    )
  `);

  // User profiles table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      bio TEXT,
      phone_number TEXT,
      profile_photo_url TEXT,
      date_of_birth DATE,
      address TEXT,
      city TEXT,
      state TEXT,
      zip_code TEXT,
      country TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Session table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      refresh_token TEXT UNIQUE,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Migration: add pending email change columns if not present (issue #37)
  await db.exec(`
    ALTER TABLE users ADD COLUMN pending_email TEXT
  `).catch(() => { /* column already exists */ });
  await db.exec(`
    ALTER TABLE users ADD COLUMN pending_email_token TEXT
  `).catch(() => { /* column already exists */ });
  await db.exec(`
    ALTER TABLE users ADD COLUMN pending_email_token_expiry DATETIME
  `).catch(() => { /* column already exists */ });

  // Seed default roles if they don't exist
  const adminRoleExists = await db.get('SELECT id FROM roles WHERE name = ?', ['Admin']);
  if (!adminRoleExists) {
    await db.run('INSERT INTO roles (name, description) VALUES (?, ?)', [
      'Admin',
      'Full access to the platform',
    ]);
    await db.run('INSERT INTO roles (name, description) VALUES (?, ?)', [
      'Organizer',
      'Can create and manage events',
    ]);
    await db.run('INSERT INTO roles (name, description) VALUES (?, ?)', [
      'Attendee',
      'Can browse and register for events',
    ]);
  }

  // Seed default permissions if they don't exist
  const permissionsExist = await db.get('SELECT id FROM permissions LIMIT 1');
  if (!permissionsExist) {
    const permissions = [
      { name: 'users.create', description: 'Create new users' },
      { name: 'users.read', description: 'View users' },
      { name: 'users.update', description: 'Update user information' },
      { name: 'users.delete', description: 'Delete users' },
      { name: 'roles.manage', description: 'Manage roles and permissions' },
      { name: 'events.create', description: 'Create events' },
      { name: 'events.update', description: 'Update events' },
      { name: 'events.delete', description: 'Delete events' },
      { name: 'events.read', description: 'View events' },
    ];

    for (const perm of permissions) {
      await db.run('INSERT INTO permissions (name, description) VALUES (?, ?)', [
        perm.name,
        perm.description,
      ]);
    }
  }
}

export function getDatabase(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
  }
}
