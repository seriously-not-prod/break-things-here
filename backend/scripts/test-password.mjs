#!/usr/bin/env node
import bcrypt from 'bcrypt';
import pg from 'pg';

async function testPassword() {
  const connectionString = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/festival_planner';
  const pool = new pg.Pool({ connectionString });

  const email = 'admin@festival.local';
  const password = 'festivalAdmin2025';

  const result = await pool.query(
    'SELECT id, email, password_hash, display_name, email_verified, account_locked FROM users WHERE email = $1',
    [email],
  );
  const user = result.rows[0];

  if (!user) {
    console.log('❌ User not found!');
    await pool.end();
    return;
  }

  console.log('📋 User Information:');
  console.log('  Email:', user.email);
  console.log('  Display Name:', user.display_name);
  console.log('  Email Verified:', user.email_verified ? '✅ Yes' : '❌ No');
  console.log('  Account Locked:', user.account_locked ? '🔒 Yes' : '✅ No');
  console.log('  Password Hash:', user.password_hash.substring(0, 30) + '...\n');

  // Test password
  const isMatch = await bcrypt.compare(password, user.password_hash);
  console.log(`🔐 Password Test for "${password}":`, isMatch ? '✅ MATCH' : '❌ NO MATCH\n');

  await pool.end();
}

testPassword().catch(console.error);
