/**
 * SessionTimeoutProvider — Issue #82
 *
 * Tracks user activity (click, keypress, scroll, mousemove) and shows a
 * warning dialog 5 minutes before the session expires due to inactivity.
 * If the user dismisses the warning the session is extended via a heartbeat
 * call.  If the timer runs out the user is redirected to /login with a message.
 *
 * The timeout timer is paused when the browser tab is not visible.
 *
 * Usage:
 *   <SessionTimeoutProvider timeoutMs={SESSION_TIMEOUT_MS}>
 *     <App />
 *   </SessionTimeoutProvider>
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

const WARNING_BEFORE_MS = 5 * 60 * 1000; // show warning 5 min before expiry
const ACTIVITY_EVENTS: (keyof DocumentEventMap)[] = ['click', 'keypress', 'scroll', 'mousemove'];

interface SessionTimeoutProviderProps {
  children: ReactNode;
  /** Total inactivity timeout in milliseconds (default 30 min). */
  timeoutMs?: number;
}

export function SessionTimeoutProvider({
  children,
  timeoutMs = 30 * 60 * 1000,
}: SessionTimeoutProviderProps): JSX.Element {
  const [showWarning, setShowWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const lastActivityRef = useRef(Date.now());
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tabVisibleRef = useRef(true);

  const clearTimers = useCallback(() => {
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    warningTimerRef.current = null;
    expiryTimerRef.current = null;
    countdownRef.current = null;
  }, []);

  const handleExpired = useCallback(() => {
    clearTimers();
    setShowWarning(false);

    // Redirect to login with message
    const params = new URLSearchParams({ reason: 'session_timeout' });
    window.location.href = `/login?${params.toString()}`;
  }, [clearTimers]);

  const resetTimers = useCallback(() => {
    clearTimers();
    lastActivityRef.current = Date.now();
    setShowWarning(false);

    const timeUntilWarning = timeoutMs - WARNING_BEFORE_MS;

    warningTimerRef.current = setTimeout(() => {
      setShowWarning(true);
      setRemainingSeconds(Math.ceil(WARNING_BEFORE_MS / 1000));

      countdownRef.current = setInterval(() => {
        setRemainingSeconds((prev) => {
          if (prev <= 1) return 0;
          return prev - 1;
        });
      }, 1000);
    }, Math.max(timeUntilWarning, 0));

    expiryTimerRef.current = setTimeout(handleExpired, timeoutMs);
  }, [timeoutMs, clearTimers, handleExpired]);

  // Extend session — called when user clicks "Stay Logged In"
  const extendSession = useCallback(async () => {
    setShowWarning(false);
    resetTimers();

    try {
      const token = typeof window !== 'undefined'
        ? (window as unknown as Record<string, string>).__accessToken
        : null;

      await fetch(`${API_BASE_URL}/api/auth/session/heartbeat`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    } catch {
      // Best-effort — timer has already been reset client-side
    }
  }, [resetTimers]);

  // Activity listener (only resets when warning is NOT showing)
  const handleActivity = useCallback(() => {
    if (!showWarning && tabVisibleRef.current) {
      const now = Date.now();
      // Throttle: only reset if >60 s since last reset to avoid excessive timers
      if (now - lastActivityRef.current > 60_000) {
        resetTimers();
      }
    }
  }, [showWarning, resetTimers]);

  // Visibility change — pause/resume timer
  useEffect(() => {
    function onVisibilityChange() {
      tabVisibleRef.current = document.visibilityState === 'visible';
      if (tabVisibleRef.current) {
        // Check if session expired while tab was hidden
        const elapsed = Date.now() - lastActivityRef.current;
        if (elapsed >= timeoutMs) {
          handleExpired();
        } else if (elapsed >= timeoutMs - WARNING_BEFORE_MS) {
          setShowWarning(true);
          const left = timeoutMs - elapsed;
          setRemainingSeconds(Math.ceil(left / 1000));
        }
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [timeoutMs, handleExpired]);

  // Register / unregister activity listeners
  useEffect(() => {
    for (const evt of ACTIVITY_EVENTS) {
      document.addEventListener(evt, handleActivity, { passive: true });
    }
    return () => {
      for (const evt of ACTIVITY_EVENTS) {
        document.removeEventListener(evt, handleActivity);
      }
    };
  }, [handleActivity]);

  // Start timer on mount
  useEffect(() => {
    resetTimers();
    return clearTimers;
  }, [resetTimers, clearTimers]);

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return (
    <>
      {children}

      {showWarning && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Session expiring soon"
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.5)',
          }}
        >
          <div style={{
            background: '#fff', borderRadius: 8, padding: '24px 32px',
            maxWidth: 420, textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
          }}>
            <h2 style={{ margin: '0 0 12px' }}>Session Expiring Soon</h2>
            <p>
              Your session will expire in{' '}
              <strong>{minutes}:{String(seconds).padStart(2, '0')}</strong>{' '}
              due to inactivity.
            </p>
            <button
              onClick={extendSession}
              aria-label="Extend session"
              style={{
                marginTop: 12, padding: '10px 24px', fontSize: 16,
                cursor: 'pointer', borderRadius: 4, border: 'none',
                background: '#1976d2', color: '#fff',
              }}
            >
              Stay Logged In
            </button>
          </div>
        </div>
      )}
    </>
  );
}
