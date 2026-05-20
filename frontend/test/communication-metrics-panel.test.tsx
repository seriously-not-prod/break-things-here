import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommunicationMetricsPanel } from '../src/components/analytics/communication-metrics-panel';
import * as analyticsService from '../src/services/analytics-service';
import type { CommunicationMetrics } from '../src/services/analytics-service';

vi.mock('../src/services/analytics-service');

const mockedGetMetrics = vi.mocked(analyticsService.getCommunicationMetrics);

const ZERO: CommunicationMetrics = {
  totals: {
    sent: 0,
    failed: 0,
    delivered: 0,
    uniqueOpens: 0,
    totalOpens: 0,
    uniqueClicks: 0,
    totalClicks: 0,
    openRate: 0,
    clickRate: 0,
  },
  byCampaign: [],
};

const POPULATED: CommunicationMetrics = {
  totals: {
    sent: 100,
    failed: 4,
    delivered: 96,
    uniqueOpens: 60,
    totalOpens: 88,
    uniqueClicks: 20,
    totalClicks: 25,
    openRate: 0.625,
    clickRate: 0.2083,
  },
  byCampaign: [
    { campaignType: 'invitation', sent: 80, opens: 50, clicks: 18 },
    { campaignType: 'reminder', sent: 20, opens: 10, clicks: 2 },
  ],
};

describe('CommunicationMetricsPanel', () => {
  beforeEach(() => {
    mockedGetMetrics.mockReset();
  });

  it('renders the empty state when nothing has been sent', async () => {
    mockedGetMetrics.mockResolvedValue(ZERO);
    render(<CommunicationMetricsPanel eventId={1} />);

    await waitFor(() =>
      expect(screen.getByText('No communication metrics yet')).toBeInTheDocument(),
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders aggregate cards and per-campaign rows for populated data', async () => {
    mockedGetMetrics.mockResolvedValue(POPULATED);
    render(<CommunicationMetricsPanel eventId={1} />);

    await waitFor(() => expect(screen.getByText('Communication metrics')).toBeInTheDocument());

    // Aggregate cards — "Sent" appears as both a metric card label AND a
    // column header in the table, so check that at least one is present.
    expect(screen.getAllByText('Sent').length).toBeGreaterThan(0);
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('96 delivered · 4 failed')).toBeInTheDocument();
    expect(screen.getByText('62.5%')).toBeInTheDocument(); // openRate
    expect(screen.getByText('60 unique · 88 total')).toBeInTheDocument();

    // Campaign breakdown
    expect(screen.getByText('invitation')).toBeInTheDocument();
    expect(screen.getByText('reminder')).toBeInTheDocument();
  });

  it('shows an error alert when the request fails', async () => {
    mockedGetMetrics.mockRejectedValue(new Error('Network down'));
    render(<CommunicationMetricsPanel eventId={1} />);

    await waitFor(() => expect(screen.getByText('Network down')).toBeInTheDocument());
  });
});
