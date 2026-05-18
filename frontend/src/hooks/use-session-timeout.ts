/**
 * useSessionTimeout
 *
 * Tracks user activity events and enforces the 30-minute inactivity timeout
 * required by BRD / FRD FR-AUTH-002.
 *
 * Behaviour:
 *  - On every activity event (mousemove, keydown, click, touchstart, scroll)
 *    the idle clock is reset.
 *  - Every HEARTBEAT_INTERVAL_MS while the user is active, the session
 *    keepalive endpoint (POST /api/auth/session/heartbeat) is called so the
 *    backend also updates last_activity.
 *  - If the browser has been idle for >= timeoutMs, `onTimeout` is invoked so
 *    the caller can perform logout.
 *  - Two minutes before timeout `onWarn` is invoked (optional) so the UI can
 *    show a warning banner.
 *  - On mount the real timeout config is fetched from the heartbeat endpoint;
 *    until then the default of 30 minutes is used.
 */
import { useCallback, useEffect, useRef } from 'react';
import { apiFetch } from '../lib/api-client';

const ACTIVITY_EVENTS = [
  'mousemove',
  'keydown',
  'click',
  'touchstart',
  'scroll',
] as const;

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // poll every 5 min when active
const WARN_BEFORE_MS = 2 * 60 * 1000;        // warn 2 min before expiry

export function useSessionTimeout(
  onTimeout: () => void,
  onWarn?: (remainingMs: number) => void,
): void {
  const lastActivityRef = useRef<number>(Date.now());
  const timeoutMsRef = useRef<number>(DEFAULT_TIMEOUT_MS);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const warnRef = useRef<ReturnType<typeof setTimeout>>();

  // --- stable callback refs so scheduleTimers doesn't change identity ---
  const onTimeoutRef = useRef(onTimeout);
  const onWarnRef = useRef(onWarn);
  useEffect(() => { onTimeoutRef.current = onTimeout; }, [onTimeout]);
  useEffect(() => { onWarnRef.current = onWarn; }, [onWarn]);

  const scheduleTimers = useCallback(() => {
    clearTimeout(timeoutRef.current);
    clearTimeout(warnRef.current);
    const ms = timeoutMsRef.current;

    if (onWarnRef.current && ms > WARN_BEFORE_MS) {
      warnRef.current = setTimeout(
        () => onWarnRef.current?.(WARN_BEFORE_MS),
        ms - WARN_BEFORE_MS,
      );
    }

    timeoutRef.current = setTimeout(() => onTimeoutRef.current(), ms);
  }, []);

  const handleActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    scheduleTimers();
  }, [scheduleTimers]);

  // Wire activity listeners and start the initial timer
  useEffect(() => {
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, handleActivity, { passive: true });
    }
    scheduleTimers();

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, handleActivity);
      }
      clearTimeout(timeoutRef.current);
      clearTimeout(warnRef.current);
    };
  }, [handleActivity, scheduleTimers]);

  // Fetch real timeout config from backend on mount and re-schedule timers
  useEffect(() => {
    apiFetch('/api/auth/session/heartbeat', { method: 'POST' })
      .then(async res => {
        if (!res.ok) return;
        const data = await res.json() as { sessionTimeoutMs?: number };
        if (typeof data.sessionTimeoutMs === 'number' && data.sessionTimeoutMs > 0) {
          timeoutMsRef.current = data.sessionTimeoutMs;
          scheduleTimers();
        }
      })
      .catch(() => {
        // Network error — keep using DEFAULT_TIMEOUT_MS
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally only on mount

  // Periodic heartbeat — only when user has been recently active
  useEffect(() => {
    const interval = setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs < timeoutMsRef.current) {
        apiFetch('/api/auth/session/heartbeat', { method: 'POST' })
          .then(async res => {
            if (res.status === 401) {
              const body = await res.json().catch(() => null) as { code?: string } | null;
              if (body?.code === 'SESSION_TIMEOUT') {
                onTimeoutRef.current();
              }
            }
          })
          .catch(() => {
            // Swallow network errors — idle timer will expire naturally
          });
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
