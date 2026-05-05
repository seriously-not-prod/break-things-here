import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../src/services/vendors-service', () => ({
  listVendors: vi.fn().mockResolvedValue([]),
  createVendor: vi.fn().mockResolvedValue({ id: 1, event_id: 1, name: 'Test', category: 'Catering', status: 'Contacted', email: null, phone: null, website: null, quoted_amount: null, contract_file: null, notes: null, rating: null, created_by: 1, created_at: '', updated_at: '' }),
  updateVendor: vi.fn(),
  deleteVendor: vi.fn(),
  uploadVendorContract: vi.fn(),
}));

import VendorsPage from '../src/components/vendors/vendors-page';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/events/1/vendors']}>
      <Routes>
        <Route path="/events/:id/vendors" element={<VendorsPage />} />
        <Route path="/events/:id" element={<div>Event</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('dialog category interaction debug', () => {
  it('can interact with category select', async () => {
    renderPage();
    await screen.findByText(/No vendors found/i);

    await userEvent.click(screen.getByRole('button', { name: /add vendor/i }));
    const dialog = await screen.findByRole('dialog');

    const categoryCombobox = within(dialog).getByRole('combobox', { name: /category/i });
    fireEvent.mouseDown(categoryCombobox);
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByRole('option', { name: 'Catering' })).toBeInTheDocument();

    expect(dialog).toBeInTheDocument();
  }, 15000);
});
