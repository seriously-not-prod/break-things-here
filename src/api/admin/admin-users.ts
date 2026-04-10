import { User } from '../../types/user';
import { UserRole } from '../../types/user-role';
import { API_BASE_URL } from '../config';

async function adminRequest<T>(path: string, options: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (response.status === 401) throw new Error('Unauthorized');
  if (response.status === 403) throw new Error('Forbidden');
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(body.message ?? 'Request failed');
  }

  return response.json() as Promise<T>;
}

export async function fetchAllUsers(): Promise<User[]> {
  return adminRequest<User[]>('/admin/users', { method: 'GET' });
}

export async function updateUserRole(
  userId: string,
  role: UserRole,
): Promise<User> {
  return adminRequest<User>(`/admin/users/${encodeURIComponent(userId)}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}
