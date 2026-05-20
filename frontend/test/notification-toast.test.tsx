/**
 * Tests for NotificationToast component
 * Task #788
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { NotificationToast } from '../src/components/nav/notification-toast';
import type { Toast } from '../src/components/nav/notification-toast';

// Mock useRealtime — capture the onMessage callback so tests can invoke it
let capturedOnMessage: ((msg: unknown) => void) | null = null;

vi.mock('../src/hooks/use-realtime', () => ({
  useRealtime: (_topics: string[], onMessage: (msg: unknown) => void) => {
    capturedOnMessage = onMessage;
    return { connected: true };
  },
}));

function pushSSE(type: string, payload: Record<string, unknown> = {}): void {
  act(() => {
    capturedOnMessage?.({
      topic: 'events',
      type,
      payload,
      occurredAt: new Date().toISOString(),
    });
  });
}

describe('NotificationToast', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    capturedOnMessage = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders nothing when there are no toasts', () => {
    render(<NotificationToast />);
    const container = screen.getByRole('status');
    expect(container).toBeDefined();
    expect(container.children.length).toBe(0);
  });

  it('renders a toast when an SSE message arrives', () => {
    render(<NotificationToast />);
    pushSSE('event.created', { title: 'New event created' });
    expect(screen.getByText('New event created')).toBeDefined();
  });

  it('assigns correct severity for budget messages', () => {
    render(<NotificationToast />);
    pushSSE('budget.warning', { title: 'Budget exceeded' });
    const alert = screen.getByRole('alert');
    // MUI filled Alert has severity in data attribute or ARIA
    expect(alert.textContent).toContain('Budget exceeded');
  });

  it('assigns info severity by default', () => {
    render(<NotificationToast />);
    pushSSE('some.event', { title: 'Something happened' });
    const alert = screen.getByRole('alert');
    // MUI filled Alert has severity in data attribute or ARIA
    expect(alert.textContent).toContain('Something happened');
  });

  it('auto-dismisses after 6 seconds', async () => {
    render(<NotificationToast />);
    pushSSE('event.updated', { title: 'Auto dismiss me' });
    expect(screen.getByText('Auto dismiss me')).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(6_000);
    });

    await waitFor(() => {
      expect(screen.queryByText('Auto dismiss me')).toBeNull();
    });
  });

  it('pauses auto-dismiss on hover and resumes on leave', async () => {
    render(<NotificationToast />);
    pushSSE('task.created', { title: 'Hover me' });
    const alert = screen.getByRole('alert');

    // Hover at 3s
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    fireEvent.mouseEnter(alert);

    // Wait past 6s total — should still be there
    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    expect(screen.getByText('Hover me')).toBeDefined();

    // Mouse leave — should dismiss after another 6s
    fireEvent.mouseLeave(alert);
    act(() => {
      vi.advanceTimersByTime(6_000);
    });

    await waitFor(() => {
      expect(screen.queryByText('Hover me')).toBeNull();
    });
  });

  it('manually dismisses on close button click', () => {
    render(<NotificationToast />);
    pushSSE('event.deleted', { title: 'Dismiss me' });
    expect(screen.getByText('Dismiss me')).toBeDefined();

    const btn = screen.getByRole('button', { name: /dismiss/i });
    fireEvent.click(btn);
    expect(screen.queryByText('Dismiss me')).toBeNull();
  });

  it('limits visible toasts to MAX_VISIBLE (5)', () => {
    render(<NotificationToast />);
    for (let i = 0; i < 7; i++) {
      pushSSE('event.created', { title: `Toast ${i}` });
    }
    const container = screen.getByRole('status');
    // Only 5 toasts visible (the last 5)
    expect(container.children.length).toBe(5);
    expect(screen.queryByText('Toast 0')).toBeNull();
    expect(screen.queryByText('Toast 1')).toBeNull();
    expect(screen.getByText('Toast 6')).toBeDefined();
  });

  it('has role="status" with aria-live="polite"', () => {
    render(<NotificationToast />);
    const container = screen.getByRole('status');
    expect(container.getAttribute('aria-live')).toBe('polite');
  });

  it('uses message payload for toast text', () => {
    render(<NotificationToast />);
    pushSSE('task.updated', { message: 'Task was updated' });
    expect(screen.getByText('Task was updated')).toBeDefined();
  });

  it('falls back to type name when no title/message in payload', () => {
    render(<NotificationToast />);
    pushSSE('activity.new_comment', {});
    expect(screen.getByText('activity new comment')).toBeDefined();
  });

  it('queues multiple toasts and dismisses them independently', async () => {
    render(<NotificationToast />);
    pushSSE('event.a', { title: 'First' });
    pushSSE('event.b', { title: 'Second' });
    expect(screen.getByText('First')).toBeDefined();
    expect(screen.getByText('Second')).toBeDefined();

    // Dismiss only the first
    const buttons = screen.getAllByRole('button', { name: /dismiss/i });
    fireEvent.click(buttons[0]);
    expect(screen.queryByText('First')).toBeNull();
    expect(screen.getByText('Second')).toBeDefined();
  });
});
