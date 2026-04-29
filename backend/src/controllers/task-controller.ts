/**
 * Task Controller
 * Handles CRUD operations for event tasks
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database';

export interface TaskData {
  event_id: number;
  title: string;
  description?: string;
  assignee?: string;
  due_date?: string;
  status: 'Pending' | 'Complete';
}

/**
 * Get all tasks (optionally filtered by event)
 */
export async function getAllTasks(req: Request, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { event_id } = req.query;
    
    let query = 'SELECT * FROM tasks';
    const params: any[] = [];
    
    if (event_id) {
      query += ' WHERE event_id = ?';
      params.push(event_id);
    }
    
    query += ' ORDER BY due_date ASC, created_at DESC';
    
    const tasks = await db.all(query, params);
    
    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
}

/**
 * Get a single task by ID
 */
export async function getTaskById(req: Request, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { id } = req.params;
    
    const task = await db.get('SELECT * FROM tasks WHERE id = ?', [id]);
    
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    
    res.json(task);
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
}

/**
 * Create a new task
 */
export async function createTask(req: Request, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const userId = (req as any).user?.id;
    
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    
    const { event_id, title, description, assignee, due_date, status }: TaskData = req.body;
    
    // Validation
    if (!event_id || !title) {
      res.status(400).json({ error: 'Event ID and title are required' });
      return;
    }
    
    // Check if event exists
    const event = await db.get('SELECT id FROM events WHERE id = ?', [event_id]);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    
    if (status && !['Pending', 'Complete'].includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }
    
    const result = await db.run(`
      INSERT INTO tasks (event_id, title, description, assignee, due_date, status)
      VALUES (?, ?, ?, ?, ?, ?)
      RETURNING id
    `, [event_id, title, description || '', assignee || '', due_date || null, status || 'Pending']);
    
    const newTask = await db.get('SELECT * FROM tasks WHERE id = ?', [result.lastID]);
    
    res.status(201).json(newTask);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
}

/**
 * Update an existing task
 */
export async function updateTask(req: Request, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { id } = req.params;
    const userId = (req as any).user?.id;
    
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    
    const { title, description, assignee, due_date, status } = req.body;
    
    // Check if task exists
    const existingTask = await db.get('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!existingTask) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    
    // Validation
    if (status && !['Pending', 'Complete'].includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }
    
    await db.run(`
      UPDATE tasks 
      SET title = ?, description = ?, assignee = ?, due_date = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      title || existingTask.title,
      description !== undefined ? description : existingTask.description,
      assignee !== undefined ? assignee : existingTask.assignee,
      due_date !== undefined ? due_date : existingTask.due_date,
      status || existingTask.status,
      id
    ]);
    
    const updatedTask = await db.get('SELECT * FROM tasks WHERE id = ?', [id]);
    
    res.json(updatedTask);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
}

/**
 * Delete a task
 */
export async function deleteTask(req: Request, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { id } = req.params;
    const userId = (req as any).user?.id;
    
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    
    const task = await db.get('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    
    await db.run('DELETE FROM tasks WHERE id = ?', [id]);
    
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
}

/**
 * Toggle task status (Pending <-> Complete)
 */
export async function toggleTaskStatus(req: Request, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { id } = req.params;
    const userId = (req as any).user?.id;
    
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    
    const task = await db.get('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    
    const newStatus = task.status === 'Complete' ? 'Pending' : 'Complete';
    
    await db.run(`
      UPDATE tasks 
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [newStatus, id]);
    
    const updatedTask = await db.get('SELECT * FROM tasks WHERE id = ?', [id]);
    
    res.json(updatedTask);
  } catch (error) {
    console.error('Error toggling task status:', error);
    res.status(500).json({ error: 'Failed to toggle task status' });
  }
}
