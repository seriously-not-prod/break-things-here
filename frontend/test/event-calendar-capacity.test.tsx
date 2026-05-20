/**
 * Calendar capacity / waitlist rendering — task #447 + compatibility task #448
 *
 * Confirms that the calendar chip surfaces capacity progress and that
 * an over-capacity event shows the overflow indicator.
 */

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { EventCalendarView } from '../src/components/events/event-calendar-view';
import type { Event } from '../src/services/events-service';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importActual) => {
  const actual = await importActual<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

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
    latitude: null,
    longitude: null,
    waitlist_enabled: false,
    going_count: 0,
    pending_count: 0,
    created_by: 1,
    creator_name: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

const HALF_FULL = makeEvent({
  id: 11,
  title: 'Half Full',
  event_date: '2026-05-12',
  capacity: 100,
  going_count: 40,
});
const OVER_BY_TWO = makeEvent({
  id: 12,
  title: 'Sold Out',
  event_date: '2026-05-13',
  capacity: 50,
  going_count: 52,
  waitlist_enabled: true,
});

describe('EventCalendarView — capacity surfacing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-10T10:00:00Z'));
    mockNavigate.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders capacity progress in the chip label', () => {
    render(
      <MemoryRouter>
        <EventCalendarView events={[HALF_FULL]} />
      </MemoryRouter>,
    );
    const chip = screen.getByTestId('calendar-event-chip-11');
    expect(chip.textContent).toContain('Half Full');
    expect(chip.textContent).toContain('40/100');
  });

  it('shows waitlist overflow on over-capacity events when waitlist is enabled', () => {
    render(
      <MemoryRouter>
        <EventCalendarView events={[OVER_BY_TWO]} />
      </MemoryRouter>,
    );
    const chip = screen.getByTestId('calendar-event-chip-12');
    expect(chip.textContent).toContain('52/50');
    expect(chip.textContent).toContain('waitlist 2');
  });

  it('uses "over by N" wording when overflow happens with waitlist disabled', () => {
    const overflowNoWaitlist = makeEvent({
      id: 14,
      title: 'Closed Door',
      event_date: '2026-05-15',
      capacity: 30,
      going_count: 33,
      waitlist_enabled: false,
    });
    render(
      <MemoryRouter>
        <EventCalendarView events={[overflowNoWaitlist]} />
      </MemoryRouter>,
    );
    const chip = screen.getByTestId('calendar-event-chip-14');
    expect(chip.textContent).toContain('33/30');
    expect(chip.textContent).toContain('over by 3');
    expect(chip.textContent).not.toContain('waitlist');
  });

  it('omits capacity text when capacity is unset', () => {
    const noCap = makeEvent({ id: 13, title: 'TBD', event_date: '2026-05-14' });
    render(
      <MemoryRouter>
        <EventCalendarView events={[noCap]} />
      </MemoryRouter>,
    );
    const chip = screen.getByTestId('calendar-event-chip-13');
    expect(chip.textContent).toBe('TBD');
  });
});
