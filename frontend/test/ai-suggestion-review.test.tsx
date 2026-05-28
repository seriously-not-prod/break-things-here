/**
 * Tests: AiSuggestionReview component — Story #965
 *
 * Covers:
 * - Renders suggestion content and three action controls
 * - Accept: calls POST /api/ai/apply and shows applied confirmation
 * - Edit & Apply: switches to edit mode and calls POST /api/ai/apply with edited content
 * - Reject: calls onReject callback without a server round-trip
 * - Rollback: calls DELETE /api/ai/apply/:id and shows rollback-done state
 * - Error handling: displays alert when apply fails
 * - Accessibility: ARIA labels on interactive elements
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiSuggestionReview } from '../src/components/ai/ai-suggestion-review';
import { api, ApiError } from '../src/lib/api-client';

vi.mock('../src/lib/api-client', async () => {
  const actual =
    await vi.importActual<typeof import('../src/lib/api-client')>('../src/lib/api-client');
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
});

const mockedApi = vi.mocked(api);

const MOCK_SUGGESTION = 'Plan an outdoor festival with a main stage and food vendors.';
const MOCK_APPLIED_RECORD = {
  id: 42,
  userId: 7,
  workflowType: 'event',
  entityId: 1,
  suggestionContent: MOCK_SUGGESTION,
  note: null,
  appliedAt: '2026-05-28T10:00:00.000Z',
};

const defaultProps = {
  workflowType: 'event',
  entityId: 1,
  suggestionContent: MOCK_SUGGESTION,
  onReject: vi.fn(),
};

beforeEach(() => {
  mockedApi.post.mockReset();
  mockedApi.delete.mockReset();
  vi.mocked(defaultProps.onReject).mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Render ─────────────────────────────────────────────────────────────────────

describe('AiSuggestionReview — render', () => {
  it('renders the suggestion content', () => {
    render(<AiSuggestionReview {...defaultProps} />);
    expect(screen.getByText(MOCK_SUGGESTION)).toBeInTheDocument();
  });

  it('renders Accept, Edit & Apply, and Reject controls', () => {
    render(<AiSuggestionReview {...defaultProps} />);
    expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit.*apply/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument();
  });

  it('uses the custom label when provided', () => {
    render(<AiSuggestionReview {...defaultProps} label="Vendor Recommendation" />);
    expect(screen.getByText(/vendor recommendation/i)).toBeInTheDocument();
  });

  it('has accessible ARIA labels on action buttons', () => {
    render(<AiSuggestionReview {...defaultProps} />);
    expect(
      screen.getByRole('button', { name: /accept and apply ai suggestion/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reject ai suggestion/i })).toBeInTheDocument();
  });
});

// ── Accept (apply as-is) ───────────────────────────────────────────────────────

describe('AiSuggestionReview — Accept', () => {
  it('calls POST /api/ai/apply with correct payload on Accept', async () => {
    mockedApi.post.mockResolvedValueOnce(MOCK_APPLIED_RECORD);
    render(<AiSuggestionReview {...defaultProps} />);

    await userEvent.click(screen.getByRole('button', { name: /accept and apply/i }));

    await waitFor(() => {
      expect(mockedApi.post).toHaveBeenCalledWith('/api/ai/apply', {
        workflowType: 'event',
        entityId: 1,
        suggestionContent: MOCK_SUGGESTION,
        note: undefined,
      });
    });
  });

  it('shows applied confirmation with audit ID after successful apply', async () => {
    mockedApi.post.mockResolvedValueOnce(MOCK_APPLIED_RECORD);
    render(<AiSuggestionReview {...defaultProps} />);

    await userEvent.click(screen.getByRole('button', { name: /accept and apply/i }));

    await waitFor(() => {
      expect(screen.getByText(/suggestion applied/i)).toBeInTheDocument();
      expect(screen.getByText(/audit id.*#42/i)).toBeInTheDocument();
    });
  });

  it('calls onApplied callback with the returned record', async () => {
    const onApplied = vi.fn();
    mockedApi.post.mockResolvedValueOnce(MOCK_APPLIED_RECORD);
    render(<AiSuggestionReview {...defaultProps} onApplied={onApplied} />);

    await userEvent.click(screen.getByRole('button', { name: /accept and apply/i }));

    await waitFor(() => {
      expect(onApplied).toHaveBeenCalledWith(MOCK_APPLIED_RECORD);
    });
  });
});

// ── Edit & Apply ───────────────────────────────────────────────────────────────

describe('AiSuggestionReview — Edit & Apply', () => {
  it('switches to edit mode on Edit & Apply click', async () => {
    render(<AiSuggestionReview {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: /edit.*apply/i }));
    expect(screen.getByLabelText(/edit ai suggestion content/i)).toBeInTheDocument();
  });

  it('applies the edited content with a note when user saves from edit mode', async () => {
    mockedApi.post.mockResolvedValueOnce({
      ...MOCK_APPLIED_RECORD,
      note: 'applied with user edits',
    });
    render(<AiSuggestionReview {...defaultProps} />);

    await userEvent.click(screen.getByRole('button', { name: /edit.*apply/i }));

    const textarea = screen.getByLabelText(/edit ai suggestion content/i);
    await userEvent.clear(textarea);
    await userEvent.type(textarea, 'Edited suggestion text.');

    await userEvent.click(screen.getByRole('button', { name: /accept and apply/i }));

    await waitFor(() => {
      expect(mockedApi.post).toHaveBeenCalledWith('/api/ai/apply', {
        workflowType: 'event',
        entityId: 1,
        suggestionContent: 'Edited suggestion text.',
        note: 'applied with user edits',
      });
    });
  });

  it('restores original content on Cancel edit', async () => {
    render(<AiSuggestionReview {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: /edit.*apply/i }));
    await userEvent.click(screen.getByRole('button', { name: /cancel edit/i }));
    expect(screen.getByText(MOCK_SUGGESTION)).toBeInTheDocument();
  });
});

// ── Reject ─────────────────────────────────────────────────────────────────────

describe('AiSuggestionReview — Reject', () => {
  it('calls onReject without making an API call', async () => {
    render(<AiSuggestionReview {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: /reject ai suggestion/i }));
    expect(defaultProps.onReject).toHaveBeenCalledOnce();
    expect(mockedApi.post).not.toHaveBeenCalled();
  });
});

// ── Rollback ───────────────────────────────────────────────────────────────────

describe('AiSuggestionReview — Rollback', () => {
  it('shows Roll back button after successful apply', async () => {
    mockedApi.post.mockResolvedValueOnce(MOCK_APPLIED_RECORD);
    render(<AiSuggestionReview {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: /accept and apply/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /roll back/i })).toBeInTheDocument();
    });
  });

  it('calls DELETE /api/ai/apply/:id on Roll back', async () => {
    mockedApi.post.mockResolvedValueOnce(MOCK_APPLIED_RECORD);
    mockedApi.delete.mockResolvedValueOnce(undefined);
    render(<AiSuggestionReview {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: /accept and apply/i }));
    await waitFor(() => screen.getByRole('button', { name: /roll back/i }));
    await userEvent.click(screen.getByRole('button', { name: /roll back/i }));
    await waitFor(() => {
      expect(mockedApi.delete).toHaveBeenCalledWith('/api/ai/apply/42');
    });
  });

  it('shows rollback-done state after successful rollback', async () => {
    mockedApi.post.mockResolvedValueOnce(MOCK_APPLIED_RECORD);
    mockedApi.delete.mockResolvedValueOnce(undefined);
    render(<AiSuggestionReview {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: /accept and apply/i }));
    await waitFor(() => screen.getByRole('button', { name: /roll back/i }));
    await userEvent.click(screen.getByRole('button', { name: /roll back/i }));
    await waitFor(() => {
      expect(screen.getByText(/suggestion rolled back/i)).toBeInTheDocument();
    });
  });
});

// ── Error handling ─────────────────────────────────────────────────────────────

describe('AiSuggestionReview — error handling', () => {
  it('shows error alert when apply fails', async () => {
    mockedApi.post.mockRejectedValueOnce(new ApiError('AI service unavailable.', 503));
    render(<AiSuggestionReview {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: /accept and apply/i }));
    await waitFor(() => {
      expect(screen.getByText(/ai service unavailable/i)).toBeInTheDocument();
    });
  });

  it('shows permission error for 403 response', async () => {
    mockedApi.post.mockRejectedValueOnce(new ApiError('Forbidden', 403));
    render(<AiSuggestionReview {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: /accept and apply/i }));
    await waitFor(() => {
      expect(screen.getByText(/permission/i)).toBeInTheDocument();
    });
  });
});
