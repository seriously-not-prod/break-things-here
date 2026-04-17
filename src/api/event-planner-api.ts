/**
 * API Client for Event Planner Backend
 * Handles all API requests with authentication
 */

const API_BASE_URL = 'http://localhost:3001/api';

// Generic API call helper
async function apiCall<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    credentials: 'include', // Important: send cookies with each request
    headers: {
      'Content-Type': 'application/json',
      ...options.headers as Record<string, string>,
    },
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  
  return response.json();
}

// ============ EVENT API ============

export interface Event {
  id: number;
  title: string;
  date: string;
  location: string;
  description: string;
  status: 'Draft' | 'Active' | 'Completed';
  created_by: number;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface EventInput {
  title: string;
  date: string;
  location: string;
  description?: string;
  status: 'Draft' | 'Active' | 'Completed';
}

export async function getAllEvents(): Promise<Event[]> {
  return apiCall<Event[]>('/events');
}

export async function getEventById(id: number): Promise<Event> {
  return apiCall<Event>(`/events/${id}`);
}

export async function createEvent(data: EventInput): Promise<Event> {
  return apiCall<Event>('/events', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateEvent(id: number, data: Partial<EventInput>): Promise<Event> {
  return apiCall<Event>(`/events/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteEvent(id: number): Promise<void> {
  await apiCall<{ message: string }>(`/events/${id}`, {
    method: 'DELETE',
  });
}

// ============ TASK API ============

export interface Task {
  id: number;
  event_id: number;
  title: string;
  description: string;
  assignee: string;
  due_date: string | null;
  status: 'Pending' | 'Complete';
  created_at: string;
  updated_at: string;
}

export interface TaskInput {
  event_id: number;
  title: string;
  description?: string;
  assignee?: string;
  due_date?: string;
  status?: 'Pending' | 'Complete';
}

export async function getAllTasks(eventId?: number): Promise<Task[]> {
  const query = eventId ? `?event_id=${eventId}` : '';
  return apiCall<Task[]>(`/tasks${query}`);
}

export async function getTaskById(id: number): Promise<Task> {
  return apiCall<Task>(`/tasks/${id}`);
}

export async function createTask(data: TaskInput): Promise<Task> {
  return apiCall<Task>('/tasks', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateTask(id: number, data: Partial<TaskInput>): Promise<Task> {
  return apiCall<Task>(`/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteTask(id: number): Promise<void> {
  await apiCall<{ message: string }>(`/tasks/${id}`, {
    method: 'DELETE',
  });
}

export async function toggleTaskStatus(id: number): Promise<Task> {
  return apiCall<Task>(`/tasks/${id}/toggle`, {
    method: 'POST',
  });
}

// ============ RSVP API ============

export interface Rsvp {
  id: number;
  event_id: number;
  name: string;
  email: string;
  guests: number;
  status: 'Pending' | 'Confirmed' | 'Declined';
  created_at: string;
  updated_at: string;
}

export interface RsvpInput {
  event_id: number;
  name: string;
  email: string;
  guests?: number;
  status?: 'Pending' | 'Confirmed' | 'Declined';
}

export async function getAllRsvps(eventId?: number): Promise<Rsvp[]> {
  const query = eventId ? `?event_id=${eventId}` : '';
  return apiCall<Rsvp[]>(`/rsvps${query}`);
}

export async function getRsvpById(id: number): Promise<Rsvp> {
  return apiCall<Rsvp>(`/rsvps/${id}`);
}

export async function submitRsvp(data: RsvpInput): Promise<Rsvp> {
  // Public endpoint - no auth token needed
  const response = await fetch(`${API_BASE_URL}/rsvps`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  
  return response.json();
}

export async function updateRsvp(id: number, data: Partial<RsvpInput>): Promise<Rsvp> {
  return apiCall<Rsvp>(`/rsvps/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteRsvp(id: number): Promise<void> {
  await apiCall<{ message: string }>(`/rsvps/${id}`, {
    method: 'DELETE',
  });
}
