/// <reference types="vitest/globals" />
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdminUserManagement } from '../components/admin-user-management/admin-user-management';
import { setAuthState } from '../hooks/use-user-role';
import { UserRole } from '../types/user-role';
import { User } from '../types/user';

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

function makeUser(overrides: Partial<User> & { id: string }): User {
  return {
    displayName: 'Test User',
    email: 'test@example.com',
    role: UserRole.Attendee,
    emailConfirmed: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

const adminUser = makeUser({ id: 'admin-1', displayName: 'Alice Admin', email: 'admin@test.com', role: UserRole.Admin });
const orgUser = makeUser({ id: 'org-1', displayName: 'Organizer Jane', email: 'jane@test.com', role: UserRole.Organizer });
const attendeeUser = makeUser({ id: 'att-1', displayName: 'Attendee Sam', email: 'sam@test.com', role: UserRole.Attendee, emailConfirmed: false });

function mockFetchUsers(users: User[]) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => users,
  });
}

function mockFetchError() {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 500,
    json: async () => ({ message: 'Internal server error' }),
  });
}

function mockRoleUpdate(user: User) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => user,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setAuthState({ user: { id: 'admin-1', role: UserRole.Admin } });
});

describe('AdminUserManagement', () => {
  it('shows loading state initially', () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves
    render(<AdminUserManagement />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/loading users/i)).toBeInTheDocument();
  });

  it('renders user list after loading', async () => {
    mockFetchUsers([adminUser, orgUser, attendeeUser]);
    render(<AdminUserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Alice Admin')).toBeInTheDocument();
    });
    expect(screen.getByText('Organizer Jane')).toBeInTheDocument();
    expect(screen.getByText('Attendee Sam')).toBeInTheDocument();
  });

  it('shows error state on fetch failure', async () => {
    mockFetchError();
    render(<AdminUserManagement />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByText(/failed to load users/i)).toBeInTheDocument();
  });

  it('retries loading on Retry button click', async () => {
    mockFetchError();
    render(<AdminUserManagement />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load users/i)).toBeInTheDocument();
    });

    mockFetchUsers([adminUser]);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(screen.getByText('Alice Admin')).toBeInTheDocument();
    });
  });

  it('filters users by search input', async () => {
    mockFetchUsers([adminUser, orgUser, attendeeUser]);
    render(<AdminUserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Alice Admin')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/search users/i), { target: { value: 'jane' } });
    expect(screen.getByText('Organizer Jane')).toBeInTheDocument();
    expect(screen.queryByText('Alice Admin')).not.toBeInTheDocument();
    expect(screen.queryByText('Attendee Sam')).not.toBeInTheDocument();
  });

  it('filters users by role dropdown', async () => {
    mockFetchUsers([adminUser, orgUser, attendeeUser]);
    render(<AdminUserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Alice Admin')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/filter users by role/i), { target: { value: 'Organizer' } });
    expect(screen.getByText('Organizer Jane')).toBeInTheDocument();
    expect(screen.queryByText('Alice Admin')).not.toBeInTheDocument();
    expect(screen.queryByText('Attendee Sam')).not.toBeInTheDocument();
  });

  it('shows confirmation dialog when Change Role is clicked', async () => {
    mockFetchUsers([orgUser]);
    render(<AdminUserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Organizer Jane')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /change role for organizer jane/i }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText(/confirm role change/i)).toBeInTheDocument();
  });

  it('cancels role change dialog', async () => {
    mockFetchUsers([orgUser]);
    render(<AdminUserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Organizer Jane')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /change role for organizer jane/i }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /cancel role change/i }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('updates role on confirmation and shows success feedback', async () => {
    mockFetchUsers([orgUser]);
    render(<AdminUserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Organizer Jane')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /change role for organizer jane/i }));

    // Change dropdown to Admin
    fireEvent.change(screen.getByLabelText(/new role for organizer jane/i), { target: { value: 'Admin' } });

    const updatedUser = { ...orgUser, role: UserRole.Admin };
    mockRoleUpdate(updatedUser);

    fireEvent.click(screen.getByRole('button', { name: /confirm changing role to admin/i }));

    await waitFor(() => {
      expect(screen.getByText(/role updated to admin/i)).toBeInTheDocument();
    });
  });

  it('shows error feedback when role update fails', async () => {
    mockFetchUsers([orgUser]);
    render(<AdminUserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Organizer Jane')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /change role for organizer jane/i }));
    fireEvent.change(screen.getByLabelText(/new role for organizer jane/i), { target: { value: 'Admin' } });

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ message: 'Cannot change your own role' }),
    });

    fireEvent.click(screen.getByRole('button', { name: /confirm changing role to admin/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('displays email confirmed status correctly', async () => {
    mockFetchUsers([adminUser, attendeeUser]);
    render(<AdminUserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Alice Admin')).toBeInTheDocument();
    });

    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('shows table headers with correct scope', async () => {
    mockFetchUsers([adminUser]);
    render(<AdminUserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Alice Admin')).toBeInTheDocument();
    });

    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(5);
    expect(headers.map((h) => h.textContent)).toEqual(['Name', 'Email', 'Role', 'Status', 'Actions']);
  });

  it('shows no users found when filter matches nothing', async () => {
    mockFetchUsers([adminUser]);
    render(<AdminUserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Alice Admin')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/search users/i), { target: { value: 'zzzznotexist' } });
    expect(screen.getByText(/no users found/i)).toBeInTheDocument();
  });

  it('paginates when more than 10 users exist', async () => {
    const manyUsers = Array.from({ length: 15 }, (_, i) =>
      makeUser({ id: `u-${i}`, displayName: `User ${i}`, email: `user${i}@test.com` }),
    );
    mockFetchUsers(manyUsers);
    render(<AdminUserManagement />);

    await waitFor(() => {
      expect(screen.getByText('User 0')).toBeInTheDocument();
    });

    // Should show pagination
    expect(screen.getByText(/page 1 of 2/i)).toBeInTheDocument();
    expect(screen.queryByText('User 10')).not.toBeInTheDocument();

    // Go to page 2
    fireEvent.click(screen.getByRole('button', { name: /next page/i }));
    expect(screen.getByText('User 10')).toBeInTheDocument();
    expect(screen.queryByText('User 0')).not.toBeInTheDocument();
    expect(screen.getByText(/page 2 of 2/i)).toBeInTheDocument();

    // Go back
    fireEvent.click(screen.getByRole('button', { name: /previous page/i }));
    expect(screen.getByText('User 0')).toBeInTheDocument();
  });

  it('redirects non-admin users', () => {
    setAuthState({ user: { id: 'user-1', role: UserRole.Attendee } });

    render(<AdminUserManagement />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/redirecting/i)).toBeInTheDocument();
  });

  it('has keyboard accessible Change Role buttons', async () => {
    mockFetchUsers([orgUser]);
    render(<AdminUserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Organizer Jane')).toBeInTheDocument();
    });

    const changeBtn = screen.getByRole('button', { name: /change role for organizer jane/i });
    expect(changeBtn).toBeInTheDocument();
    expect(changeBtn.getAttribute('aria-label')).toBe('Change role for Organizer Jane');
  });
});
