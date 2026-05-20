/**
 * useRealtime — subscribe to the unified SSE stream (#809).
 *
 * Connects to `GET /api/realtime/stream?topics=<comma-separated>` and invokes
 * `onMessage` for every received frame.  Automatically reconnects with a
 * configurable delay when the connection drops.
 *
 * @example
 * ```tsx
 * const { connected } = useRealtime(
 *   ['events', 'tasks'],
 *   (msg) => {
 *     if (msg.topic === 'events') refetchEvents();
 *   },
 * );
 * ```
 */
import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RealtimeTopic = 'events' | 'tasks' | 'budgets' | 'activity' | 'presence';

export interface RealtimeMessage {
  topic: RealtimeTopic;
  /** Discriminator for the specific event kind, e.g. "event.updated" */
  type: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

export interface UseRealtimeOptions {
  /**
   * Base URL prepended to the stream endpoint.
   * Defaults to `""` (same origin).
   */
  baseUrl?: string;
  /**
   * Milliseconds to wait before attempting a reconnect after a disconnect.
   * Defaults to `3000`.
   */
  reconnectDelay?: number;
  /**
   * Maximum number of reconnect attempts before giving up.
   * Defaults to `Infinity`.
   */
  maxReconnectAttempts?: number;
}

export interface UseRealtimeResult {
  /** `true` once the server sends the initial `ready` event. */
  connected: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_RECONNECT_DELAY_MS = 3_000;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Subscribe to real-time server-sent events over the unified multiplexed stream.
 *
 * @param topics   - Topics to subscribe to (stable reference recommended).
 * @param onMessage - Callback invoked for each message frame.
 * @param options   - Optional connection configuration.
 */
export function useRealtime(
  topics: RealtimeTopic[],
  onMessage: (message: RealtimeMessage) => void,
  options: UseRealtimeOptions = {},
): UseRealtimeResult {
  const [connected, setConnected] = useState(false);

  // Keep callback ref stable so changing `onMessage` never triggers a reconnect.
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const unmountedRef = useRef(false);

  const {
    baseUrl = '',
    reconnectDelay = DEFAULT_RECONNECT_DELAY_MS,
    maxReconnectAttempts = Infinity,
  } = options;

  // Serialise topics to a stable string so useCallback dependency is primitive.
  const topicsKey = [...topics].sort().join(',');

  const connect = useCallback(() => {
    if (unmountedRef.current || !topicsKey) return;

    const url = `${baseUrl}/api/realtime/stream?topics=${encodeURIComponent(topicsKey)}`;
    const source = new EventSource(url, { withCredentials: true });
    sourceRef.current = source;

    // Server signals stream is ready after header flush.
    source.addEventListener('ready', () => {
      setConnected(true);
      reconnectAttemptsRef.current = 0;
    });

    // Generic message frames (event: message).
    source.onmessage = (ev: MessageEvent<string>) => {
      parseAndDispatch(ev.data);
    };

    // Also listen for topic-named events so clients can use both patterns.
    for (const topic of topicsKey.split(',')) {
      source.addEventListener(topic, (ev) => {
        parseAndDispatch((ev as MessageEvent<string>).data);
      });
    }

    source.onerror = () => {
      setConnected(false);
      source.close();
      sourceRef.current = null;

      if (unmountedRef.current) return;
      if (reconnectAttemptsRef.current >= maxReconnectAttempts) return;

      reconnectAttemptsRef.current += 1;
      reconnectTimerRef.current = setTimeout(() => {
        if (!unmountedRef.current) connect();
      }, reconnectDelay);
    };

    function parseAndDispatch(raw: string): void {
      try {
        const message = JSON.parse(raw) as RealtimeMessage;
        onMessageRef.current(message);
      } catch {
        // Malformed frame — ignore.
      }
    }
  }, [baseUrl, topicsKey, reconnectDelay, maxReconnectAttempts]);

  useEffect(() => {
    unmountedRef.current = false;
    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
    };
  }, [connect]);

  return { connected };
}
