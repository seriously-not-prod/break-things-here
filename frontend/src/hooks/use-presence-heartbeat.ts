/**
 * usePresenceHeartbeat — sends periodic heartbeats to signal user is online (#811).
 *
 * Sends POST /api/user-presence/heartbeat every 30s while the user is authenticated.
 * On unmount (logout, tab close) sends DELETE /api/user-presence/leave.
 * Also uses `navigator.sendBeacon` as a fallback on page unload.
 */
import { useEffect, useRef } from 'react';
import { api } from '../lib/api-client';

const HEARTBEAT_INTERVAL_MS = 30_000;

export function usePresenceHeartbeat(isAuthenticated: boolean): void {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    const sendHeartbeat = async (): Promise<void> => {
      try {
        await api.post('/api/user-presence/heartbeat', {});
      } catch {
        // Best-effort — presence is non-critical
      }
    };

    const sendLeave = (): void => {
      // navigator.sendBeacon is fire-and-forget for unload scenarios
      try {
        navigator.sendBeacon('/api/user-presence/leave');
      } catch {
        // Fallback: try fetch with keepalive
        fetch('/api/user-presence/leave', {
          method: 'DELETE',
          credentials: 'include',
          keepalive: true,
        }).catch(() => undefined);
      }
    };

    // Initial heartbeat immediately
    sendHeartbeat();
    intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    // Unload handler for tab/window close
    window.addEventListener('beforeunload', sendLeave);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      window.removeEventListener('beforeunload', sendLeave);
      // Explicit leave on unmount (e.g. logout)
      api.delete('/api/user-presence/leave').catch(() => undefined);
    };
  }, [isAuthenticated]);
}
