import { User } from '../../types/user';
import { UserRole } from '../../types/user-role';
import { API_BASE_URL } from '../config';

interface BackendAdminUser {
  id: number;
  email: string;
  display_name: string;
  role_name: UserRole;
  email_verified: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

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
  const data = await adminRequest<User[] | { users: BackendAdminUser[] }>('/admin/users', { method: 'GET' });
  const rows = Array.isArray(data) ? data : data.users;

  return rows.map((row) => {
    if ('displayName' in row) return row;

    return {
      id: String(row.id),
      email: row.email,
      displayName: row.display_name,
      role: row.role_name,
      emailConfirmed: Boolean(row.email_verified),
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  });
}

export async function updateUserRole(
  userId: string,
  role: UserRole,
): Promise<void> {
  await adminRequest<{ message: string }>(`/admin/users/${encodeURIComponent(userId)}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role_id: role === UserRole.Admin ? 3 : role === UserRole.Organizer ? 2 : 1 }),
  });
}

export async function restoreUser(userId: string): Promise<void> {
  await adminRequest<{ message: string }>(`/admin/users/${encodeURIComponent(userId)}/restore`, {
    method: 'POST',
  });
}
