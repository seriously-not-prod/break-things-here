/**
 * Persists the most-recently-visited event so the sidebar workspace links
 * can navigate directly to that event's sub-pages without requiring the user
 * to re-select an event each time.
 */

const STORAGE_KEY = 'equip-fest:last-event-id';

export function getLastEventId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setLastEventId(id: string | number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(id));
  } catch {
    // ignore storage errors
  }
}
