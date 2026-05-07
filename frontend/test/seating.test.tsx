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
import * as nameTagPdf from '../src/utils/name-tag-pdf-export';
import type { Rsvp, SeatingTable } from '../src/services/guest-service';

vi.mock('../src/services/guest-service');
vi.mock('../src/utils/name-tag-pdf-export', () => ({
  generateNameTagPdf: vi.fn(),
}));
const mockedService = vi.mocked(guestService);

const TABLES: SeatingTable[] = [
  {
    id: 1,
    event_id: 10,
    name: 'Table A',
    capacity: 4,
    layout_x: 32,
    layout_y: 32,
    created_at: '2026-01-01T00:00:00Z',
    guests: [{ rsvp_id: 2, name: 'Bob Jones', email: 'bob@test.com', status: 'Going' }],
  },
  {
    id: 2,
    event_id: 10,
    name: 'Table B',
    capacity: 6,
    layout_x: 332,
    layout_y: 32,
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

function createDataTransfer(): DataTransfer {
  const data = new Map<string, string>();
  return {
    dropEffect: 'move',
    effectAllowed: 'all',
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [],
    clearData: (format?: string) => {
      if (format) {
        data.delete(format);
        return;
      }
      data.clear();
    },
    getData: (format: string) => data.get(format) ?? '',
    setData: (format: string, value: string) => {
      data.set(format, value);
    },
    setDragImage: () => undefined,
  } as DataTransfer;
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
      layout_x: 32,
      layout_y: 242,
      created_at: '2026-05-04T00:00:00Z',
      guests: [],
    });
    mockedService.deleteTable.mockResolvedValue(undefined);
    mockedService.updateTableLayout.mockImplementation(async (_eventId, tableId, payload) => ({
      ...(TABLES.find((table) => table.id === Number(tableId)) ?? TABLES[0]),
      layout_x: payload.layout_x,
      layout_y: payload.layout_y,
    }));
    vi.mocked(nameTagPdf.generateNameTagPdf).mockReturnValue({} as never);
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

    // The draggable guest card should be inside the Table A card
    const tableACard = screen.getByText('Table A').closest('.MuiCard-root') ?? document.body;
    expect(tableACard).toHaveTextContent('Bob Jones');
  });

  it('shows unassigned guest in the right panel', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    expect(screen.getByText('Unassigned Guests')).toBeInTheDocument();
    expect(screen.getByText('1 guests waiting for a seat')).toBeInTheDocument();
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
  }, 15000);

  it('supports visually reassigning a guest by dropping them on another table', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('draggable-guest-1')).toBeInTheDocument();
    });

    const dataTransfer = createDataTransfer();
    fireEvent.dragStart(screen.getByTestId('draggable-guest-1'), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId('table-card-2'), { dataTransfer });
    fireEvent.drop(screen.getByTestId('table-card-2'), { dataTransfer });

    await waitFor(() => {
      expect(mockedService.assignGuest).toHaveBeenCalledWith('10', 2, 1);
    });
  });

  it('persists table layout after dragging a table handle', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /move table a/i })).toBeInTheDocument();
    });

    const canvas = screen.getByTestId('seating-layout-canvas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 960,
      bottom: 560,
      width: 960,
      height: 560,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.pointerDown(screen.getByRole('button', { name: /move table a/i }), {
      pointerId: 1,
      clientX: 72,
      clientY: 72,
    });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 360, clientY: 240 });
    fireEvent.pointerUp(window, { pointerId: 1 });

    await waitFor(() => {
      expect(mockedService.updateTableLayout).toHaveBeenCalledWith(
        '10',
        1,
        expect.objectContaining({
          layout_x: expect.any(Number),
          layout_y: expect.any(Number),
        }),
      );
    });
  });

  it('exports seating name tags with table assignments', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export seating name tags as pdf/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /export seating name tags as pdf/i }));

    await waitFor(() => {
      expect(nameTagPdf.generateNameTagPdf).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'event-10-seating',
          guests: expect.arrayContaining([
            expect.objectContaining({ name: 'Alice Smith', tableName: null }),
            expect.objectContaining({ name: 'Bob Jones', tableName: 'Table A' }),
          ]),
        }),
      );
    });
  });
});
