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

export type VersionedEntityType = 'task' | 'timeline_activity' | 'event' | 'rsvp';

function segmentFor(entityType: VersionedEntityType): string {
  switch (entityType) {
    case 'task':
      return 'tasks';
    case 'timeline_activity':
      return 'timeline';
    case 'rsvp':
      return 'rsvps';
    case 'event':
      return 'entities';
  }
}

export async function listEntityVersions(
  eventId: number,
  entityId: number,
  entityType: VersionedEntityType,
): Promise<EntityVersion[]> {
  if (entityType === 'event') {
    // event uses the generic /entities path; the controller resolves the
    // entity_type via the existing query-string fallback.
    const data = await api.get<{ versions: EntityVersion[] }>(
      `/api/events/${eventId}/entities/${entityId}/versions?entity_type=event`,
    );
    return data.versions;
  }
  const data = await api.get<{ versions: EntityVersion[] }>(
    `/api/events/${eventId}/${segmentFor(entityType)}/${entityId}/versions`,
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
  entityType: VersionedEntityType,
  versionId: number,
): Promise<{ entity: Record<string, unknown>; rolled_back_to_version: number }> {
  if (entityType === 'event') {
    return api.post(`/api/events/${eventId}/entities/${entityId}/rollback`, {
      version_id: versionId,
      entity_type: 'event',
    });
  }
  return api.post(`/api/events/${eventId}/${segmentFor(entityType)}/${entityId}/rollback`, {
    version_id: versionId,
    entity_type: entityType,
  });
}
