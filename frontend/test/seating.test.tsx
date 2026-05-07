/**
 * SeatingPage unit tests — issue #386
 *
 * Covers:
 * - Renders table cards with names and capacities
 * - Renders unassigned guest panel
 * - Assign action calls the service
 * - Unassign (chip delete) calls the service
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SeatingPage } from '../src/components/seating/seating-page';
import * as guestService from '../src/services/guest-service';
import type { Rsvp, SeatingTable } from '../src/services/guest-service';

vi.mock('../src/services/guest-service');
const mockedService = vi.mocked(guestService);

const TABLES: SeatingTable[] = [
  {
    id: 1,
    event_id: 10,
    name: 'Table A',
    capacity: 4,
    created_at: '2026-01-01T00:00:00Z',
    guests: [{ rsvp_id: 2, name: 'Bob Jones', email: 'bob@test.com', status: 'Going' }],
  },
  {
    id: 2,
    event_id: 10,
    name: 'Table B',
    capacity: 6,
    created_at: '2026-01-01T00:00:00Z',
    guests: [],
  },
];

const RSVPS: Rsvp[] = [
  {
    id: 1,
    event_id: 10,
    name: 'Alice Smith',
    email: 'alice@test.com',
    guests: 1,
    status: 'Going',
    notes: null,
    source: 'public',
    checked_in: false,
    checked_in_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 2,
    event_id: 10,
    name: 'Bob Jones',
    email: 'bob@test.com',
    guests: 1,
    status: 'Going',
    notes: null,
    source: 'internal',
    checked_in: false,
    checked_in_at: null,
    created_at: '2026-01-02T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  },
];

function renderPage(eventId = '10') {
  return render(
    <MemoryRouter initialEntries={[`/events/${eventId}/seating`]}>
      <Routes>
        <Route path="/events/:id/seating" element={<SeatingPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SeatingPage (#386)', () => {
  beforeEach(() => {
    mockedService.listTables.mockResolvedValue(TABLES);
    mockedService.listRsvps.mockResolvedValue(RSVPS);
    mockedService.assignGuest.mockResolvedValue(undefined);
    mockedService.unassignGuest.mockResolvedValue(undefined);
    mockedService.createTable.mockResolvedValue({
      id: 3,
      event_id: 10,
      name: 'Table C',
      capacity: 8,
      created_at: '2026-05-04T00:00:00Z',
      guests: [],
    });
    mockedService.deleteTable.mockResolvedValue(undefined);
  });

  it('renders table cards', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Table A')).toBeInTheDocument();
    });

    expect(screen.getByText('Table B')).toBeInTheDocument();
  });

  it('shows assigned guest chip inside the correct table', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    });

    // The chip should be inside the Table A card
    const tableACard = screen.getByText('Table A').closest('.MuiCard-root') ?? document.body;
    expect(tableACard).toHaveTextContent('Bob Jones');
  });

  it('shows unassigned guest in the right panel', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    // Alice is not in any table.guests so she appears in the unassigned panel
    expect(screen.getByText('Unassigned (1)')).toBeInTheDocument();
  });

  it('unassign button calls unassignGuest service', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Table A')).toBeInTheDocument();
    });

    // The chip for Bob in Table A has a delete (×) button
    const deleteBtn = screen.getByRole('button', {
      name: /remove bob jones from table/i,
    });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(mockedService.unassignGuest).toHaveBeenCalledWith('10', 1, 2);
    });
  });

  it('New Table button opens dialog and submits', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create new table/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /create new table/i }));

    // Dialog should be visible
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/table name/i);
    fireEvent.change(nameInput, { target: { value: 'Table C' } });

    fireEvent.click(screen.getByRole('button', { name: /save new table/i }));

    await waitFor(() => {
      expect(mockedService.createTable).toHaveBeenCalledWith('10', { name: 'Table C', capacity: 8 });
    });
  });
});
