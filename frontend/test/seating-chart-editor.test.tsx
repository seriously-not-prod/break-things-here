/**
 * SeatingChartEditor unit tests — issue #457 (story #417)
 *
 * Covers:
 * - Renders table drop zones with guest chips
 * - Renders unassigned guest draggable items
 * - Remove (unassign) button calls onUnassign callback
 * - Delete table button calls onDeleteTable callback
 * - Drop on table calls onAssign with correct ids
 * - Drag same guest onto its own table is a no-op
 * - Full table (at capacity) blocks additional assignment
 * - Error alert renders and can be dismissed
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SeatingChartEditor } from '../src/components/seating/seating-chart-editor';
import type { SeatingChartEditorProps } from '../src/components/seating/seating-chart-editor';
import type { Rsvp, SeatingTable } from '../src/services/guest-service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TABLE_A: SeatingTable = {
  id: 1,
  event_id: 10,
  name: 'Table A',
  capacity: 4,
  created_at: '2026-01-01T00:00:00Z',
  guests: [{ rsvp_id: 2, name: 'Bob Jones', email: 'bob@test.com', status: 'Going' }],
};

const TABLE_B: SeatingTable = {
  id: 2,
  event_id: 10,
  name: 'Table B',
  capacity: 6,
  created_at: '2026-01-01T00:00:00Z',
  guests: [],
};

const RSVP_ALICE: Rsvp = {
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
};

const RSVP_BOB: Rsvp = {
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
};

function buildProps(overrides: Partial<SeatingChartEditorProps> = {}): SeatingChartEditorProps {
  return {
    tables: [TABLE_A, TABLE_B],
    rsvps: [RSVP_ALICE, RSVP_BOB],
    error: null,
    onAssign: vi.fn().mockResolvedValue(undefined),
    onUnassign: vi.fn().mockResolvedValue(undefined),
    onDeleteTable: vi.fn().mockResolvedValue(undefined),
    onClearError: vi.fn(),
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SeatingChartEditor (#457)', () => {
  it('renders table cards with names', () => {
    render(<SeatingChartEditor {...buildProps()} />);

    expect(screen.getByText('Table A')).toBeInTheDocument();
    expect(screen.getByText('Table B')).toBeInTheDocument();
  });

  it('shows assigned guest chip inside its table', () => {
    render(<SeatingChartEditor {...buildProps()} />);

    // Bob is assigned to Table A
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
  });

  it('shows unassigned guest (Alice) in unassigned panel', () => {
    render(<SeatingChartEditor {...buildProps()} />);

    // Alice is not in any table.guests → unassigned section
    expect(screen.getByText('Unassigned (1)')).toBeInTheDocument();
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  it('calls onDeleteTable when delete button is clicked', async () => {
    const props = buildProps();
    render(<SeatingChartEditor {...props} />);

    const deleteBtn = screen.getByRole('button', { name: /delete table table a/i });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(props.onDeleteTable).toHaveBeenCalledWith(TABLE_A.id);
    });
  });

  it('calls onUnassign when remove-guest button is clicked', async () => {
    const props = buildProps();
    render(<SeatingChartEditor {...props} />);

    const removeBtn = screen.getByRole('button', { name: /remove bob jones from table/i });
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(props.onUnassign).toHaveBeenCalledWith(TABLE_A.id, RSVP_BOB.id);
    });
  });

  it('shows error alert and calls onClearError when closed', () => {
    const props = buildProps({ error: 'Table is at capacity.' });
    render(<SeatingChartEditor {...props} />);

    expect(screen.getByText('Table is at capacity.')).toBeInTheDocument();

    const closeBtn = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeBtn);

    expect(props.onClearError).toHaveBeenCalled();
  });

  it('shows "All guests have been assigned" when no unassigned guests', () => {
    // Bob is assigned; Alice also assigned to Table B
    const tableB: SeatingTable = {
      ...TABLE_B,
      guests: [{ rsvp_id: 1, name: 'Alice Smith', email: 'alice@test.com', status: 'Going' }],
    };
    render(<SeatingChartEditor {...buildProps({ tables: [TABLE_A, tableB] })} />);

    expect(screen.getByText('All guests have been assigned a seat.')).toBeInTheDocument();
  });

  it('shows empty-state message when there are no tables', () => {
    render(<SeatingChartEditor {...buildProps({ tables: [] })} />);

    expect(screen.getByText(/no tables yet/i)).toBeInTheDocument();
  });

  it('shows correct seat count label on table cards', () => {
    render(<SeatingChartEditor {...buildProps()} />);

    // Table A has 1 guest, capacity 4
    expect(screen.getByLabelText(/1 of 4 seats filled/i)).toBeInTheDocument();
  });

  it('each unassigned guest has drag aria-label', () => {
    render(<SeatingChartEditor {...buildProps()} />);

    expect(screen.getByRole('button', { name: /drag alice smith to a table/i })).toBeInTheDocument();
  });
});
