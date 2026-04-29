import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

(async () => {
  try {
    const dbPath = './database/dev.sqlite';
    const db = await open({ filename: dbPath, driver: sqlite3.Database });

    console.log('\n📊 DATABASE CONTENTS\n');
    console.log('='.repeat(80));

    // Query Users
    console.log('\n👥 USERS:');
    console.log('-'.repeat(80));
    const users = await db.all('SELECT id, email, display_name, role_id, account_locked FROM users');
    if (users.length === 0) {
      console.log('  (no users found)');
    } else {
      users.forEach(row => {
        console.log(`  ID: ${row.id} | Email: ${row.email} | Name: ${row.display_name} | Role: ${row.role_id} | Locked: ${row.account_locked}`);
      });
    }

    // Query Events
    console.log('\n🎪 EVENTS:');
    console.log('-'.repeat(80));
    const events = await db.all('SELECT * FROM events');
    if (events.length === 0) {
      console.log('  (no events found)');
    } else {
      events.forEach(row => {
        console.log(`  ID: ${row.id}`);
        console.log(`    Title: ${row.title}`);
        console.log(`    Date: ${row.date}`);
        console.log(`    Location: ${row.location}`);
        console.log(`    Status: ${row.status}`);
        console.log(`    Created By: User ${row.created_by}`);
        console.log(`    Created At: ${row.created_at}`);
        console.log('');
      });
    }

    // Query Tasks
    console.log('✅ TASKS:');
    console.log('-'.repeat(80));
    const tasks = await db.all('SELECT * FROM tasks');
    if (tasks.length === 0) {
      console.log('  (no tasks found)');
    } else {
      tasks.forEach(row => {
        console.log(`  ID: ${row.id} | Event ID: ${row.event_id}`);
        console.log(`    Title: ${row.title}`);
        console.log(`    Description: ${row.description || '(none)'}`);
        console.log(`    Assignee: ${row.assignee || '(unassigned)'}`);
        console.log(`    Status: ${row.status}`);
        console.log(`    Due Date: ${row.due_date || '(no due date)'}`);
        console.log('');
      });
    }

    // Query RSVPs
    console.log('💌 RSVPS:');
    console.log('-'.repeat(80));
    const rsvps = await db.all('SELECT * FROM rsvps');
    if (rsvps.length === 0) {
      console.log('  (no RSVPs found)');
    } else {
      rsvps.forEach(row => {
        console.log(`  ID: ${row.id} | Event ID: ${row.event_id}`);
        console.log(`    Name: ${row.guest_name}`);
        console.log(`    Email: ${row.email}`);
        console.log(`    Status: ${row.status}`);
        console.log(`    Party Size: ${row.party_size || 1}`);
        console.log(`    RSVP Date: ${row.rsvp_date}`);
        console.log('');
      });
    }

    console.log('='.repeat(80));
    console.log('\n✨ Database check complete!\n');
    
    await db.close();
  } catch (err) {
    console.error('Database check failed:', err);
    process.exit(1);
  }
})();
