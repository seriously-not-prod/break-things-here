/**
 * Analytics Page Tests
 * Tests for the EventAnalytics page and export functionality.
 * BRD 3.10
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AnalyticsPage } from '../src/components/analytics/analytics-page';
import * as analyticsService from '../src/services/analytics-service';

// recharts uses ResizeObserver which is not available in jsdom
class ResizeObserver {
  observe(): void { /* no-op */ }
  unobserve(): void { /* no-op */ }
  disconnect(): void { /* no-op */ }
}
window.ResizeObserver = ResizeObserver;

vi.mock('../src/services/analytics-service', () => ({
  getEventAnalytics: vi.fn(),
  getGlobalAnalytics: vi.fn(),
  getCommunicationMetrics: vi.fn(),
  exportEventReport: vi.fn(),
}));

const mockedService = vi.mocked(analyticsService);

const MOCK_ANALYTICS: analyticsService.EventAnalytics = {
  totalRsvps: 10,
  confirmedRsvps: 6,
  declinedRsvps: 2,
  pendingRsvps: 2,
  checkedInCount: 4,
  acceptanceRate: 60,
  totalBudgetAllocated: 5000,
  totalBudgetSpent: 3000,
  budgetUtilizationPct: 60,
  tasksByStatus: { Pending: 3, InProgress: 2, Blocked: 1, Complete: 4 },
  taskCompletionRate: 40,
  vendorsByStatus: {
    Contacted: 1,
    QuoteReceived: 2,
    Booked: 1,
    Confirmed: 0,
    Cancelled: 0,
  },
  rsvpByDietaryRestriction: [
    { dietary: 'Vegan', count: 3 },
    { dietary: 'Gluten-free', count: 1 },
  ],
  topExpenseCategories: [
    { category: 'Venue', spent: 2000 },
    { category: 'Catering', spent: 1000 },
  ],
};

const MOCK_COMMUNICATION_METRICS: analyticsService.CommunicationMetrics = {
  totals: {
    sent: 42,
    failed: 2,
    delivered: 40,
    uniqueOpens: 25,
    totalOpens: 31,
    uniqueClicks: 8,
    totalClicks: 11,
    openRate: 0.625,
    clickRate: 0.2,
  },
  byCampaign: [
    {
      campaignType: 'Invitation',
      sent: 24,
      opens: 18,
      clicks: 6,
    },
  ],
};

function renderPage(eventId = '42'): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[`/events/${eventId}/analytics`]}>
      <Routes>
        <Route path="/events/:id/analytics" element={<AnalyticsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AnalyticsPage', () => {
  beforeEach(() => {
    mockedService.getEventAnalytics.mockResolvedValue(MOCK_ANALYTICS);
    mockedService.getCommunicationMetrics.mockResolvedValue(MOCK_COMMUNICATION_METRICS);
    mockedService.exportEventReport.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading skeleton before data arrives', () => {
    mockedService.getEventAnalytics.mockReturnValue(new Promise(() => undefined));
    renderPage();
    // Page title should not appear yet; skeletons render as div elements
    expect(screen.queryByText('Event Analytics')).toBeNull();
  });

  it('renders the page heading and KPI chips after data loads', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Event Analytics')).toBeInTheDocument();
    });
    expect(screen.getByText(/Acceptance rate: 60%/i)).toBeInTheDocument();
    expect(screen.getByText(/Budget utilization: 60%/i)).toBeInTheDocument();
    expect(screen.getByText(/Task completion: 40%/i)).toBeInTheDocument();
  });

  it('renders RSVP stat cards', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Event Analytics')).toBeInTheDocument();
    });
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    // "Pending" appears in KPI chips and in the task section too; assert at least one instance
    expect(screen.getAllByText('Pending').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Declined')).toBeInTheDocument();
    expect(screen.getByText('Checked-in')).toBeInTheDocument();
  });

  it('renders task summary section', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Task Summary')).toBeInTheDocument();
    });
    expect(screen.getByText(/Completion rate: 40%/i)).toBeInTheDocument();
  });

  it('renders budget section', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Budget')).toBeInTheDocument();
    });
    expect(screen.getByText('Allocated')).toBeInTheDocument();
    expect(screen.getByText('Spent')).toBeInTheDocument();
  });

  it('shows dietary breakdown chart when data is present', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Dietary Breakdown')).toBeInTheDocument();
    });
    // Chart renders when rsvpByDietaryRestriction is non-empty
    expect(screen.queryByText(/Dietary restriction data is not available/i)).toBeNull();
  });

  it('shows dietary not-available message when data is empty', async () => {
    mockedService.getEventAnalytics.mockResolvedValue({
      ...MOCK_ANALYTICS,
      rsvpByDietaryRestriction: [],
    });
    renderPage();
    await waitFor(() => {
      expect(
        screen.getByText(/Dietary restriction data is not available/i),
      ).toBeInTheDocument();
    });
  });

  it('shows an error alert when fetch fails', async () => {
    mockedService.getEventAnalytics.mockRejectedValue(new Error('Network error'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('calls exportEventReport when Export CSV button is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Export CSV/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Export CSV/i }));
    await waitFor(() => {
      expect(mockedService.exportEventReport).toHaveBeenCalledWith('42');
    });
  });

  it('shows error when export fails', async () => {
    mockedService.exportEventReport.mockRejectedValue(new Error('Export failed'));
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Export CSV/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Export CSV/i }));
    await waitFor(() => {
      expect(screen.getByText('Export failed')).toBeInTheDocument();
    });
  });
});
