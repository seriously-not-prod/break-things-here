import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GuestsPage from '../src/components/guests/guests-page';
import * as guestService from '../src/services/guest-service';
import * as nameTagPdf from '../src/utils/name-tag-pdf-export';
import type { RsvpGuest } from '../src/services/guest-service';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../src/services/guest-service', () => ({
  listRsvpGuests: vi.fn(),
  listTables: vi.fn(),
  createRsvp: vi.fn(),
  updateRsvp: vi.fn(),
  deleteRsvp: vi.fn(),
  checkInGuest: vi.fn(),
  importCsv: vi.fn(),
  exportCsvUrl: vi.fn(() => '/api/events/1/rsvps/export?format=csv'),
  sendInvitation: vi.fn(),
  sendReminder: vi.fn(),
  listCommunicationLog: vi.fn(),
}));

vi.mock('../src/utils/name-tag-pdf-export', () => ({
  generateNameTagPdf: vi.fn(),
}));

const mockGuests: RsvpGuest[] = [
  {
    id: 1,
    event_id: 1,
    name: 'Alice Smith',
    email: 'alice@example.com',
    phone: '555-1234',
    guests: 1,
    status: 'Going',
    notes: null,
    source: 'internal',
    checked_in: false,
    checked_in_at: null,
    dietary_restriction: 'None',
    accessibility_needs: null,
    plus_one: false,
    plus_one_name: null,
    guest_group: 'Friends',
    rsvp_deadline: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 2,
    event_id: 1,
    name: 'Bob Jones',
    email: 'bob@example.com',
    phone: null,
    guests: 2,
    status: 'Pending',
    notes: 'VIP',
    source: 'internal',
    checked_in: true,
    checked_in_at: '2026-05-01T10:00:00Z',
    dietary_restriction: 'Vegan',
    accessibility_needs: 'Wheelchair access',
    plus_one: true,
    plus_one_name: 'Carol Jones',
    guest_group: 'VIPs',
    rsvp_deadline: null,
    created_at: '2026-01-02T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  },
];

const mockTables = [
  {
    id: 10,
    event_id: 1,
    name: 'VIP Table',
    capacity: 4,
    layout_x: 40,
    layout_y: 40,
    created_at: '2026-01-01T00:00:00Z',
    guests: [{ rsvp_id: 2, name: 'Bob Jones', email: 'bob@example.com', status: 'Pending' }],
  },
];

function renderGuests(): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={['/events/1/guests']}>
      <Routes>
        <Route path="/events/:id/guests" element={<GuestsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GuestsPage', () => {
  beforeEach(() => {
    vi.mocked(guestService.listRsvpGuests).mockResolvedValue(mockGuests);
    vi.mocked(guestService.listTables).mockResolvedValue(mockTables);
    vi.mocked(guestService.listCommunicationLog).mockResolvedValue([]);
    vi.mocked(guestService.createRsvp).mockResolvedValue(mockGuests[0]);
    vi.mocked(guestService.deleteRsvp).mockResolvedValue(undefined);
    vi.mocked(nameTagPdf.generateNameTagPdf).mockReturnValue({} as never);
  });

  it('renders the guest list heading', async () => {
    renderGuests();
    expect(await screen.findByText('Guest List')).toBeInTheDocument();
  });

  it('renders all guests after load', async () => {
    renderGuests();
    expect(await screen.findByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
  });

  it('renders the guest table with expected columns', async () => {
    renderGuests();
    await screen.findByText('Alice Smith');
    const table = screen.getByRole('table', { name: /guest list/i });
    expect(within(table).getByText('Name')).toBeInTheDocument();
    expect(within(table).getByText('Email')).toBeInTheDocument();
    expect(within(table).getByText('Status')).toBeInTheDocument();
    expect(within(table).getByText('Dietary')).toBeInTheDocument();
    expect(within(table).getByText('Checked In')).toBeInTheDocument();
  });

  it('filters guests by search query', async () => {
    renderGuests();
    await screen.findByText('Alice Smith');

    const searchInput = screen.getByRole('textbox', { name: /search guests/i });
    await userEvent.type(searchInput, 'alice');

    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.queryByText('Bob Jones')).not.toBeInTheDocument();
  });

  it('filters guests by status', async () => {
    renderGuests();
    await screen.findByText('Alice Smith');

    const statusSelect = screen.getByRole('combobox', { name: /status/i });
    await userEvent.click(statusSelect);
    await userEvent.click(screen.getByRole('option', { name: 'Pending' }));

    expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
  });

  it('opens Add Guest dialog on button click', async () => {
    renderGuests();
    await screen.findByText('Alice Smith');

    const addButton = screen.getByRole('button', { name: /add guest/i });
    await userEvent.click(addButton);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Add Guest' })).toBeInTheDocument();
  });

  it('Add Guest dialog has name and email fields', async () => {
    renderGuests();
    await screen.findByText('Alice Smith');
    await userEvent.click(screen.getByRole('button', { name: /add guest/i }));

    expect(screen.getByRole('textbox', { name: /guest name/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /guest email/i })).toBeInTheDocument();
  });

  it('shows bulk action bar when guests are selected', async () => {
    renderGuests();
    await screen.findByText('Alice Smith');

    const checkboxes = screen.getAllByRole('checkbox');
    // First checkbox is "select all", second is for first guest
    await userEvent.click(checkboxes[1]);

    expect(screen.getByText(/1 selected/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete selected/i })).toBeInTheDocument();
  });

  it('shows Import CSV and Export buttons', async () => {
    renderGuests();
    await screen.findByText('Alice Smith');

    expect(screen.getByRole('button', { name: /import csv/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export guest name tags as pdf/i })).toBeInTheDocument();
  });

  it('exports name tags with seating metadata from the toolbar', async () => {
    renderGuests();
    await screen.findByText('Alice Smith');

    await userEvent.click(screen.getByRole('button', { name: /export guest name tags as pdf/i }));

    expect(nameTagPdf.generateNameTagPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'event-1',
        guests: expect.arrayContaining([
          expect.objectContaining({ name: 'Alice Smith', tableName: null }),
          expect.objectContaining({ name: 'Bob Jones', tableName: 'VIP Table' }),
        ]),
      }),
    );
  });

  it('opens Import CSV dialog on button click', async () => {
    renderGuests();
    await screen.findByText('Alice Smith');

    await userEvent.click(screen.getByRole('button', { name: /import csv/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    expect(screen.getByText('Import Guests from CSV')).toBeInTheDocument();
  });

  it('switching to Communication tab shows send form', async () => {
    renderGuests();
    await screen.findByText('Alice Smith');

    await userEvent.click(screen.getByRole('tab', { name: /communication/i }));

    await waitFor(() => {
      expect(screen.getByText('Send Communication')).toBeInTheDocument();
    });
  });
});
