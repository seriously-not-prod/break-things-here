/**
 * Tests: VendorAiRecommendationPanel — Issue #960
 *
 * Covers:
 * - Initial render: heading, advisory alert, prompt input, button
 * - Loading state: Analysing… text, disabled button and input
 * - Error state: alert on failure, re-enables button, clears previous result
 * - Happy path: recommendation cards, scores, rank chips, summary, strengths, concerns
 * - Advisory label always visible in results
 * - Correct API payload (eventId as number, optional prompt)
 * - Empty recommendations fallback warning
 * - Score progress bar accessibility (aria-label)
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VendorAiRecommendationPanel from '../src/components/vendors/vendor-ai-recommendation-panel';
import * as vendorService from '../src/services/vendor-ai-recommendation-service';
import type { VendorRecommendationResponse } from '../src/services/vendor-ai-recommendation-service';

vi.mock('../src/services/vendor-ai-recommendation-service', () => ({
  fetchVendorRecommendation: vi.fn(),
}));

const mockedFetchVendor = vi.mocked(vendorService.fetchVendorRecommendation);

const MOCK_RESPONSE: VendorRecommendationResponse = {
  workflowType: 'vendor-recommendation',
  eventId: 10,
  eventTitle: 'Summer Fest',
  summary: 'Two vendors are a strong match for this event.',
  recommendations: [
    {
      vendorId: 1,
      vendorName: 'SoundCo Pro',
      rank: 1,
      score: 88,
      rationale: 'Excellent track record for outdoor events.',
      strengths: ['Reliability', 'Competitive pricing'],
      concerns: ['Limited availability in July'],
    },
    {
      vendorId: 2,
      vendorName: 'LightWave AV',
      rank: 2,
      score: 72,
      rationale: 'Good equipment but higher cost.',
      strengths: ['Premium gear'],
      concerns: ['High rates', 'Long setup time'],
    },
  ],
  advisoryLabel: 'AI-generated. Verify independently before contracting.',
  raw: '{}',
  contextSummary: {
    groundedFields: ['event', 'vendors'],
    vendorCount: 2,
  },
};

beforeEach(() => {
  mockedFetchVendor.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Initial render ─────────────────────────────────────────────────────────────

describe('VendorAiRecommendationPanel — initial render', () => {
  it('renders the AI Vendor Recommendations heading', () => {
    render(<VendorAiRecommendationPanel eventId={10} />);
    expect(screen.getByRole('heading', { name: /AI Vendor Recommendations/i })).toBeInTheDocument();
  });

  it('shows the advisory-only info alert on initial load', () => {
    render(<VendorAiRecommendationPanel eventId={10} />);
    expect(screen.getByText(/Advisory only/i)).toBeInTheDocument();
  });

  it('renders the optional prompt text input', () => {
    render(<VendorAiRecommendationPanel eventId={10} />);
    expect(
      screen.getByRole('textbox', { name: /Optional recommendation prompt/i }),
    ).toBeInTheDocument();
  });

  it('renders the Get Recommendations button in enabled state', () => {
    render(<VendorAiRecommendationPanel eventId={10} />);
    expect(
      screen.getByRole('button', { name: /Get Recommendations/i }),
    ).not.toBeDisabled();
  });

  it('accepts a numeric eventId', () => {
    render(<VendorAiRecommendationPanel eventId={10} />);
    expect(
      screen.getByRole('button', { name: /Get Recommendations/i }),
    ).toBeInTheDocument();
  });

  it('accepts a string eventId without crashing', () => {
    render(<VendorAiRecommendationPanel eventId="10" />);
    expect(
      screen.getByRole('button', { name: /Get Recommendations/i }),
    ).toBeInTheDocument();
  });
});

// ── Loading state ──────────────────────────────────────────────────────────────

describe('VendorAiRecommendationPanel — loading state', () => {
  it('shows Analysing… text while the fetch is in progress', async () => {
    mockedFetchVendor.mockReturnValueOnce(new Promise(() => undefined));

    render(<VendorAiRecommendationPanel eventId={10} />);
    await userEvent.click(screen.getByRole('button', { name: /Get Recommendations/i }));

    expect(screen.getByText(/Analysing…/i)).toBeInTheDocument();
  });

  it('disables the Get Recommendations button while loading', async () => {
    mockedFetchVendor.mockReturnValueOnce(new Promise(() => undefined));

    render(<VendorAiRecommendationPanel eventId={10} />);
    await userEvent.click(screen.getByRole('button', { name: /Get Recommendations/i }));

    expect(screen.getByRole('button', { name: /Analysing…/i })).toBeDisabled();
  });

  it('disables the prompt input while loading', async () => {
    mockedFetchVendor.mockReturnValueOnce(new Promise(() => undefined));

    render(<VendorAiRecommendationPanel eventId={10} />);
    await userEvent.click(screen.getByRole('button', { name: /Get Recommendations/i }));

    expect(
      screen.getByRole('textbox', { name: /Optional recommendation prompt/i }),
    ).toBeDisabled();
  });
});

// ── Error state ────────────────────────────────────────────────────────────────

describe('VendorAiRecommendationPanel — error state', () => {
  it('shows error alert when fetch rejects', async () => {
    mockedFetchVendor.mockRejectedValueOnce(new Error('Service unavailable'));

    render(<VendorAiRecommendationPanel eventId={10} />);
    await userEvent.click(screen.getByRole('button', { name: /Get Recommendations/i }));

    // The advisory info alert is always present; wait for the error text specifically.
    await waitFor(() =>
      expect(screen.getByText(/Service unavailable/i)).toBeInTheDocument(),
    );
  });

  it('re-enables the button after an error', async () => {
    mockedFetchVendor.mockRejectedValueOnce(new Error('Timeout'));

    render(<VendorAiRecommendationPanel eventId={10} />);
    await userEvent.click(screen.getByRole('button', { name: /Get Recommendations/i }));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Get Recommendations/i }),
      ).not.toBeDisabled(),
    );
  });

  it('clears previous result and shows error on a second failing call', async () => {
    mockedFetchVendor
      .mockResolvedValueOnce(MOCK_RESPONSE)
      .mockRejectedValueOnce(new Error('Network error'));

    render(<VendorAiRecommendationPanel eventId={10} />);
    await userEvent.click(screen.getByRole('button', { name: /Get Recommendations/i }));
    await waitFor(() => expect(screen.getByText('SoundCo Pro')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /Get Recommendations/i }));
    await waitFor(() => expect(screen.getByText(/Network error/i)).toBeInTheDocument());
    expect(screen.queryByText('SoundCo Pro')).not.toBeInTheDocument();
  });
});

// ── Happy path — structured output ────────────────────────────────────────────

describe('VendorAiRecommendationPanel — happy path', () => {
  it('renders recommendation cards with vendor names', async () => {
    mockedFetchVendor.mockResolvedValueOnce(MOCK_RESPONSE);

    render(<VendorAiRecommendationPanel eventId={10} />);
    await userEvent.click(screen.getByRole('button', { name: /Get Recommendations/i }));

    await waitFor(() => expect(screen.getByText('SoundCo Pro')).toBeInTheDocument());
    expect(screen.getByText('LightWave AV')).toBeInTheDocument();
  });

  it('renders score chips for each recommendation', async () => {
    mockedFetchVendor.mockResolvedValueOnce(MOCK_RESPONSE);

    render(<VendorAiRecommendationPanel eventId={10} />);
    await userEvent.click(screen.getByRole('button', { name: /Get Recommendations/i }));

    await waitFor(() => expect(screen.getByText('88/100')).toBeInTheDocument());
    expect(screen.getByText('72/100')).toBeInTheDocument();
  });

  it('renders rank chips (#1, #2)', async () => {
    mockedFetchVendor.mockResolvedValueOnce(MOCK_RESPONSE);

    render(<VendorAiRecommendationPanel eventId={10} />);
    await userEvent.click(screen.getByRole('button', { name: /Get Recommendations/i }));

    await waitFor(() => expect(screen.getByText('#1')).toBeInTheDocument());
    expect(screen.getByText('#2')).toBeInTheDocument();
  });

  it('renders the summary text', async () => {
    mockedFetchVendor.mockResolvedValueOnce(MOCK_RESPONSE);

    render(<VendorAiRecommendationPanel eventId={10} />);
    await userEvent.click(screen.getByRole('button', { name: /Get Recommendations/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/Two vendors are a strong match for this event/i),
      ).toBeInTheDocument(),
    );
  });

  it('renders strength chips', async () => {
    mockedFetchVendor.mockResolvedValueOnce(MOCK_RESPONSE);

    render(<VendorAiRecommendationPanel eventId={10} />);
    await userEvent.click(screen.getByRole('button', { name: /Get Recommendations/i }));

    await waitFor(() => expect(screen.getByText('Reliability')).toBeInTheDocument());
    expect(screen.getByText('Competitive pricing')).toBeInTheDocument();
  });

  it('renders concern chips', async () => {
    mockedFetchVendor.mockResolvedValueOnce(MOCK_RESPONSE);

    render(<VendorAiRecommendationPanel eventId={10} />);
    await userEvent.click(screen.getByRole('button', { name: /Get Recommendations/i }));

    await waitFor(() =>
      expect(screen.getByText('Limited availability in July')).toBeInTheDocument(),
    );
  });

  it('renders rationale text for first recommendation', async () => {
    mockedFetchVendor.mockResolvedValueOnce(MOCK_RESPONSE);

    render(<VendorAiRecommendationPanel eventId={10} />);
    await userEvent.click(screen.getByRole('button', { name: /Get Recommendations/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/Excellent track record for outdoor events/i),
      ).toBeInTheDocument(),
    );
  });

  it('always displays the advisory label in results', async () => {
    mockedFetchVendor.mockResolvedValueOnce(MOCK_RESPONSE);

    render(<VendorAiRecommendationPanel eventId={10} />);
    await userEvent.click(screen.getByRole('button', { name: /Get Recommendations/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/AI-generated\. Verify independently before contracting/i),
      ).toBeInTheDocument(),
    );
  });

  it('calls fetchVendorRecommendation with numeric eventId and prompt text', async () => {
    mockedFetchVendor.mockResolvedValueOnce(MOCK_RESPONSE);

    render(<VendorAiRecommendationPanel eventId={10} />);
    const promptInput = screen.getByRole('textbox', { name: /Optional recommendation prompt/i });
    await userEvent.type(promptInput, 'prioritise by value');
    await userEvent.click(screen.getByRole('button', { name: /Get Recommendations/i }));

    await waitFor(() => expect(mockedFetchVendor).toHaveBeenCalledOnce());
    expect(mockedFetchVendor).toHaveBeenCalledWith({
      eventId: 10,
      prompt: 'prioritise by value',
    });
  });

  it('calls with undefined prompt when input is blank', async () => {
    mockedFetchVendor.mockResolvedValueOnce(MOCK_RESPONSE);

    render(<VendorAiRecommendationPanel eventId={10} />);
    await userEvent.click(screen.getByRole('button', { name: /Get Recommendations/i }));

    await waitFor(() => expect(mockedFetchVendor).toHaveBeenCalledOnce());
    expect(mockedFetchVendor).toHaveBeenCalledWith({ eventId: 10, prompt: undefined });
  });

  it('re-enables button after successful response', async () => {
    mockedFetchVendor.mockResolvedValueOnce(MOCK_RESPONSE);

    render(<VendorAiRecommendationPanel eventId={10} />);
    await userEvent.click(screen.getByRole('button', { name: /Get Recommendations/i }));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Get Recommendations/i }),
      ).not.toBeDisabled(),
    );
  });
});

// ── Empty recommendations fallback ────────────────────────────────────────────

describe('VendorAiRecommendationPanel — empty recommendations', () => {
  it('shows warning when no recommendations are returned', async () => {
    mockedFetchVendor.mockResolvedValueOnce({
      ...MOCK_RESPONSE,
      recommendations: [],
      summary: '',
    });

    render(<VendorAiRecommendationPanel eventId={10} />);
    await userEvent.click(screen.getByRole('button', { name: /Get Recommendations/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/No ranked recommendations could be generated/i),
      ).toBeInTheDocument(),
    );
  });
});

// ── Accessibility ──────────────────────────────────────────────────────────────

describe('VendorAiRecommendationPanel — accessibility', () => {
  it('score progress bar has descriptive aria-label including the score value', async () => {
    mockedFetchVendor.mockResolvedValueOnce(MOCK_RESPONSE);

    render(<VendorAiRecommendationPanel eventId={10} />);
    await userEvent.click(screen.getByRole('button', { name: /Get Recommendations/i }));

    await waitFor(() =>
      expect(
        screen.getByRole('progressbar', { name: /Advisory score: 88 out of 100/i }),
      ).toBeInTheDocument(),
    );
  });

  it('second score progress bar has aria-label for score 72', async () => {
    mockedFetchVendor.mockResolvedValueOnce(MOCK_RESPONSE);

    render(<VendorAiRecommendationPanel eventId={10} />);
    await userEvent.click(screen.getByRole('button', { name: /Get Recommendations/i }));

    await waitFor(() =>
      expect(
        screen.getByRole('progressbar', { name: /Advisory score: 72 out of 100/i }),
      ).toBeInTheDocument(),
    );
  });
});
