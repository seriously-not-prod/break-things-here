/**
 * Timeline conflict detection — story #765 / tasks #803 #804.
 *
 * The service is pure: given a snapshot of `TimelineActivity` rows and an
 * optional candidate ordering it returns the conflicts implied by that
 * state. Pulling this out of the controller keeps it unit-testable (no
 * database access) and reusable by both the validate-on-reorder flow and
 * the read-only "current conflicts" GET endpoint.
 */

export interface TimelineActivitySnapshot {
  id: number;
  title: string;
  start_time: string | null;
  end_time: string | null;
  planned_start_time: string | null;
  planned_end_time: string | null;
  sort_order: number;
  vendor_id: number | null;
  location: string | null;
  buffer_before_mins: number;
  buffer_after_mins: number;
}

export type ConflictReason =
  | 'overlap'
  | 'adjacent_no_buffer'
  | 'resource_double_book'
  | 'sort_dependency';

export interface TimelineConflict {
  activity_a_id: number;
  activity_a_title: string;
  activity_b_id: number;
  activity_b_title: string;
  reason: ConflictReason;
  /** Free-text explanation rendered in the UI tooltip. */
  message: string;
}

function pickWindow(a: TimelineActivitySnapshot): { start: number; end: number } | null {
  const start = a.start_time ?? a.planned_start_time;
  const end = a.end_time ?? a.planned_end_time;
  if (!start || !end) return null;
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return { start: startMs, end: endMs };
}

function sameResource(a: TimelineActivitySnapshot, b: TimelineActivitySnapshot): boolean {
  if (a.vendor_id !== null && b.vendor_id !== null && a.vendor_id === b.vendor_id) return true;
  if (
    a.location &&
    b.location &&
    a.location.trim().toLowerCase() === b.location.trim().toLowerCase()
  )
    return true;
  return false;
}

const MS_PER_MIN = 60 * 1000;

/**
 * Detect overlap, adjacency-without-buffer, and resource double-bookings
 * across the supplied activities. The caller is responsible for applying
 * sort_order overrides before invoking this function.
 */
export function detectTimelineConflicts(
  activities: TimelineActivitySnapshot[],
): TimelineConflict[] {
  const conflicts: TimelineConflict[] = [];
  for (let i = 0; i < activities.length; i++) {
    for (let j = i + 1; j < activities.length; j++) {
      const a = activities[i];
      const b = activities[j];
      const aw = pickWindow(a);
      const bw = pickWindow(b);
      if (!aw || !bw) continue;

      // Strict time overlap
      if (aw.start < bw.end && bw.start < aw.end) {
        const resource = sameResource(a, b);
        conflicts.push({
          activity_a_id: a.id,
          activity_a_title: a.title,
          activity_b_id: b.id,
          activity_b_title: b.title,
          reason: resource ? 'resource_double_book' : 'overlap',
          message: resource
            ? `Activities "${a.title}" and "${b.title}" overlap and share a resource (vendor/location).`
            : `Activities "${a.title}" and "${b.title}" overlap in time.`,
        });
        continue;
      }

      // Adjacent without configured buffer
      const earlier = aw.end <= bw.start ? { meta: a, w: aw } : { meta: b, w: bw };
      const later = aw.end <= bw.start ? { meta: b, w: bw } : { meta: a, w: aw };
      const requiredBufferMs =
        Math.max(earlier.meta.buffer_after_mins ?? 0, later.meta.buffer_before_mins ?? 0) *
        MS_PER_MIN;
      if (requiredBufferMs > 0 && later.w.start - earlier.w.end < requiredBufferMs) {
        conflicts.push({
          activity_a_id: earlier.meta.id,
          activity_a_title: earlier.meta.title,
          activity_b_id: later.meta.id,
          activity_b_title: later.meta.title,
          reason: 'adjacent_no_buffer',
          message: `"${later.meta.title}" starts before "${earlier.meta.title}" completes its buffer (${Math.round(requiredBufferMs / MS_PER_MIN)} min).`,
        });
      }
    }
  }
  return conflicts;
}

/**
 * Validate a candidate reorder. Returns:
 *   - violations: conflicts introduced (or still present) after applying the order
 *   - sortDependencyViolations: activities moved before their time-prerequisite
 *
 * The caller can reject the reorder (rollback) if either array is non-empty.
 */
export function validateReorder(
  current: TimelineActivitySnapshot[],
  proposed: Array<{ id: number; sort_order: number }>,
): { violations: TimelineConflict[]; sortDependencyViolations: TimelineConflict[] } {
  const byId = new Map(current.map((a) => [a.id, a]));
  const applied: TimelineActivitySnapshot[] = proposed
    .map((p) => {
      const existing = byId.get(p.id);
      if (!existing) return null;
      return { ...existing, sort_order: p.sort_order };
    })
    .filter((a): a is TimelineActivitySnapshot => a !== null);
  // Include any activities not part of the proposed list so we still check
  // conflicts against the full event timeline.
  current.forEach((a) => {
    if (!proposed.some((p) => p.id === a.id)) applied.push(a);
  });
  applied.sort((a, b) => a.sort_order - b.sort_order);

  const violations = detectTimelineConflicts(applied);

  // Sort-order dependency check: an activity with an earlier start_time
  // should not be ordered after one with a later start_time. This catches
  // the typical "user drags a setup task after the event itself" mistake.
  const sortDependencyViolations: TimelineConflict[] = [];
  for (let i = 0; i < applied.length - 1; i++) {
    const earlier = applied[i];
    const later = applied[i + 1];
    const ew = pickWindow(earlier);
    const lw = pickWindow(later);
    if (!ew || !lw) continue;
    if (ew.start > lw.start) {
      sortDependencyViolations.push({
        activity_a_id: earlier.id,
        activity_a_title: earlier.title,
        activity_b_id: later.id,
        activity_b_title: later.title,
        reason: 'sort_dependency',
        message: `"${earlier.title}" is ordered before "${later.title}" but starts later in time.`,
      });
    }
  }

  return { violations, sortDependencyViolations };
}
