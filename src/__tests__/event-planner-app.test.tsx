import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventPlannerApp } from '../components/event-planner/event-planner-app';

const AUTH_STORAGE_KEY = 'festival-planner-auth';

const TEST_USER = {
  user: {
    id: 'user-001',
    name: 'Alex Carter',
    email: 'alex.carter@festival.local',
    role: 'Admin',
  }
};

const MOCK_EVENTS = [
  {
    id: 1,
    title: 'Test Event',
    date: '2026-05-18',
    location: 'Austin, TX',
    description: 'Test event description',
    status: 'Active',
    created_by: 1,
    created_at: '2026-03-01T09:00:00.000Z',
    updated_at: '2026-04-11T14:10:00.000Z',
  }
];

const MOCK_TASKS = [];
const MOCK_RSVPS = [];

// Mock fetch globally
global.fetch = vi.fn();

function mockFetchSuccess(url: string) {
  if (url.includes('/api/auth/me')) {
    return Promise.resolve({
      ok: true,
      json: async () => TEST_USER,
    } as Response);
  }
  if (url.includes('/api/events')) {
    return Promise.resolve({
      ok: true,
      json: async () => MOCK_EVENTS,
    } as Response);
  }
  if (url.includes('/api/tasks')) {
    return Promise.resolve({
      ok: true,
      json: async () => MOCK_TASKS,
    } as Response);
  }
  if (url.includes('/api/rsvps')) {
    return Promise.resolve({
      ok: true,
      json: async () => MOCK_RSVPS,
    } as Response);
  }
  return Promise.resolve({
    ok: true,
    json: async () => ({}),
  } as Response);
}

describe('EventPlannerApp', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    (global.fetch as any).mockImplementation((url: string) => mockFetchSuccess(url));
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the dashboard with primary navigation and summary cards', async () => {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(TEST_USER));
    window.history.pushState({}, '', '/dashboard');
    render(<EventPlannerApp />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    });

    expect(screen.getByRole('link', { name: /events/i })).toBeInTheDocument();
    expect(screen.getByText('Total Events')).toBeInTheDocument();
    expect(screen.getByText('Pending Tasks')).toBeInTheDocument();
  });

  it('redirects unauthenticated users to login', async () => {
    // Mock unauthorized response
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: async () => ({ error: 'Unauthorized' }),
        } as Response);
      }
      return mockFetchSuccess(url);
    });

    window.history.pushState({}, '', '/dashboard');
    render(<EventPlannerApp />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Festival Planner' })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
  });

  it('submits a public rsvp without requiring login', async () => {
    const user = userEvent.setup();

    // Mock API calls for public RSVP
    (global.fetch as any).mockImplementation((url: string, options?: any) => {
      // Mock auth as not logged in
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({
          ok: false,
          status: 401,
        } as Response);
      }
      // Mock events list for the store
      if (url.includes('/api/events') && !options?.method) {
        return Promise.resolve({
          ok: true,
          json: async () => MOCK_EVENTS,
        } as Response);
      }
      // Mock tasks list
      if (url.includes('/api/tasks')) {
        return Promise.resolve({
          ok: true,
          json: async () => MOCK_TASKS,
        } as Response);
      }
      // Mock RSVPs list
      if (url.includes('/api/rsvps') && !options?.method) {
        return Promise.resolve({
          ok: true,
          json: async () => MOCK_RSVPS,
        } as Response);
      }
      // Mock RSVP submission
      if (url.includes('/api/rsvps') && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 1,
            event_id: 1,
            name: 'Public Guest',
            email: 'guest@example.com',
            guests: 1,
            status: 'Confirmed',
            created_at: new Date().toISOString(),
          }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      } as Response);
    });

    window.history.pushState({}, '', '/rsvp/event-1');
    render(<EventPlannerApp />);

    // Wait for the RSVP form to load
    await waitFor(() => {
      expect(screen.getByLabelText('Name')).toBeInTheDocument();
    }, { timeout: 3000 });

    await user.type(screen.getByLabelText('Name'), 'Public Guest');
    await user.type(screen.getByLabelText('Email'), 'guest@example.com');
    await user.click(screen.getByRole('button', { name: 'Submit RSVP' }));

    await waitFor(() => {
      expect(screen.getByText('Your RSVP has been saved.')).toBeInTheDocument();
    });
  });
});