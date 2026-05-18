import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { RoleGuard } from '../src/components/auth/role-guard';

let mockUser: { roleName?: string | null } | null = null;

vi.mock('../src/contexts/auth-context', () => ({
  useAuth: () => ({ user: mockUser }),
}));

function renderGuard(canAccess: (user: { roleName?: string | null } | null) => boolean): void {
  render(
    <MemoryRouter initialEntries={['/protected']}>
      <Routes>
        <Route
          path="/protected"
          element={
            <RoleGuard canAccess={canAccess}>
              <div>Protected content</div>
            </RoleGuard>
          }
        />
        <Route path="/dashboard" element={<div>Dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RoleGuard', () => {
  it('renders children when access predicate passes', () => {
    mockUser = { roleName: 'Admin' };

    renderGuard((u) => u?.roleName === 'Admin');

    expect(screen.getByText('Protected content')).toBeInTheDocument();
    expect(screen.queryByText('Access denied')).not.toBeInTheDocument();
  });

  it('renders denied state when access predicate fails', () => {
    mockUser = { roleName: 'Viewer' };

    renderGuard((u) => u?.roleName === 'Admin');

    expect(screen.getByText('Access denied')).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('navigates to dashboard from denied state', async () => {
    const user = userEvent.setup();
    mockUser = { roleName: 'Guest' };

    renderGuard((u) => u?.roleName === 'Admin');

    await user.click(screen.getByRole('button', { name: /back to dashboard/i }));
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });
});
