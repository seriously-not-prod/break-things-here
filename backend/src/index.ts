import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';

const app = express();
const port = parseInt(process.env.PORT || '4000', 10);

// Middleware
app.use(cors());
app.use(express.json());

// Database connection pool
const pool = new Pool({
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  database: process.env.DATABASE_NAME || 'festival_planner',
  user: process.env.DATABASE_USER || 'festival_user',
  password: process.env.DATABASE_PASSWORD || 'festival_pass',
});

// Health check endpoint
app.get('/health', async (_req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({
      status: 'healthy',
      timestamp: result.rows[0].now,
      uptime: process.uptime(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: 'Database connection failed',
    });
  }
});

// Events endpoints
app.get('/api/events', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM events ORDER BY start_date ASC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

app.post('/api/events', async (req, res) => {
  const { title, description, location, start_date, end_date, capacity } =
    req.body;

  if (!title || !start_date || !end_date) {
    res.status(400).json({ error: 'title, start_date, and end_date are required' });
    return;
  }

  try {
    const result = await pool.query(
      `INSERT INTO events (title, description, location, start_date, end_date, capacity)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [title, description, location, start_date, end_date, capacity]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

app.get('/api/events/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM events WHERE id = $1', [
      req.params.id,
    ]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching event:', error);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`Festival Planner API running on port ${port}`);
});
