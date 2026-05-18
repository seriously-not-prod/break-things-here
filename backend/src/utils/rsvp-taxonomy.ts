/**
 * BRD v2 canonical RSVP taxonomy (#544, #584).
 *
 * The legacy `rsvps.status` column carries free-text values ('Pending', 'Going',
 * 'Maybe', 'Not Going', 'Declined', etc.) preserved verbatim from earlier
 * implementations and bulk imports. The BRD/FRD requires a canonical
 * machine-readable status set so reports, analytics, and downstream flows
 * (waitlist, comms, attendance) can branch reliably.
 *
 * This module owns the mapping. The DB column `rsvps.canonical_status` is the
 * source of truth for taxonomy-aware logic; `rsvps.status` is preserved for
 * backward compatibility and is still what guests see in CSVs and UI.
 */

export type CanonicalRsvpStatus =
  | 'pending'
  | 'confirmed'
  | 'declined'
  | 'maybe'
  | 'waitlist'
  | 'cancelled'
  | 'checked_in'
  | 'no_show';

export const CANONICAL_STATUSES: readonly CanonicalRsvpStatus[] = [
  'pending',
  'confirmed',
  'declined',
  'maybe',
  'waitlist',
  'cancelled',
  'checked_in',
  'no_show',
] as const;

/** Legacy status values still persisted in `rsvps.status` for backward compatibility. */
export const LEGACY_RSVP_STATUSES = ['Pending', 'Going', 'Maybe', 'Not Going', 'Declined'] as const;
export type LegacyRsvpStatus = (typeof LEGACY_RSVP_STATUSES)[number];

/**
 * Map any legacy free-text status to a canonical value. Unknown values default
 * to 'pending' so analytics buckets stay coherent.
 */
export function toCanonicalStatus(
  legacy: string | null | undefined,
  context: { waitlisted?: boolean; checkedIn?: boolean } = {},
): CanonicalRsvpStatus {
  if (context.waitlisted) return 'waitlist';
  if (context.checkedIn) return 'checked_in';
  const v = (legacy ?? '').trim().toLowerCase();
  if (!v) return 'pending';
  if (['going', 'yes', 'confirmed', 'accepted'].includes(v)) return 'confirmed';
  if (['not going', 'declined', 'no', 'rejected'].includes(v)) return 'declined';
  if (['maybe', 'tentative'].includes(v)) return 'maybe';
  if (['cancelled', 'canceled'].includes(v)) return 'cancelled';
  if (['waitlist', 'waitlisted', 'queued'].includes(v)) return 'waitlist';
  if (['checked_in', 'checked in', 'attended'].includes(v)) return 'checked_in';
  if (['no_show', 'no show', 'missed'].includes(v)) return 'no_show';
  if (['pending', 'invited', 'sent'].includes(v)) return 'pending';
  return 'pending';
}

/** Reverse map for round-tripping a canonical value into the legacy column. */
export function toLegacyStatus(canonical: CanonicalRsvpStatus): string {
  switch (canonical) {
    case 'confirmed': return 'Going';
    case 'declined': return 'Declined';
    case 'maybe': return 'Maybe';
    case 'cancelled': return 'Not Going';
    case 'waitlist': return 'Going'; // waitlisted rows keep 'Going' per legacy contract
    case 'checked_in': return 'Going';
    case 'no_show': return 'Going';
    case 'pending':
    default: return 'Pending';
  }
}

export function isCanonicalStatus(value: unknown): value is CanonicalRsvpStatus {
  return typeof value === 'string' && (CANONICAL_STATUSES as readonly string[]).includes(value);
}

/**
 * Normalize inbound status text to one of the persisted legacy values.
 * Accepts both legacy strings and canonical/UX aliases.
 */
export function normalizeLegacyRsvpStatusInput(value: unknown): LegacyRsvpStatus | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (!v) return null;

  if (['pending', 'no response', 'no_response', 'invited'].includes(v)) return 'Pending';
  if (['going', 'confirmed', 'yes', 'accepted'].includes(v)) return 'Going';
  if (['maybe', 'tentative'].includes(v)) return 'Maybe';
  if (['not going', 'not_going', 'cancelled', 'canceled'].includes(v)) return 'Not Going';
  if (['declined', 'rejected', 'no'].includes(v)) return 'Declined';

  return null;
}
