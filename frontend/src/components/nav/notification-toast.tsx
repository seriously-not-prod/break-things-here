/**
 * NotificationToast — global toast container driven by the SSE realtime stream.
 *
 * Subscribes to SSE topics and pushes incoming notifications into a queue
 * rendered as stacked MUI Snackbar/Alert toasts.
 *
 * - Auto-dismiss after 6 s
 * - Pause timer on hover
 * - Manual dismiss via close button
 * - Accessible via role="status" polite live region
 *
 * Task #788
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, IconButton, Slide, Snackbar, Stack } from '@mui/material';
import type { SlideProps } from '@mui/material/Slide';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { useRealtime, type RealtimeMessage } from '../../hooks/use-realtime';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Toast {
  id: string;
  message: string;
  severity: 'success' | 'error' | 'warning' | 'info';
  /** ISO timestamp when the toast was created. */
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTO_DISMISS_MS = 6_000;
const MAX_VISIBLE = 5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SlideUp(props: SlideProps): JSX.Element {
  return <Slide {...props} direction="up" />;
}

function severityFromType(type: string): Toast['severity'] {
  if (type.startsWith('budget')) return 'warning';
  if (type.includes('error') || type.includes('fail')) return 'error';
  if (type.includes('complete') || type.includes('success')) return 'success';
  return 'info';
}

function titleFromMessage(msg: RealtimeMessage): string {
  const payload = msg.payload as Record<string, unknown>;
  if (typeof payload.title === 'string' && payload.title) return payload.title;
  if (typeof payload.message === 'string' && payload.message) return payload.message;
  return msg.type.replace(/[._-]/g, ' ');
}

let nextId = 0;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NotificationToast(): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const hoveredRef = useRef<Set<string>>(new Set());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    hoveredRef.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const scheduleAutoDismiss = useCallback(
    (id: string) => {
      const timer = setTimeout(() => {
        if (hoveredRef.current.has(id)) return;
        dismiss(id);
      }, AUTO_DISMISS_MS);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  const push = useCallback(
    (message: string, severity: Toast['severity'] = 'info') => {
      const id = `toast-${Date.now()}-${++nextId}`;
      const toast: Toast = { id, message, severity, createdAt: Date.now() };
      setToasts((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), toast]);
      scheduleAutoDismiss(id);
    },
    [scheduleAutoDismiss],
  );

  const handleMouseEnter = useCallback((id: string) => {
    hoveredRef.current.add(id);
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const handleMouseLeave = useCallback(
    (id: string) => {
      hoveredRef.current.delete(id);
      scheduleAutoDismiss(id);
    },
    [scheduleAutoDismiss],
  );

  // Clean up all timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) clearTimeout(timer);
    };
  }, []);

  // SSE subscription — push incoming events as toasts
  const handleMessage = useCallback(
    (msg: RealtimeMessage) => {
      push(titleFromMessage(msg), severityFromType(msg.type));
    },
    [push],
  );

  useRealtime(['events', 'tasks', 'budgets', 'activity'], handleMessage);

  const visible = toasts.slice(-MAX_VISIBLE);

  return (
    <Stack
      spacing={1}
      role="status"
      aria-live="polite"
      aria-label="Notification toasts"
      sx={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: (theme) => theme.zIndex.snackbar + 1,
        pointerEvents: 'none',
      }}
    >
      {visible.map((toast) => (
        <Snackbar
          key={toast.id}
          open
          TransitionComponent={SlideUp}
          sx={{ position: 'static', pointerEvents: 'auto' }}
        >
          <Alert
            severity={toast.severity}
            variant="filled"
            onMouseEnter={() => handleMouseEnter(toast.id)}
            onMouseLeave={() => handleMouseLeave(toast.id)}
            action={
              <IconButton
                size="small"
                color="inherit"
                aria-label="Dismiss notification"
                onClick={() => dismiss(toast.id)}
              >
                <CloseRounded fontSize="small" />
              </IconButton>
            }
            sx={{ width: 360, maxWidth: 'calc(100vw - 48px)' }}
          >
            {toast.message}
          </Alert>
        </Snackbar>
      ))}
    </Stack>
  );
}
