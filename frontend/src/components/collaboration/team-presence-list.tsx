/**
 * TeamPresenceList — shows online/idle team members in the sidebar (#811).
 *
 * Subscribes to the `presence` SSE topic for real-time join/leave updates.
 * Displays green dot for online, grey dot for idle users.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useRealtime, type RealtimeMessage } from '../../hooks/use-realtime';
import { api } from '../../lib/api-client';

interface PresenceEntry {
  userId: number;
  displayName: string;
  status: 'online' | 'idle';
}

interface ApiPresenceUser {
  userId: number;
  status: 'online' | 'idle';
  lastSeenAt: string;
  connectedAt: string;
  displayName?: string;
}

export function TeamPresenceList(): React.JSX.Element {
  const [members, setMembers] = useState<PresenceEntry[]>([]);

  // Fetch initial online users
  useEffect(() => {
    const fetchOnline = async (): Promise<void> => {
      try {
        const data = await api.get<{ users: ApiPresenceUser[] }>('/api/user-presence/online');
        setMembers(
          data.users.map((u) => ({
            userId: u.userId,
            displayName: u.displayName ?? `User ${u.userId}`,
            status: u.status,
          })),
        );
      } catch {
        // Non-fatal
      }
    };
    fetchOnline();
  }, []);

  // Subscribe to real-time presence diffs
  const handleMessage = useCallback((msg: RealtimeMessage) => {
    if (msg.type === 'presence.join') {
      const { userId, status } = msg.payload as { userId: number; status: 'online' | 'idle' };
      setMembers((prev) => {
        const existing = prev.find((m) => m.userId === userId);
        if (existing) {
          return prev.map((m) => (m.userId === userId ? { ...m, status } : m));
        }
        return [...prev, { userId, displayName: `User ${userId}`, status }];
      });
    } else if (msg.type === 'presence.leave') {
      const { userId } = msg.payload as { userId: number };
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
    }
  }, []);

  const { connected } = useRealtime(['presence'], handleMessage);

  if (members.length === 0 && !connected) return <></>;

  return (
    <div className="team-presence-list" aria-label="Team members online">
      <div className="quick-label">Team Online</div>
      <ul className="presence-member-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {members.map((member) => (
          <li
            key={member.userId}
            className="presence-member-item"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}
          >
            <span
              className={`presence-dot presence-dot--${member.status}`}
              aria-label={member.status === 'online' ? 'Online' : 'Idle'}
              style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: member.status === 'online' ? '#22c55e' : '#9ca3af',
                flexShrink: 0,
              }}
            />
            <span className="presence-member-name" style={{ fontSize: '0.85rem' }}>
              {member.displayName}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
