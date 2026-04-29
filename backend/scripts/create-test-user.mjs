#!/usr/bin/env node
/**
 * Create a test user for development
 * Usage: node scripts/create-test-user.mjs
 */

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import bcrypt from 'bcrypt';

async function createTestUser() {
  const dbPath = './database/dev.sqlite';
  
  console.log('📝 Creating test user...\n');
  
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  // Test user credentials
  const testUsers = [
    {
      email: 'admin@festival.local',
      password: 'festivalAdmin2025',
      displayName: 'Admin User',
      roleId: 3, // Admin role
    },
    {
      email: 'user@festival.local',
      password: 'userPass2025',
      displayName: 'Test User',
      roleId: 1, // Attendee role
    },
  ];

  for (const user of testUsers) {
    // Check if user already exists
    const existing = await db.get(
      'SELECT id, email FROM users WHERE email = ?',
      [user.email]
    );

    if (existing) {
      console.log(`⚠️  User ${user.email} already exists (ID: ${existing.id})`);
      
      // Update the password
      const passwordHash = await bcrypt.hash(user.password, 12);
      await db.run(
        `UPDATE users 
         SET password_hash = ?, 
             display_name = ?, 
             email_verified = 1,
             role_id = ?,
             account_locked = 0,
             login_attempts = 0,
             updated_at = CURRENT_TIMESTAMP
         WHERE email = ?`,
        [passwordHash, user.displayName, user.roleId, user.email]
      );
      console.log(`✅ Updated user ${user.email} with new password\n`);
    } else {
      // Create new user
      const passwordHash = await bcrypt.hash(user.password, 12);
      await db.run(
        `INSERT INTO users (email, password_hash, display_name, email_verified, role_id, account_locked, login_attempts)
         VALUES (?, ?, ?, 1, ?, 0, 0)`,
        [user.email, passwordHash, user.displayName, user.roleId]
      );
      console.log(`✅ Created user ${user.email}\n`);
    }
  }

  console.log('📊 Current users:\n');
  const allUsers = await db.all(`
    SELECT u.id, u.email, u.display_name, r.name as role, u.email_verified, u.account_locked
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    ORDER BY u.id
  `);
  
  console.table(allUsers);

  console.log('\n✨ Test users ready!\n');
  console.log('Login credentials:');
  console.log('━'.repeat(50));
  console.log('Admin:');
  console.log('  Email: admin@festival.local');
  console.log('  Password: festivalAdmin2025\n');
  console.log('User:');
  console.log('  Email: user@festival.local');
  console.log('  Password: userPass2025\n');

  await db.close();
}

createTestUser().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
