import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

(async () => {
  try {
    const dbPath = './database/dev.sqlite';
    const db = await open({ filename: dbPath, driver: sqlite3.Database });

    await db.run(`UPDATE users SET role_id = 3 WHERE LOWER(email) = ?`, ['admin@local.test']);

    const row = await db.get(`SELECT id, email, display_name, role_id FROM users WHERE LOWER(email) = ?`, ['admin@local.test']);
    console.log('promote-admin-result:', JSON.stringify(row, null, 2));

    await db.close();
  } catch (err) {
    console.error('promote-admin failed:', err);
    process.exit(1);
  }
})();
