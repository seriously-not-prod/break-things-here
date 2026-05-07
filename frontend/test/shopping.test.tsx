import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ShoppingPage from '../src/components/shopping/shopping-page';
import * as shoppingService from '../src/services/shopping-service';

vi.mock('../src/services/shopping-service');

const mockedService = vi.mocked(shoppingService);

const mockList: shoppingService.ShoppingList = {
  id: 1,
  event_id: 1,
  name: 'Beverages',
  created_by: 1,
  created_at: '2026-01-01T00:00:00Z',
};

const mockItem: shoppingService.ShoppingItem = {
  id: 1,
  list_id: 1,
  name: 'Orange Juice',
  quantity: 5,
  unit: 'bottles',
  estimated_cost: 3.5,
  actual_cost: null,
  status: 'Needed',
  assigned_to: null,
  notes: null,
  created_at: '2026-01-01T00:00:00Z',
};

function renderPage(): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={['/events/1/shopping']}>
      <Routes>
        <Route path="/events/:id/shopping" element={<ShoppingPage />} />
        <Route path="/events/:id" element={<div>Event Detail</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ShoppingPage', () => {
  beforeEach(() => {
    mockedService.listShoppingLists.mockResolvedValue([mockList]);
    mockedService.listShoppingItems.mockResolvedValue([mockItem]);
    mockedService.updateShoppingItem.mockResolvedValue({ ...mockItem, status: 'Purchased' });
    mockedService.createShoppingList.mockResolvedValue({
      id: 2,
      event_id: 1,
      name: 'Decorations',
      created_by: 1,
      created_at: '2026-01-02T00:00:00Z',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the shopping list', async () => {
    renderPage();
    expect(await screen.findByText('Beverages')).toBeInTheDocument();
    expect(await screen.findByText('Orange Juice')).toBeInTheDocument();
  });

  it('shows Add List button', async () => {
    renderPage();
    await screen.findByText('Beverages');
    expect(screen.getByRole('button', { name: /add list/i })).toBeInTheDocument();
  });

  it('toggles item to purchased when checkbox clicked', async () => {
    renderPage();
    await screen.findByText('Orange Juice');

    const checkbox = screen.getByRole('checkbox', { name: /mark orange juice as purchased/i });
    await userEvent.click(checkbox);

    await waitFor(() => {
      expect(mockedService.updateShoppingItem).toHaveBeenCalledWith(
        1,
        1,
        1,
        { status: 'Purchased' },
      );
    });
  });

  it('opens add list dialog', async () => {
    renderPage();
    await screen.findByText('Beverages');
    await userEvent.click(screen.getByRole('button', { name: /add list/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/list name/i)).toBeInTheDocument();
  });

  it('shows empty state when no lists', async () => {
    mockedService.listShoppingLists.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/no shopping lists yet/i)).toBeInTheDocument();
  });
});
