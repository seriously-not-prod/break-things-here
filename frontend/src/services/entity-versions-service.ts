/**
 * Entity Versions Service
 * Issue: #629 — Version history and rollback
 */

import { api } from '../lib/api-client';

export interface EntityVersion {
  id: number;
  entity_type: string;
  entity_id: number;
  version: number;
  snapshot: Record<string, unknown>;
  changed_by: number | null;
  changed_by_name: string | null;
  change_note: string | null;
  created_at: string;
}

export async function listEntityVersions(
  eventId: number,
  entityId: number,
  entityType: 'task' | 'timeline_activity',
): Promise<EntityVersion[]> {
  const segment = entityType === 'task' ? 'tasks' : 'timeline';
  const data = await api.get<{ versions: EntityVersion[] }>(
    `/api/events/${eventId}/${segment}/${entityId}/versions`,
  );
  return data.versions;
}

export async function getEntityVersion(versionId: number): Promise<EntityVersion> {
  const data = await api.get<{ version: EntityVersion }>(`/api/entity-versions/${versionId}`);
  return data.version;
}

export async function rollbackEntityVersion(
  eventId: number,
  entityId: number,
  entityType: 'task' | 'timeline_activity',
  versionId: number,
): Promise<{ entity: Record<string, unknown>; rolled_back_to_version: number }> {
  const segment = entityType === 'task' ? 'tasks' : 'timeline';
  return api.post(`/api/events/${eventId}/${segment}/${entityId}/rollback`, {
    version_id: versionId,
    entity_type: entityType,
  });
}
