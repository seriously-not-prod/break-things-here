/**
 * Guest profile completeness scoring (#543, #582).
 *
 * Returns an integer 0-100 reflecting how many of the BRD profile fields the
 * guest has filled. Used to drive the "profile complete" badge in the guest
 * list and to gate exports/printing for incomplete records.
 */

export interface GuestProfileFields {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address_line1?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string | null;
  company?: string | null;
  title?: string | null;
  relation_type?: string | null;
  age_group?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  dietary_restriction?: string | null;
  accessibility_needs?: string | null;
}

interface CompletenessField { key: keyof GuestProfileFields; weight: number; }

const FIELDS: CompletenessField[] = [
  { key: 'name', weight: 12 },
  { key: 'email', weight: 12 },
  { key: 'phone', weight: 10 },
  { key: 'address_line1', weight: 8 },
  { key: 'city', weight: 4 },
  { key: 'postal_code', weight: 4 },
  { key: 'country', weight: 4 },
  { key: 'company', weight: 6 },
  { key: 'title', weight: 4 },
  { key: 'relation_type', weight: 8 },
  { key: 'age_group', weight: 6 },
  { key: 'emergency_contact_name', weight: 8 },
  { key: 'emergency_contact_phone', weight: 8 },
  { key: 'dietary_restriction', weight: 4 },
  { key: 'accessibility_needs', weight: 2 },
];

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const text = String(value).trim().toLowerCase();
  if (text === '') return false;
  // 'None' is the system default for dietary_restriction and should not count
  // as "filled in by the guest" for completeness purposes.
  if (text === 'none') return false;
  return true;
}

/** Returns a percentage 0-100. */
export function computeProfileCompleteness(rsvp: GuestProfileFields): number {
  const total = FIELDS.reduce((acc, f) => acc + f.weight, 0);
  const earned = FIELDS.reduce((acc, f) => {
    return isFilled(rsvp[f.key]) ? acc + f.weight : acc;
  }, 0);
  return Math.round((earned / total) * 100);
}

export const PROFILE_COMPLETENESS_FIELDS = FIELDS.map((f) => f.key);
