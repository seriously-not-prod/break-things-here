import pg from 'pg';

(async () => {
  const connectionString = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/festival_planner';
  const pool = new pg.Pool({ connectionString });

  try {
    await pool.query('UPDATE users SET role_id = 3 WHERE LOWER(email) = $1', ['admin@local.test']);

    const result = await pool.query(
      'SELECT id, email, display_name, role_id FROM users WHERE LOWER(email) = $1',
      ['admin@local.test'],
    );
    const row = result.rows[0];
    console.log('promote-admin-result:', JSON.stringify(row, null, 2));
  } catch (err) {
    console.error('promote-admin failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
