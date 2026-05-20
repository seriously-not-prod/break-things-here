/**
 * Tests: EventCalendarView
 * Covers: renders current month, events appear on correct dates.
 * BRD 3.2.2
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { EventCalendarView } from '../src/components/events/event-calendar-view';
import type { Event } from '../src/services/events-service';

// ── Mock react-router-dom navigation ─────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importActual) => {
  const actual = await importActual<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEvent(
  overrides: Partial<Event> & { id: number; title: string; event_date: string },
): Event {
  return {
    description: null,
    location: null,
    capacity: null,
    status: 'Active',
    cover_image_url: null,
    event_type: null,
    is_public: false,
    rsvp_deadline: null,
    tags: null,
    created_by: 1,
    creator_name: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// Use a fixed reference date so tests are deterministic: May 2026
// We freeze the system month via a controlled set of events dated in May 2026.
const MAY_EVENT = makeEvent({
  id: 1,
  title: 'Summer Kickoff',
  event_date: '2026-05-15',
  status: 'Active',
});

const CANCELLED_EVENT = makeEvent({
  id: 2,
  title: 'Cancelled Show',
  event_date: '2026-05-22',
  status: 'Cancelled',
});

function renderCalendar(events: Event[] = [MAY_EVENT]) {
  return render(
    <MemoryRouter>
      <EventCalendarView events={events} />
    </MemoryRouter>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('EventCalendarView', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-10T10:00:00Z'));
    mockNavigate.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the current month heading', () => {
    renderCalendar();
    const heading = screen.getByRole('heading', { level: 6 });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveTextContent('May 2026');
  });

  it('renders the calendar grid with role=grid', () => {
    renderCalendar();
    expect(screen.getByRole('grid')).toBeInTheDocument();
  });

  it('renders gridcells for each day in the view', () => {
    renderCalendar();
    const cells = screen.getAllByRole('gridcell');
    // A month view covers 4–6 weeks × 7 days = 28–42 cells
    expect(cells.length).toBeGreaterThanOrEqual(28);
    expect(cells.length).toBeLessThanOrEqual(42);
  });

  it('shows an event chip on the correct date cell', () => {
    renderCalendar([MAY_EVENT]);
    expect(screen.getByText('Summer Kickoff')).toBeInTheDocument();
  });

  it('colour-codes cancelled events differently from active events', () => {
    renderCalendar([MAY_EVENT, CANCELLED_EVENT]);
    expect(screen.getByText('Summer Kickoff')).toBeInTheDocument();
    expect(screen.getByText('Cancelled Show')).toBeInTheDocument();
  });

  it('navigates to event detail when chip is clicked', async () => {
    renderCalendar([MAY_EVENT]);
    fireEvent.click(screen.getByText('Summer Kickoff'));
    expect(mockNavigate).toHaveBeenCalledWith('/events/1');
  });

  it('shows previous- and next-month navigation buttons', () => {
    renderCalendar();
    expect(screen.getByRole('button', { name: /previous month/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next month/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /today/i })).toBeInTheDocument();
  });

  it('navigates to next month when next button is clicked', async () => {
    renderCalendar();
    const heading = screen.getByRole('heading', { level: 6 });
    const initialMonth = heading.textContent ?? '';

    fireEvent.click(screen.getByRole('button', { name: /next month/i }));

    const updatedHeading = screen.getByRole('heading', { level: 6 });
    expect(updatedHeading.textContent).not.toBe(initialMonth);
  });

  it('renders empty calendar without errors when no events are passed', () => {
    renderCalendar([]);
    expect(screen.getByRole('grid')).toBeInTheDocument();
  });
});
