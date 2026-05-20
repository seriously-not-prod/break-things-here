import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { QuickAccessGrid } from '../src/components/dashboard/quick-access-grid';
import type { AuthUser } from '../src/contexts/auth-context';

function user(roleName: string | null): AuthUser {
  return {
    id: 1,
    email: 'test@example.com',
    displayName: 'Test',
    roleId: 0,
    roleName: roleName ?? undefined,
  } as AuthUser;
}

function renderGrid(u: AuthUser | null): void {
  render(
    <MemoryRouter>
      <QuickAccessGrid user={u} />
    </MemoryRouter>,
  );
}

describe('QuickAccessGrid — RBAC CTA gating (#702)', () => {
  it('shows Create Event for Organizer', () => {
    renderGrid(user('Organizer'));
    expect(screen.getByRole('button', { name: /create a new event/i })).toBeInTheDocument();
  });

  it('shows Create Event for Admin', () => {
    renderGrid(user('Admin'));
    expect(screen.getByRole('button', { name: /create a new event/i })).toBeInTheDocument();
  });

  it('shows Create Event for Collaborator', () => {
    renderGrid(user('Collaborator'));
    expect(screen.getByRole('button', { name: /create a new event/i })).toBeInTheDocument();
  });

  it('hides Create Event for Attendee', () => {
    renderGrid(user('Attendee'));
    expect(screen.queryByRole('button', { name: /create a new event/i })).not.toBeInTheDocument();
  });

  it('hides Create Event for Viewer', () => {
    renderGrid(user('Viewer'));
    expect(screen.queryByRole('button', { name: /create a new event/i })).not.toBeInTheDocument();
  });

  it('hides Create Event for Guest', () => {
    renderGrid(user('Guest'));
    expect(screen.queryByRole('button', { name: /create a new event/i })).not.toBeInTheDocument();
  });

  it('hides Create Event when user is not signed in', () => {
    renderGrid(null);
    expect(screen.queryByRole('button', { name: /create a new event/i })).not.toBeInTheDocument();
  });

  it('only shows Admin CTA when role is Admin', () => {
    renderGrid(user('Organizer'));
    expect(screen.queryByRole('button', { name: /go to admin page/i })).not.toBeInTheDocument();

    document.body.innerHTML = '';
    renderGrid(user('Admin'));
    expect(screen.getByRole('button', { name: /go to admin page/i })).toBeInTheDocument();
  });
});
