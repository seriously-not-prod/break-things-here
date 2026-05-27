/**
 * Tests: AiAssistant component — Task #947
 *
 * Covers:
 * - Floating button renders and toggles the panel
 * - Empty state message in chat mode
 * - Grounded workflow tab is accessible
 * - Chat mode: happy path (sends message, displays AI reply)
 * - Chat mode: error/failure path (displays error message)
 * - Chat mode: loading state (CircularProgress visible while waiting)
 * - Grounded workflow mode: form validation (Run Workflow disabled without inputs)
 * - Grounded workflow mode: happy path (shows structured output)
 * - Grounded workflow mode: error state (shows Alert on failure)
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiAssistant } from '../src/components/ai/ai-assistant';
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

beforeEach(() => {
  mockedApi.post.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Open/close ─────────────────────────────────────────────────────────────────

describe('AiAssistant — panel toggle', () => {
  it('renders the floating button', () => {
    render(<AiAssistant />);
    expect(screen.getByRole('button', { name: /AI assistant/i })).toBeInTheDocument();
  });

  it('opens the panel on button click', async () => {
    render(<AiAssistant />);
    await userEvent.click(screen.getByRole('button', { name: /AI assistant/i }));
    expect(screen.getByText('AI Planning Assistant')).toBeInTheDocument();
  });

  it('closes the panel when close button is clicked', async () => {
    render(<AiAssistant />);
    await userEvent.click(screen.getByRole('button', { name: /AI assistant/i }));
    expect(screen.getByText('AI Planning Assistant')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.queryByText('AI Planning Assistant')).not.toBeInTheDocument();
  });
});

// ── Chat mode ──────────────────────────────────────────────────────────────────

describe('AiAssistant — Chat mode', () => {
  it('shows empty state when no messages', async () => {
    render(<AiAssistant />);
    await userEvent.click(screen.getByRole('button', { name: /AI assistant/i }));

    expect(screen.getByText(/Ask me anything about festival planning/i)).toBeInTheDocument();
  });

  it('sends a message and displays the AI reply', async () => {
    mockedApi.post.mockResolvedValueOnce({ suggestion: 'Host it at a riverside park!' });

    render(<AiAssistant />);
    await userEvent.click(screen.getByRole('button', { name: /AI assistant/i }));

    const input = screen.getByRole('textbox', { name: /AI prompt input/i });
    await userEvent.type(input, 'Where should I host the event?');
    await userEvent.click(screen.getByRole('button', { name: /Send/i }));

    await waitFor(() =>
      expect(screen.getByText('Host it at a riverside park!')).toBeInTheDocument(),
    );
    expect(mockedApi.post).toHaveBeenCalledWith(
      '/api/ai/suggest',
      expect.objectContaining({
        prompt: 'Where should I host the event?',
      }),
    );
  });

  it('shows an error message when the API call fails', async () => {
    mockedApi.post.mockRejectedValueOnce(new ApiError('AI service unavailable', 503));

    render(<AiAssistant />);
    await userEvent.click(screen.getByRole('button', { name: /AI assistant/i }));

    const input = screen.getByRole('textbox', { name: /AI prompt input/i });
    await userEvent.type(input, 'Test question');
    await userEvent.click(screen.getByRole('button', { name: /Send/i }));

    await waitFor(() => expect(screen.getByText(/AI service unavailable/i)).toBeInTheDocument());
  });

  it('disables Send button while loading', async () => {
    // Never resolves so loading stays true
    mockedApi.post.mockReturnValueOnce(new Promise(() => undefined));

    render(<AiAssistant />);
    await userEvent.click(screen.getByRole('button', { name: /AI assistant/i }));

    const input = screen.getByRole('textbox', { name: /AI prompt input/i });
    await userEvent.type(input, 'Test');
    await userEvent.click(screen.getByRole('button', { name: /Send/i }));

    expect(screen.getByRole('button', { name: /Send/i })).toBeDisabled();
  });

  it('sends message on Enter key without Shift', async () => {
    mockedApi.post.mockResolvedValueOnce({ suggestion: 'Great idea!' });

    render(<AiAssistant />);
    await userEvent.click(screen.getByRole('button', { name: /AI assistant/i }));

    const input = screen.getByRole('textbox', { name: /AI prompt input/i });
    await userEvent.type(input, 'Hello there');
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

    await waitFor(() => expect(screen.getByText('Great idea!')).toBeInTheDocument());
  });
});

// ── Grounded workflow mode ─────────────────────────────────────────────────────

describe('AiAssistant — Grounded Workflow tab', () => {
  async function openGroundedTab() {
    render(<AiAssistant />);
    await userEvent.click(screen.getByRole('button', { name: /AI assistant/i }));
    await userEvent.click(screen.getByRole('tab', { name: /Grounded Workflow/i }));
  }

  it('switches to the Grounded Workflow tab', async () => {
    await openGroundedTab();
    expect(screen.getByText(/Grounded workflows fetch live event data/i)).toBeInTheDocument();
  });

  it('shows empty-state hint before any run', async () => {
    await openGroundedTab();
    expect(screen.getByText(/Enter an Event ID and a prompt/i)).toBeInTheDocument();
  });

  it('disables Run Workflow button when inputs are empty', async () => {
    await openGroundedTab();
    expect(screen.getByRole('button', { name: /Run Grounded Workflow/i })).toBeDisabled();
  });

  it('shows structured event suggestion on success', async () => {
    mockedApi.post.mockResolvedValueOnce({
      workflowType: 'event',
      entityId: 42,
      structured: {
        title: 'Summer Fest 2026',
        description: 'A great outdoor event',
        venueType: 'Outdoor amphitheatre',
        promotionalTips: ['Use social media', 'Early bird pricing', 'Partner sponsors'],
      },
      raw: '{"title":"Summer Fest 2026",...}',
    });

    await openGroundedTab();

    const entityIdInput = screen.getByRole('spinbutton', { name: /Event ID/i });
    await userEvent.type(entityIdInput, '42');

    const promptInput = screen.getByRole('textbox', { name: /Workflow prompt/i });
    await userEvent.type(promptInput, 'Improve this event');

    await userEvent.click(screen.getByRole('button', { name: /Run Grounded Workflow/i }));

    await waitFor(() => expect(screen.getByText('Summer Fest 2026')).toBeInTheDocument());
    expect(screen.getByText('Outdoor amphitheatre')).toBeInTheDocument();
    expect(screen.getByText('Event Suggestions')).toBeInTheDocument();

    expect(mockedApi.post).toHaveBeenCalledWith('/api/ai/grounded', {
      workflowType: 'event',
      entityId: 42,
      prompt: 'Improve this event',
    });
  });

  it('shows structured rsvp suggestion on success', async () => {
    mockedApi.post.mockResolvedValueOnce({
      workflowType: 'rsvp',
      entityId: 10,
      structured: {
        confirmationMessage: 'Your spot is confirmed!',
        reminderMessage: 'Event in 3 days!',
        capacityTip: 'You are at 90% capacity.',
      },
      raw: '{}',
    });

    render(<AiAssistant />);
    await userEvent.click(screen.getByRole('button', { name: /AI assistant/i }));
    await userEvent.click(screen.getByRole('tab', { name: /Grounded Workflow/i }));

    // Switch to rsvp workflow
    const workflowSelect = screen.getByRole('combobox', { name: /Workflow type/i });
    fireEvent.change(workflowSelect, { target: { value: 'rsvp' } });

    const entityIdInput = screen.getByRole('spinbutton', { name: /Event ID/i });
    await userEvent.type(entityIdInput, '10');

    const promptInput = screen.getByRole('textbox', { name: /Workflow prompt/i });
    await userEvent.type(promptInput, 'Help manage RSVPs');

    await userEvent.click(screen.getByRole('button', { name: /Run Grounded Workflow/i }));

    await waitFor(() => expect(screen.getByText('Your spot is confirmed!')).toBeInTheDocument());
    expect(screen.getByText('RSVP Suggestions')).toBeInTheDocument();
  });

  it('shows error Alert when grounded workflow API call fails', async () => {
    mockedApi.post.mockRejectedValueOnce(new ApiError('Event not found', 404));

    await openGroundedTab();

    const entityIdInput = screen.getByRole('spinbutton', { name: /Event ID/i });
    await userEvent.type(entityIdInput, '999');

    const promptInput = screen.getByRole('textbox', { name: /Workflow prompt/i });
    await userEvent.type(promptInput, 'help');

    await userEvent.click(screen.getByRole('button', { name: /Run Grounded Workflow/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText(/Event not found/i)).toBeInTheDocument();
  });

  it('shows permission-denied message when grounded workflow returns 403', async () => {
    mockedApi.post.mockRejectedValueOnce(
      new ApiError('AI features require elevated permissions.', 403),
    );

    await openGroundedTab();

    const entityIdInput = screen.getByRole('spinbutton', { name: /Event ID/i });
    await userEvent.type(entityIdInput, '42');

    const promptInput = screen.getByRole('textbox', { name: /Workflow prompt/i });
    await userEvent.type(promptInput, 'Improve event');

    await userEvent.click(screen.getByRole('button', { name: /Run Grounded Workflow/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText(/You do not have permission to use AI features/i)).toBeInTheDocument();
  });
});

// ── RBAC permission-denied handling ───────────────────────────────────────────

describe('AiAssistant — RBAC permission-denied (403)', () => {
  it('shows permission-denied message in chat when 403 is returned', async () => {
    mockedApi.post.mockRejectedValueOnce(
      new ApiError('AI features require elevated permissions.', 403),
    );

    render(<AiAssistant />);
    await userEvent.click(screen.getByRole('button', { name: /AI assistant/i }));

    const input = screen.getByRole('textbox', { name: /AI prompt input/i });
    await userEvent.type(input, 'Test question');
    await userEvent.click(screen.getByRole('button', { name: /Send/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/You do not have permission to use AI features/i),
      ).toBeInTheDocument(),
    );
  });
});
