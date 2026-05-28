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
  // Default: events endpoint returns an empty list so the useEffect in
  // AiAssistant (which calls api.get('/api/events')) does not crash tests.
  mockedApi.get.mockResolvedValue([]);
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
    expect(screen.getByRole('heading', { name: /AI Planning Assistant/i })).toBeInTheDocument();
  });

  it('closes the panel when close button is clicked', async () => {
    render(<AiAssistant />);
    await userEvent.click(screen.getByRole('button', { name: /AI assistant/i }));
    expect(screen.getByRole('heading', { name: /AI Planning Assistant/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(
      screen.queryByRole('heading', { name: /AI Planning Assistant/i }),
    ).not.toBeInTheDocument();
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
    await userEvent.click(screen.getByRole('tab', { name: /Grounded/i }));
  }

  it('switches to the Grounded Workflow tab', async () => {
    await openGroundedTab();
    expect(screen.getByText(/Grounded workflows fetch live event data/i)).toBeInTheDocument();
  });

  it('shows empty-state hint before any run', async () => {
    await openGroundedTab();
    expect(screen.getByText(/Select an event and a prompt/i)).toBeInTheDocument();
  });

  it('disables Run Workflow button when inputs are empty', async () => {
    await openGroundedTab();
    expect(screen.getByRole('button', { name: /Run Grounded Workflow/i })).toBeDisabled();
  });

  it('shows structured event suggestion on success', async () => {
    mockedApi.get.mockResolvedValueOnce([{ id: 42, title: 'Test Event' }]);
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

    // MUI Autocomplete uses input[role="combobox"] — use querySelector inside the tabpanel
    const groundedPanel = screen.getByRole('tabpanel', { name: /Grounded/i });
    const eventInput = groundedPanel.querySelector<HTMLInputElement>(
      'input[aria-label="Select event"]',
    );
    await userEvent.click(eventInput!);
    const option = await screen.findByRole('option', { name: /Test Event/i });
    await userEvent.click(option);

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

    mockedApi.get.mockResolvedValueOnce([{ id: 10, title: 'Test Event' }]);
    render(<AiAssistant />);
    await userEvent.click(screen.getByRole('button', { name: /AI assistant/i }));
    await userEvent.click(screen.getByRole('tab', { name: /Grounded/i }));

    // MUI v6 Select renders role="combobox" on a <div>, which is inaccessible in
    // the AT when inside role="tabpanel" (dom-accessibility-api limitation).
    // Target the hidden native input directly to trigger the MUI onChange handler.
    const groundedPanel = screen.getByRole('tabpanel', { name: /Grounded/i });
    const workflowInput = groundedPanel.querySelector<HTMLInputElement>('.MuiSelect-nativeInput');
    fireEvent.change(workflowInput!, { target: { value: 'rsvp' } });

    // MUI Autocomplete uses input[role="combobox"] — use querySelector inside the tabpanel
    const eventInput = groundedPanel.querySelector<HTMLInputElement>(
      'input[aria-label="Select event"]',
    );
    await userEvent.click(eventInput!);
    const option = await screen.findByRole('option', { name: /Test Event/i });
    await userEvent.click(option);

    const promptInput = screen.getByRole('textbox', { name: /Workflow prompt/i });
    await userEvent.type(promptInput, 'Help manage RSVPs');

    await userEvent.click(screen.getByRole('button', { name: /Run Grounded Workflow/i }));

    await waitFor(() => expect(screen.getByText('Your spot is confirmed!')).toBeInTheDocument());
    expect(screen.getByText('RSVP Suggestions')).toBeInTheDocument();
  });

  it('shows error Alert when grounded workflow API call fails', async () => {
    mockedApi.get.mockResolvedValueOnce([{ id: 999, title: 'Test Event' }]);
    mockedApi.post.mockRejectedValueOnce(new ApiError('Event not found', 404));

    await openGroundedTab();

    const groundedPanel = screen.getByRole('tabpanel', { name: /Grounded/i });
    const eventInput = groundedPanel.querySelector<HTMLInputElement>(
      'input[aria-label="Select event"]',
    );
    await userEvent.click(eventInput!);
    const option = await screen.findByRole('option', { name: /Test Event/i });
    await userEvent.click(option);

    const promptInput = screen.getByRole('textbox', { name: /Workflow prompt/i });
    await userEvent.type(promptInput, 'help');

    await userEvent.click(screen.getByRole('button', { name: /Run Grounded Workflow/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText(/Event not found/i)).toBeInTheDocument();
  });

  it('shows permission-denied message when grounded workflow returns 403', async () => {
    mockedApi.get.mockResolvedValueOnce([{ id: 42, title: 'Test Event' }]);
    mockedApi.post.mockRejectedValueOnce(
      new ApiError('AI features require elevated permissions.', 403),
    );

    await openGroundedTab();

    const groundedPanel = screen.getByRole('tabpanel', { name: /Grounded/i });
    const eventInput = groundedPanel.querySelector<HTMLInputElement>(
      'input[aria-label="Select event"]',
    );
    await userEvent.click(eventInput!);
    const option = await screen.findByRole('option', { name: /Test Event/i });
    await userEvent.click(option);

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

// ── #959: Onboarding empty state ───────────────────────────────────────────────

describe('AiAssistant — #959 actionable empty/onboarding state', () => {
  it('shows quick-start prompt chips in the chat empty state', async () => {
    render(<AiAssistant />);
    await userEvent.click(screen.getByRole('button', { name: /AI assistant/i }));

    expect(screen.getByText('Quick start:')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Use prompt: Event venue ideas/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Use prompt: RSVP strategy/i })).toBeInTheDocument();
  });

  it('clicking a quick-start chip populates the prompt input', async () => {
    render(<AiAssistant />);
    await userEvent.click(screen.getByRole('button', { name: /AI assistant/i }));

    await userEvent.click(screen.getByRole('button', { name: /Use prompt: Event venue ideas/i }));

    const input = screen.getByRole('textbox', { name: /AI prompt input/i });
    expect(input).toHaveValue('Event venue ideas');
  });

  it('hides quick-start chips once a message has been sent', async () => {
    mockedApi.post.mockResolvedValueOnce({ suggestion: 'Great idea!' });

    render(<AiAssistant />);
    await userEvent.click(screen.getByRole('button', { name: /AI assistant/i }));

    const input = screen.getByRole('textbox', { name: /AI prompt input/i });
    await userEvent.type(input, 'Hello');
    await userEvent.click(screen.getByRole('button', { name: /Send/i }));

    await waitFor(() => expect(screen.getByText('Great idea!')).toBeInTheDocument());
    expect(screen.queryByText('Quick start:')).not.toBeInTheDocument();
  });
});

// ── #959: Non-blocking loading state ──────────────────────────────────────────

describe('AiAssistant — #959 non-blocking loading state', () => {
  it('keeps the input accessible (not hidden) while loading', async () => {
    mockedApi.post.mockReturnValueOnce(new Promise(() => undefined));

    render(<AiAssistant />);
    await userEvent.click(screen.getByRole('button', { name: /AI assistant/i }));

    const input = screen.getByRole('textbox', { name: /AI prompt input/i });
    await userEvent.type(input, 'Test');
    await userEvent.click(screen.getByRole('button', { name: /Send/i }));

    // Input is disabled during loading but still in the document (non-blocking = visible)
    expect(input).toBeInTheDocument();
    expect(screen.getByText('Thinking…')).toBeInTheDocument();
  });

  it('sets aria-busy on the messages area while loading', async () => {
    mockedApi.post.mockReturnValueOnce(new Promise(() => undefined));

    render(<AiAssistant />);
    await userEvent.click(screen.getByRole('button', { name: /AI assistant/i }));

    const input = screen.getByRole('textbox', { name: /AI prompt input/i });
    await userEvent.type(input, 'Test');
    await userEvent.click(screen.getByRole('button', { name: /Send/i }));

    const log = screen.getByRole('log', { name: /AI conversation/i });
    expect(log).toHaveAttribute('aria-busy', 'true');
  });
});

// ── #959: Chat error state with retry ─────────────────────────────────────────

describe('AiAssistant — #959 chat error state with retry', () => {
  it('shows error in an Alert (not a chat bubble) when API fails', async () => {
    mockedApi.post.mockRejectedValueOnce(new ApiError('AI service unavailable', 503));

    render(<AiAssistant />);
    await userEvent.click(screen.getByRole('button', { name: /AI assistant/i }));

    const input = screen.getByRole('textbox', { name: /AI prompt input/i });
    await userEvent.type(input, 'Test question');
    await userEvent.click(screen.getByRole('button', { name: /Send/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText(/AI service unavailable/i)).toBeInTheDocument();
  });

  it('shows a retry button when chat API fails', async () => {
    mockedApi.post.mockRejectedValueOnce(new ApiError('Timeout', 504));

    render(<AiAssistant />);
    await userEvent.click(screen.getByRole('button', { name: /AI assistant/i }));

    const input = screen.getByRole('textbox', { name: /AI prompt input/i });
    await userEvent.type(input, 'Hello');
    await userEvent.click(screen.getByRole('button', { name: /Send/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Retry last message/i })).toBeInTheDocument(),
    );
  });

  it('retries the last message when retry button is clicked', async () => {
    mockedApi.post
      .mockRejectedValueOnce(new ApiError('Timeout', 504))
      .mockResolvedValueOnce({ suggestion: 'Retry success!' });

    render(<AiAssistant />);
    await userEvent.click(screen.getByRole('button', { name: /AI assistant/i }));

    const input = screen.getByRole('textbox', { name: /AI prompt input/i });
    await userEvent.type(input, 'My question');
    await userEvent.click(screen.getByRole('button', { name: /Send/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Retry last message/i })).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole('button', { name: /Retry last message/i }));

    await waitFor(() => expect(screen.getByText('Retry success!')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears the error alert when a new message is sent successfully', async () => {
    mockedApi.post
      .mockRejectedValueOnce(new ApiError('Error', 500))
      .mockResolvedValueOnce({ suggestion: 'Cleared!' });

    render(<AiAssistant />);
    await userEvent.click(screen.getByRole('button', { name: /AI assistant/i }));

    const input = screen.getByRole('textbox', { name: /AI prompt input/i });
    await userEvent.type(input, 'First');
    await userEvent.click(screen.getByRole('button', { name: /Send/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    await userEvent.type(input, 'Second message');
    await userEvent.click(screen.getByRole('button', { name: /Send/i }));

    await waitFor(() => expect(screen.getByText('Cleared!')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

// ── #959: Retry in grounded/breakdown/budget tabs ─────────────────────────────

describe('AiAssistant — #959 retry in Grounded Workflow tab', () => {
  it('shows a retry button when grounded workflow fails', async () => {
    mockedApi.get.mockResolvedValueOnce([{ id: 1, title: 'Test Event' }]);
    mockedApi.post.mockRejectedValueOnce(new ApiError('Service error', 503));

    render(<AiAssistant />);
    await userEvent.click(screen.getByRole('button', { name: /AI assistant/i }));
    await userEvent.click(screen.getByRole('tab', { name: /Grounded/i }));

    const groundedPanel = screen.getByRole('tabpanel', { name: /Grounded/i });
    const eventInput = groundedPanel.querySelector<HTMLInputElement>(
      'input[aria-label="Select event"]',
    );
    await userEvent.click(eventInput!);
    const option = await screen.findByRole('option', { name: /Test Event/i });
    await userEvent.click(option);

    const promptInput = screen.getByRole('textbox', { name: /Workflow prompt/i });
    await userEvent.type(promptInput, 'help');

    await userEvent.click(screen.getByRole('button', { name: /Run Grounded Workflow/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Retry workflow/i })).toBeInTheDocument(),
    );
  });
});

describe('AiAssistant — #959 retry in Task Breakdown tab', () => {
  it('shows a retry button when task breakdown fails', async () => {
    mockedApi.get.mockResolvedValueOnce([{ id: 1, title: 'Test Event' }]);
    mockedApi.post.mockRejectedValueOnce(new ApiError('Breakdown failed', 500));

    render(<AiAssistant />);
    await userEvent.click(screen.getByRole('button', { name: /AI assistant/i }));
    await userEvent.click(screen.getByRole('tab', { name: /Task Plan/i }));

    const breakdownPanel = screen.getByRole('tabpanel', { name: /Task Plan/i });
    const eventInput = breakdownPanel.querySelector<HTMLInputElement>(
      'input[aria-label="Select event for task breakdown"]',
    );
    await userEvent.click(eventInput!);
    const option = await screen.findByRole('option', { name: /Test Event/i });
    await userEvent.click(option);

    await userEvent.click(screen.getByRole('button', { name: /Generate task breakdown/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Retry task breakdown/i })).toBeInTheDocument(),
    );
  });
});

describe('AiAssistant — #959 retry in Budget Insight tab', () => {
  it('shows a retry button when budget insight fails', async () => {
    mockedApi.get.mockResolvedValueOnce([{ id: 1, title: 'Test Event' }]);
    mockedApi.post.mockRejectedValueOnce(new ApiError('Budget error', 500));

    render(<AiAssistant />);
    await userEvent.click(screen.getByRole('button', { name: /AI assistant/i }));
    await userEvent.click(screen.getByRole('tab', { name: /Budget/i }));

    const budgetPanel = screen.getByRole('tabpanel', { name: /Budget/i });
    const eventInput = budgetPanel.querySelector<HTMLInputElement>(
      'input[aria-label="Select event for budget insight"]',
    );
    await userEvent.click(eventInput!);
    const option = await screen.findByRole('option', { name: /Test Event/i });
    await userEvent.click(option);

    await userEvent.click(screen.getByRole('button', { name: /Analyse budget/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Retry budget insight/i })).toBeInTheDocument(),
    );
  });
});

// ── #959: Accessible tab panels ───────────────────────────────────────────────

describe('AiAssistant — #959 accessible tab panels', () => {
  it('chat panel has role="tabpanel" and aria-labelledby', async () => {
    render(<AiAssistant />);
    await userEvent.click(screen.getByRole('button', { name: /AI assistant/i }));

    const panel = document.getElementById('ai-panel-chat');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveAttribute('role', 'tabpanel');
    expect(panel).toHaveAttribute('aria-labelledby', 'ai-tab-chat');
  });

  it('grounded panel has role="tabpanel" when active', async () => {
    render(<AiAssistant />);
    await userEvent.click(screen.getByRole('button', { name: /AI assistant/i }));
    await userEvent.click(screen.getByRole('tab', { name: /Grounded/i }));

    const panel = document.getElementById('ai-panel-grounded');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveAttribute('role', 'tabpanel');
    expect(panel).toHaveAttribute('aria-labelledby', 'ai-tab-grounded');
  });
});
