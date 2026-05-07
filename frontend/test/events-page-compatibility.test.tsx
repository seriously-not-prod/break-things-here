/**
 * Events page compatibility tests — task #448
 *
 * Verifies that the events list page renders the new metadata (capacity,
 * waitlist, templates / bulk toolbar) without breaking existing behaviour.
 * The component is exercised against a mocked api-client.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
import * as bulkService from '../src/services/event-bulk-service';

const ORGANIZER = {
  id: 5,
  email: 'org@test.com',
  displayName: 'Org',
  roleId: 2,
  roleName: 'Organizer',
};

const EVENTS = [
  {
    id: 101,
    title: 'Sold Out Concert',
    location: 'Arena',
    date: '2026-09-01',
    capacity: 100,
    status: 'Active',
    creator_name: 'Org',
    created_by: 5,
    event_type: 'Concert',
    tags: 'music,outdoor',
    latitude: 40.0,
    longitude: -73.0,
    waitlist_enabled: true,
    going_count: 105,
    pending_count: 4,
  },
  {
    id: 102,
    title: 'Quiet Workshop',
    location: 'Hall',
    date: '2026-10-15',
    capacity: 50,
    status: 'Draft',
    creator_name: 'Org',
    created_by: 5,
    event_type: 'Workshop',
    tags: null,
    latitude: null,
    longitude: null,
    waitlist_enabled: false,
    going_count: 10,
    pending_count: 1,
  },
];

beforeEach(() => {
  vi.mocked(authContext.useAuth).mockReturnValue({
    user: ORGANIZER,
    loading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  });
  vi.mocked(apiClient.api.get).mockResolvedValue(EVENTS);
});

function renderPage() {
  return render(
    <MemoryRouter>
      <EventsPage />
    </MemoryRouter>,
  );
}

describe('EventsPage compatibility', () => {
  it('renders capacity progress and waitlist chip on the list', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Sold Out Concert')).toBeInTheDocument());
    // Sold Out: 105 going on capacity 100, waitlist enabled -> waitlist 5
    expect(screen.getByText('105/100 · waitlist 5')).toBeInTheDocument();
    // Waitlist chip rendered for the event with waitlist_enabled
    expect(screen.getAllByText(/Waitlist/i).length).toBeGreaterThanOrEqual(1);
    // Quiet Workshop: 10/50 · 40 left
    expect(screen.getByText('10/50 · 40 left')).toBeInTheDocument();
  });

  it('uses "over by N" wording when overflow happens with waitlist disabled', async () => {
    const overflowNoWaitlist = [
      {
        ...EVENTS[0],
        id: 110,
        title: 'Hard Cap',
        going_count: 102,
        waitlist_enabled: false,
      },
    ];
    vi.mocked(apiClient.api.get).mockResolvedValue(overflowNoWaitlist);
    renderPage();
    await waitFor(() => expect(screen.getByText('Hard Cap')).toBeInTheDocument());
    expect(screen.getByText('102/100 · over by 2')).toBeInTheDocument();
  });

  it('exposes the bulk selection toolbar', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Sold Out Concert')).toBeInTheDocument());
    expect(screen.getByTestId('bulk-archive-button')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-export-button')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-delete-button')).toBeInTheDocument();
  });

  it('runs bulk archive against selected events', async () => {
    vi.mocked(bulkService.bulkArchiveOrDelete).mockResolvedValueOnce({
      action: 'archive',
      results: [{ event_id: 101, status: 'ok' }],
      success: 1,
      total: 1,
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('Sold Out Concert')).toBeInTheDocument());
    const checkbox = screen.getByLabelText('select-event-101') as HTMLInputElement;
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByTestId('bulk-archive-button'));
    await waitFor(() =>
      expect(bulkService.bulkArchiveOrDelete).toHaveBeenCalledWith('archive', [101]),
    );
  });

  it('opens the advanced search panel and forwards filters to the API', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Sold Out Concert')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Advanced/i }));
    const titleInput = screen.getByLabelText('advanced-title') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'concert' } });
    await waitFor(() => {
      const calls = vi.mocked(apiClient.api.get).mock.calls;
      const lastCall = calls[calls.length - 1]?.[0];
      expect(typeof lastCall === 'string' && lastCall).toContain('title_q=concert');
    });
  }, 15000);
});
