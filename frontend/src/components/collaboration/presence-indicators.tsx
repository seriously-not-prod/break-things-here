import React, { useEffect, useState, useCallback } from 'react';
import {
  heartbeatPresence,
  leavePresence,
  type EntityType,
  type PresenceUser,
} from '../../services/collaboration-service';

interface PresenceIndicatorsProps {
  entityType: EntityType;
  entityId: number;
  currentUserId: number;
}

const HEARTBEAT_INTERVAL_MS = 20000;

export function PresenceIndicators({
  entityType,
  entityId,
  currentUserId,
}: PresenceIndicatorsProps): React.JSX.Element {
  const [presence, setPresence] = useState<PresenceUser[]>([]);

  const sendHeartbeat = useCallback(async () => {
    try {
      const users = await heartbeatPresence(entityType, entityId);
      setPresence(users);
    } catch {
      // Non-fatal — presence is best-effort
    }
  }, [entityType, entityId]);

  useEffect(() => {
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      leavePresence(entityType, entityId).catch(() => undefined);
    };
  }, [entityType, entityId, sendHeartbeat]);

  const others = presence.filter((u) => u.user_id !== currentUserId);
  if (others.length === 0) return <></>;

  return (
    <div className="flex items-center gap-1" aria-label="Users currently editing">
      <span className="text-xs text-muted-foreground mr-1">Also viewing:</span>
      {others.slice(0, 5).map((u) => (
        <abbr
          key={u.user_id}
          title={u.display_name}
          className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/20 text-primary text-xs font-semibold border border-primary/30"
        >
          {u.display_name.slice(0, 2).toUpperCase()}
        </abbr>
      ))}
      {others.length > 5 && (
        <span className="text-xs text-muted-foreground">+{others.length - 5}</span>
      )}
    </div>
  );
}
