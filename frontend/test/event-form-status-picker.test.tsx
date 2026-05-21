/**
 * Event Form Status Picker Snapshot Test
 *
 * Task #779: Event Status Workflow End-to-End Audit
 * Verifies that the event form status selector renders all 6 statuses:
 * Draft, Planning, Confirmed, Active, Completed, Cancelled
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EventFormPage from '../src/components/events/event-form-page';

vi.mock('../src/contexts/auth-context', async () => {
  const actual = await vi.importActual<typeof import('../src/contexts/auth-context')>(
    '../src/contexts/auth-context',
  );
  return { ...actual, useAuth: vi.fn() };
});

// Mock the API client
vi.mock('../src/lib/api-client', () => ({
  api: {
    post: vi.fn(),
    get: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

// Mock the geocoding service
vi.mock('../src/services/events-service', () => ({
  geocodeAddress: vi.fn(),
  buildEventQuery: vi.fn(() => ''),
}));

import * as authContext from '../src/contexts/auth-context';

describe('EventFormPage - Status Picker', () => {
  const mockUser = {
    id: 1,
    email: 'test@example.com',
    displayName: 'Test User',
    roleId: 2,
    roleName: 'Organizer',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authContext.useAuth).mockReturnValue({
      user: mockUser,
      loading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      loadCurrentUser: vi.fn(),
      sessionTimedOut: false,
      clearSessionTimeout: vi.fn(),
    });
  });

  it('should render all 6 event statuses in the status dropdown', () => {
    render(
      <MemoryRouter>
        <EventFormPage />
      </MemoryRouter>,
    );

    const statusSelect = screen.getByLabelText('Status');
    fireEvent.mouseDown(statusSelect);

    const expectedStatuses = ['Draft', 'Planning', 'Confirmed', 'Active', 'Completed', 'Cancelled'];
    expectedStatuses.forEach((status) => {
      const option = screen.getByRole('option', { name: status });
      expect(option).toBeVisible();
    });
  });

  it('should snapshot the status selector options', () => {
    render(
      <MemoryRouter>
        <EventFormPage />
      </MemoryRouter>,
    );

    const statusSelect = screen.getByLabelText('Status');
    fireEvent.mouseDown(statusSelect);

    const menu = screen.getByRole('listbox');
    expect(menu).toMatchSnapshot('event-status-dropdown-options');
  });
});
