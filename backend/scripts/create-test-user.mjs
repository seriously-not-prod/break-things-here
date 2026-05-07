#!/usr/bin/env node
/**
 * Create a test user for development
 * Usage: node scripts/create-test-user.mjs
 */

import bcrypt from 'bcrypt';
import pg from 'pg';

async function createTestUser() {
  const connectionString = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/festival_planner';
  const pool = new pg.Pool({ connectionString });
  
  console.log('📝 Creating test user...\n');

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
    const existingResult = await pool.query(
      'SELECT id, email FROM users WHERE email = $1',
      [user.email],
    );
    const existing = existingResult.rows[0];

    if (existing) {
      console.log(`⚠️  User ${user.email} already exists (ID: ${existing.id})`);
      
      // Update the password
      const passwordHash = await bcrypt.hash(user.password, 12);
      await pool.query(
        `UPDATE users 
         SET password_hash = $1, 
             display_name = $2, 
             email_verified = 1,
             role_id = $3,
             account_locked = 0,
             login_attempts = 0,
             updated_at = CURRENT_TIMESTAMP
         WHERE email = $4`,
        [passwordHash, user.displayName, user.roleId, user.email],
      );
      console.log(`✅ Updated user ${user.email} with new password\n`);
    } else {
      // Create new user
      const passwordHash = await bcrypt.hash(user.password, 12);
      await pool.query(
        `INSERT INTO users (email, password_hash, display_name, email_verified, role_id, account_locked, login_attempts)
         VALUES ($1, $2, $3, 1, $4, 0, 0)`,
        [user.email, passwordHash, user.displayName, user.roleId],
      );
      console.log(`✅ Created user ${user.email}\n`);
    }
  }

  console.log('📊 Current users:\n');
  const allUsersResult = await pool.query(`
    SELECT u.id, u.email, u.display_name, r.name as role, u.email_verified, u.account_locked
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    ORDER BY u.id
  `);
  const allUsers = allUsersResult.rows;
  
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

  await pool.end();
}

createTestUser().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
