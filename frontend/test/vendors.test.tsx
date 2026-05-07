import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import VendorsPage from '../src/components/vendors/vendors-page';
import * as vendorsService from '../src/services/vendors-service';

vi.mock('../src/services/vendors-service');

const mockedService = vi.mocked(vendorsService);

function renderPage(): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={['/events/1/vendors']}>
      <Routes>
        <Route path="/events/:id/vendors" element={<VendorsPage />} />
        <Route path="/events/:id" element={<div>Event Detail</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('VendorsPage', () => {
  beforeEach(() => {
    mockedService.listVendors.mockResolvedValue([
      {
        id: 1,
        event_id: 1,
        name: 'Acme Catering',
        category: 'Catering',
        email: 'contact@acme.com',
        phone: null,
        website: null,
        status: 'Confirmed',
        quoted_amount: 1500,
        contract_file: null,
        notes: 'Great food',
        rating: 4,
        created_by: 1,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);
    mockedService.createVendor.mockResolvedValue({
      id: 2,
      event_id: 1,
      name: 'Sound Co',
      category: 'Audio/Visual',
      email: null,
      phone: null,
      website: null,
      status: 'Contacted',
      quoted_amount: null,
      contract_file: null,
      notes: null,
      rating: null,
      created_by: 1,
      created_at: '2026-01-02T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the vendor list', async () => {
    renderPage();
    expect(await screen.findByText('Acme Catering')).toBeInTheDocument();
    expect(screen.getByText('Catering')).toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
  });

  it('shows the Add Vendor button', async () => {
    renderPage();
    await screen.findByText('Acme Catering');
    expect(screen.getByRole('button', { name: /add vendor/i })).toBeInTheDocument();
  });

  it('opens the add vendor dialog on button click', async () => {
    renderPage();
    await screen.findByText('Acme Catering');
    await userEvent.click(screen.getByRole('button', { name: /add vendor/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/vendor name/i)).toBeInTheDocument();
  }, 15000);

  it('submits a new vendor', async () => {
    renderPage();
    await screen.findByText('Acme Catering');
    await userEvent.click(screen.getByRole('button', { name: /add vendor/i }));

    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/vendor name/i), 'Sound Co');

    fireEvent.mouseDown(within(dialog).getByRole('combobox', { name: /category/i }));
    const listbox = await screen.findByRole('listbox');
    await userEvent.click(within(listbox).getByRole('option', { name: 'Catering' }));

    await userEvent.click(within(dialog).getByRole('button', { name: /^add$/i }));

    await waitFor(() => expect(mockedService.createVendor).toHaveBeenCalledTimes(1));
  }, 15000);

  it('displays empty state when no vendors', async () => {
    mockedService.listVendors.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/no vendors found/i)).toBeInTheDocument();
  });
});
