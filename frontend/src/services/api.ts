const BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

async function req<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? data?.message ?? 'Request failed');
  return data as T;
}

export const api = {
  get: <T>(path: string) => req<T>('GET', path),
  post: <T>(path: string, body: unknown) => req<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => req<T>('PUT', path, body),
  delete: <T>(path: string) => req<T>('DELETE', path),
};

// ── Auth ──────────────────────────────────────────────────────────────────
export interface AuthUser {
  id: number;
  email: string;
  display_name: string;
  role_id: number;
  role_name?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export const authApi = {
  login: (email: string, password: string) =>
    api.post<LoginResponse>('/auth/login', { email, password }),
  register: (email: string, password: string, display_name: string) =>
    api.post<{ message: string }>('/auth/register', { email, password, display_name }),
  me: () => api.get<AuthUser>('/auth/me'),
  logout: () => api.post<void>('/auth/logout', {}),
};

// ── Dashboard ─────────────────────────────────────────────────────────────
export interface DashboardStats {
  totalUsers: number;
  totalProjects: number;
  totalTasks: number;
  completedTasks: number;
}
export const dashboardApi = {
  stats: () => api.get<DashboardStats>('/dashboard/stats'),
};

// ── Projects ──────────────────────────────────────────────────────────────
export interface Project {
  id: number;
  title: string;
  description?: string;
  status: 'active' | 'completed' | 'on_hold';
  owner_id?: number;
  owner_name?: string;
  created_at: string;
  updated_at: string;
}

export const projectsApi = {
  list: () => api.get<Project[]>('/projects'),
  get: (id: number) => api.get<Project>(`/projects/${id}`),
  create: (data: Partial<Project>) => api.post<Project>('/projects', data),
  update: (id: number, data: Partial<Project>) => api.put<Project>(`/projects/${id}`, data),
  delete: (id: number) => api.delete<{ success: boolean }>(`/projects/${id}`),
};

// ── Tasks ─────────────────────────────────────────────────────────────────
export interface Task {
  id: number;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  project_id?: number;
  project_title?: string;
  assignee_id?: number;
  assignee_name?: string;
  created_at: string;
  updated_at: string;
}

export const tasksApi = {
  list: (project_id?: number) =>
    api.get<Task[]>(project_id ? `/tasks?project_id=${project_id}` : '/tasks'),
  create: (data: Partial<Task>) => api.post<Task>('/tasks', data),
  update: (id: number, data: Partial<Task>) => api.put<Task>(`/tasks/${id}`, data),
  delete: (id: number) => api.delete<{ success: boolean }>(`/tasks/${id}`),
};

// ── Users ─────────────────────────────────────────────────────────────────
export interface UserRow {
  id: number;
  email: string;
  display_name: string;
  role_name: string;
  email_verified: number;
  created_at: string;
}

export const usersApi = {
  list: () => api.get<UserRow[]>('/users'),
};

// ── Activity logs ─────────────────────────────────────────────────────────
export interface ActivityLog {
  id: number;
  user_id?: number;
  user_name?: string;
  user_email?: string;
  action: string;
  entity_type?: string;
  entity_id?: number;
  description?: string;
  created_at: string;
}

export const activityApi = {
  list: () => api.get<ActivityLog[]>('/activity-logs'),
};
