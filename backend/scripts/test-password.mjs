#!/usr/bin/env node
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import bcrypt from 'bcrypt';

async function testPassword() {
  const db = await open({
    filename: './database/dev.sqlite',
    driver: sqlite3.Database,
  });

  const email = 'admin@festival.local';
  const password = 'festivalAdmin2025';

  const user = await db.get(
    'SELECT id, email, password_hash, display_name, email_verified, account_locked FROM users WHERE email = ?',
    [email]
  );

  if (!user) {
    console.log('❌ User not found!');
    await db.close();
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

  await db.close();
}

testPassword().catch(console.error);
