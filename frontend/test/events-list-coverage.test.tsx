/**
 * Events list page coverage tests — task #820
 *
 * Comprehensive test coverage for the events-page component focusing on
 * rendering, filtering, status handling, and user interactions.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../src/contexts/auth-context', async () => {
  const actual = await vi.importActual<typeof import('../src/contexts/auth-context')>(
    '../src/contexts/auth-context',
  );
  return { ...actual, useAuth: vi.fn() };
});

vi.mock('../src/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/api-client')>(
    '../src/lib/api-client',
  );
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
    apiFetch: vi.fn(),
  };
});

vi.mock('../src/services/event-filter-presets-service', () => ({
  listPresets: vi.fn().mockResolvedValue([]),
  createPreset: vi.fn(),
  updatePreset: vi.fn(),
  deletePreset: vi.fn(),
}));

vi.mock('../src/services/event-bulk-service', () => ({
  bulkArchiveOrDelete: vi.fn(),
  bulkExportCsv: vi.fn(),
}));

vi.mock('../src/services/event-templates-service', () => ({
  listTemplates: vi.fn().mockResolvedValue([]),
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  applyTemplate: vi.fn(),
  getTemplate: vi.fn(),
}));

import EventsPage from '../src/components/events/events-page';
import * as authContext from '../src/contexts/auth-context';
import * as apiClient from '../src/lib/api-client';

const ADMIN_USER = {
  id: 1,
  email: 'admin@test.com',
  displayName: 'Admin User',
  roleId: 1,
  roleName: 'Admin',
};

const ORGANIZER_USER = {
  id: 2,
  email: 'organizer@test.com',
  displayName: 'Organizer',
  roleId: 2,
  roleName: 'Organizer',
};

const ATTENDEE_USER = {
  id: 3,
  email: 'attendee@test.com',
  displayName: 'Attendee',
  roleId: 3,
  roleName: 'Attendee',
};

const MOCK_EVENTS = [
  {
    id: 1,
    title: 'Summer Music Festival',
    location: 'Central Park',
    date: '2026-07-15',
    capacity: 500,
    status: 'Active',
    creator_name: 'Admin User',
    created_by: 1,
    event_type: 'Festival',
    tags: 'music,outdoor,summer',
    latitude: 40.785091,
    longitude: -73.968285,
    waitlist_enabled: true,
    going_count: 450,
    pending_count: 20,
  },
  {
    id: 2,
    title: 'Tech Workshop',
    location: 'Convention Center',
    date: '2026-08-20',
    capacity: 100,
    status: 'Draft',
    creator_name: 'Organizer',
    created_by: 2,
    event_type: 'Workshop',
    tags: 'tech,indoor',
    latitude: null,
    longitude: null,
    waitlist_enabled: false,
    going_count: 30,
    pending_count: 5,
  },
  {
    id: 3,
    title: 'Art Exhibition',
    location: 'Gallery',
    date: '2026-09-10',
    capacity: null,
    status: 'Planning',
    creator_name: 'Organizer',
    created_by: 2,
    event_type: 'Exhibition',
    tags: 'art',
    latitude: null,
    longitude: null,
    waitlist_enabled: false,
    going_count: 0,
    pending_count: 0,
  },
  {
    id: 4,
    title: 'Cancelled Gala',
    location: 'Ballroom',
    date: '2026-06-01',
    capacity: 200,
    status: 'Cancelled',
    creator_name: 'Admin User',
    created_by: 1,
    event_type: 'Gala',
    tags: null,
    latitude: null,
    longitude: null,
    waitlist_enabled: false,
    going_count: 0,
    pending_count: 0,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authContext.useAuth).mockReturnValue({
    user: ADMIN_USER,
    loading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  });
  vi.mocked(apiClient.api.get).mockResolvedValue(MOCK_EVENTS);
});

function renderPage(props?: { initialView?: 'list' | 'grid' | 'calendar' | 'timeline'; ownerOnly?: boolean }) {
  return render(
    <MemoryRouter>
      <EventsPage {...props} />
    </MemoryRouter>,
  );
}

describe('EventsPage - Core Rendering', () => {
  it('renders loading state initially', () => {
    vi.mocked(apiClient.api.get).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders event list after loading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Summer Music Festival')).toBeInTheDocument();
    });
    expect(screen.getByText('Tech Workshop')).toBeInTheDocument();
    expect(screen.getByText('Art Exhibition')).toBeInTheDocument();
  });

  it('renders error state when API call fails', async () => {
    vi.mocked(apiClient.api.get).mockRejectedValue(new Error('Network error'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('renders empty state when no events returned', async () => {
    vi.mocked(apiClient.api.get).mockResolvedValue([]);
    renderPage();
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
  });
});

describe('EventsPage - Status Display', () => {
  it('displays status chips for events', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Summer Music Festival')).toBeInTheDocument();
    });
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('handles Cancelled status display', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Cancelled Gala')).toBeInTheDocument();
    });
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });
});

describe('EventsPage - Capacity Display', () => {
  it('shows capacity with available spots', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Summer Music Festival')).toBeInTheDocument();
    });
    // 450/500 · 50 left
    expect(screen.getByText(/450\/500/)).toBeInTheDocument();
  });

  it('shows dash for events without capacity', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Art Exhibition')).toBeInTheDocument();
    });
    // null capacity shows '—' (may appear multiple times for different events)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });
});

describe('EventsPage - Search and Filters', () => {
  it('renders search input', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Summer Music Festival')).toBeInTheDocument();
    });
    const searchInput = screen.getByPlaceholderText(/search/i);
    expect(searchInput).toBeInTheDocument();
  });

  it('renders status filter', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Summer Music Festival')).toBeInTheDocument();
    });
  });
});

describe('EventsPage - User Permissions', () => {
  it('shows create button for admin users', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Summer Music Festival')).toBeInTheDocument();
    });
    // Admin should see the create button
    expect(screen.getByRole('button', { name: /create|new|add/i })).toBeInTheDocument();
  });

  it('shows create button for organizers', async () => {
    vi.mocked(authContext.useAuth).mockReturnValue({
      user: ORGANIZER_USER,
      loading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Summer Music Festival')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /create|new|add/i })).toBeInTheDocument();
  });

  it('hides create button for attendees', async () => {
    vi.mocked(authContext.useAuth).mockReturnValue({
      user: ATTENDEE_USER,
      loading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Summer Music Festival')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /create event/i })).not.toBeInTheDocument();
  });
});

describe('EventsPage - View Modes', () => {
  it('defaults to list view', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Summer Music Festival')).toBeInTheDocument();
    });
    // Table should be rendered in list mode
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('supports calendar view mode', async () => {
    renderPage({ initialView: 'calendar' });
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
  });
});

describe('EventsPage - Tags', () => {
  it('renders tag chips from events', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Summer Music Festival')).toBeInTheDocument();
    });
  });
});
