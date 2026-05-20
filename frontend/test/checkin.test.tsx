/**
 * CheckInPage unit tests — issue #387
 *
 * Covers:
 * - Renders guest rows with name, email, status chip
 * - Search filter narrows the displayed rows
 * - Clicking "Check In" calls the service and updates the row optimistically
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CheckInPage } from '../src/components/checkin/checkin-page';
import * as guestService from '../src/services/guest-service';
import type { Rsvp } from '../src/services/guest-service';

vi.mock('../src/services/guest-service');
const mockedService = vi.mocked(guestService);

const RSVPS: Rsvp[] = [
  {
    id: 1,
    event_id: 10,
    name: 'Alice Smith',
    email: 'alice@test.com',
    guests: 1,
    canonical_status: 'confirmed',
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
    guests: 2,
    canonical_status: 'pending',
    notes: null,
    source: 'internal',
    checked_in: true,
    checked_in_at: '2026-05-04T10:00:00Z',
    created_at: '2026-01-02T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  },
];

function renderPage(eventId = '10') {
  return render(
    <MemoryRouter initialEntries={[`/events/${eventId}/checkin`]}>
      <Routes>
        <Route path="/events/:id/checkin" element={<CheckInPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CheckInPage (#387)', () => {
  beforeEach(() => {
    mockedService.listRsvps.mockResolvedValue(RSVPS);
    mockedService.checkInGuest.mockResolvedValue({
      ...RSVPS[0],
      checked_in: true,
      checked_in_at: '2026-05-04T12:00:00Z',
    });
  });

  it('renders guest rows with name, email and status', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    expect(screen.getByText('alice@test.com')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    expect(screen.getByText('confirmed')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('already-checked-in row has a disabled button', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    });

    const bobRow = screen.getByText('Bob Jones').closest('tr')!;
    const btn = bobRow.querySelector('button') as HTMLButtonElement;
    expect(btn).toBeDisabled();
  });

  it('filters rows by search query', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    const searchInput = screen.getByRole('textbox', { name: /search guests/i });
    fireEvent.change(searchInput, { target: { value: 'alice' } });

    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.queryByText('Bob Jones')).not.toBeInTheDocument();
  });

  it('clicking Check In calls the service and disables the button', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    const btn = screen.getByRole('button', { name: /check in alice smith/i });
    fireEvent.click(btn);

    // Optimistic disable during in-flight request
    await waitFor(() => {
      expect(mockedService.checkInGuest).toHaveBeenCalledWith('10', 1);
    });

    // After resolution the button should be "Done" (disabled)
    await waitFor(() => {
      const aliceRow = screen.getByText('Alice Smith').closest('tr')!;
      const doneBtn = aliceRow.querySelector('button') as HTMLButtonElement;
      expect(doneBtn).toBeDisabled();
    });
  });

  it('shows progress bar with correct ratio', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText(/1 of 2 guests checked in/i)).toBeInTheDocument();
    });
  });
});
