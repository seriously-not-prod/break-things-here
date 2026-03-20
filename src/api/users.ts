import { UserProfile, UpdateProfileRequest } from '../types/user';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL ?? '/api';

async function request<T>(path: string, options: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (response.status === 401) {
    throw new Error('Unauthorized');
  }
  if (response.status === 403) {
    throw new Error('Forbidden');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(body.message ?? 'Request failed');
  }

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  return response.json() as Promise<T>;
}

/**
 * Fetch the authenticated user's profile.
 */
export async function getProfile(): Promise<UserProfile> {
  return request<UserProfile>('/users/me', { method: 'GET' });
}

/**
 * Update the authenticated user's profile (display name, email, preferences).
 * Email changes will trigger a re-confirmation flow server-side.
 */
export async function updateProfile(data: UpdateProfileRequest): Promise<UserProfile> {
  return request<UserProfile>('/users/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/**
 * Upload a new profile photo for the authenticated user.
 * File type and size validation must also be enforced server-side.
 */
export async function uploadProfilePhoto(file: File): Promise<{ photoUrl: string }> {
  const formData = new FormData();
  formData.append('photo', file);

  const response = await fetch(`${API_BASE_URL}/users/me/photo`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  if (response.status === 401) throw new Error('Unauthorized');
  if (response.status === 400) {
    const body = await response.json().catch(() => ({ message: 'Invalid file' }));
    throw new Error(body.message ?? 'Invalid file');
  }
  if (!response.ok) throw new Error('Photo upload failed');

  return response.json() as Promise<{ photoUrl: string }>;
}

/**
 * Delete the authenticated user's account permanently.
 * Session will be invalidated server-side after this call.
 */
export async function deleteAccount(): Promise<void> {
  return request<void>('/users/me', { method: 'DELETE' });
}
