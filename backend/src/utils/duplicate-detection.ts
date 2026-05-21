/**
 * Duplicate-guest detection helpers (#435).
 *
 * The detector groups RSVPs that look like the same person registered twice.
 * The unique constraint on rsvps(event_id, email) blocks identical-email
 * duplicates, so the practical cases are:
 *
 *  - Same person used two different emails (work vs personal). Heuristic: same
 *    normalized phone, or same name + plus_one configuration.
 *  - Typo in the email local part. Heuristic: same name and same email domain.
 *  - Name typos / case differences. Heuristic: equal normalized full name.
 *
 * The output is an ordered list of clusters, each with a recommended primary
 * (most recently updated, then highest id) so the merge UI can default to a
 * sensible target.
 */

export interface DuplicateCandidateRow {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  guests: number;
  created_at: string;
  updated_at: string;
}

export interface DuplicateCluster {
  reason: 'same_phone' | 'same_name_and_email_domain' | 'same_normalized_name';
  rsvps: DuplicateCandidateRow[];
  recommendedPrimaryId: number;
}

const PHONE_DIGITS_RE = /\D+/g;
const WHITESPACE_RE = /\s+/g;

export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(PHONE_DIGITS_RE, '');
  return digits.length >= 7 ? digits : null;
}

export function normalizeName(name: string | null | undefined): string {
  if (!name) return '';
  return name.toLowerCase().trim().replace(WHITESPACE_RE, ' ');
}

export function emailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  return email
    .slice(at + 1)
    .toLowerCase()
    .trim();
}

function chooseRecommendedPrimary(rows: DuplicateCandidateRow[]): number {
  // Prefer most recent updated_at, then highest id.
  const sorted = [...rows].sort((a, b) => {
    const cmp = (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
    if (cmp !== 0) return cmp;
    return b.id - a.id;
  });
  return sorted[0].id;
}

export function detectDuplicateClusters(rsvps: DuplicateCandidateRow[]): DuplicateCluster[] {
  const byPhone = new Map<string, DuplicateCandidateRow[]>();
  const byNameDomain = new Map<string, DuplicateCandidateRow[]>();
  const byNormName = new Map<string, DuplicateCandidateRow[]>();

  for (const r of rsvps) {
    const phone = normalizePhone(r.phone);
    if (phone) {
      const arr = byPhone.get(phone) ?? [];
      arr.push(r);
      byPhone.set(phone, arr);
    }
    const name = normalizeName(r.name);
    const domain = emailDomain(r.email);
    if (name && domain) {
      const key = `${name}|${domain}`;
      const arr = byNameDomain.get(key) ?? [];
      arr.push(r);
      byNameDomain.set(key, arr);
    }
    if (name) {
      const arr = byNormName.get(name) ?? [];
      arr.push(r);
      byNormName.set(name, arr);
    }
  }

  const clusters: DuplicateCluster[] = [];
  const claimed = new Set<number>(); // RSVPs already in a cluster won't be added again

  function emit(reason: DuplicateCluster['reason'], rows: DuplicateCandidateRow[]): void {
    if (rows.length < 2) return;
    const fresh = rows.filter((r) => !claimed.has(r.id));
    if (fresh.length < 2) return;
    fresh.forEach((r) => claimed.add(r.id));
    clusters.push({
      reason,
      rsvps: fresh,
      recommendedPrimaryId: chooseRecommendedPrimary(fresh),
    });
  }

  for (const rows of byPhone.values()) emit('same_phone', rows);
  for (const rows of byNameDomain.values()) emit('same_name_and_email_domain', rows);
  for (const rows of byNormName.values()) emit('same_normalized_name', rows);

  return clusters;
}
