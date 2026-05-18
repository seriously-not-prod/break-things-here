import React, { useEffect, useState } from 'react';
import {
  listEntityVersions,
  rollbackEntityVersion,
  type EntityVersion,
} from '../../services/entity-versions-service';

interface VersionHistoryPanelProps {
  eventId: number;
  entityId: number;
  entityType: 'task' | 'timeline_activity';
  onRollback?: () => void;
}

export function VersionHistoryPanel({
  eventId,
  entityId,
  entityType,
  onRollback,
}: VersionHistoryPanelProps): React.JSX.Element {
  const [versions, setVersions] = useState<EntityVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rolling, setRolling] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    listEntityVersions(eventId, entityId, entityType)
      .then((v) => { setVersions(v); setLoading(false); })
      .catch((err: Error) => { setError(err.message); setLoading(false); });
  }, [eventId, entityId, entityType]);

  const handleRollback = async (versionId: number) => {
    if (!window.confirm('Roll back to this version? Current state will be saved as a new version.')) return;
    setRolling(versionId);
    try {
      await rollbackEntityVersion(eventId, entityId, entityType, versionId);
      onRollback?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Rollback failed');
    } finally {
      setRolling(null);
    }
  };

  if (loading) return <div className="p-4 text-sm text-muted-foreground">Loading version history…</div>;

  return (
    <div className="p-4" aria-label="Version history">
      <h3 className="font-semibold mb-3">Version History</h3>
      {error && (
        <div className="text-red-600 text-sm p-2 rounded bg-red-50 border border-red-200 mb-3" role="alert">
          {error}
          <button className="ml-2 underline" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
      {versions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No version history available.</p>
      ) : (
        <ul className="space-y-2">
          {versions.map((v, idx) => (
            <li key={v.id} className="border rounded p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="font-medium">v{v.version}</span>
                  {idx === 0 && <span className="ml-2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Current</span>}
                  <span className="ml-2 text-muted-foreground">
                    by {v.changed_by_name ?? 'Unknown'} —{' '}
                    {new Date(v.created_at).toLocaleString()}
                  </span>
                  {v.change_note && (
                    <span className="ml-2 text-muted-foreground italic text-xs">{v.change_note}</span>
                  )}
                </div>
                {idx !== 0 && (
                  <button
                    className="px-3 py-1 text-xs border rounded hover:bg-muted disabled:opacity-50"
                    disabled={rolling === v.id}
                    onClick={() => handleRollback(v.id)}
                    aria-label={`Rollback to version ${v.version}`}
                  >
                    {rolling === v.id ? 'Rolling back…' : 'Roll back'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
