/**
 * Communication template personalization (#590).
 *
 * Replaces `{tokens}` (case-insensitive) inside subject and body strings with
 * per-recipient values. Unknown tokens are left intact so accidental typos in
 * a template do not break a send — the team can see {OOPS} in the rendered
 * preview and fix the template.
 */

export type TemplateTokens = Record<string, string | number | null | undefined>;

const TOKEN_RE = /\{([a-zA-Z0-9_]+)\}/g;

export function personalize(input: string, tokens: TemplateTokens): string {
  if (!input) return '';
  return input.replace(TOKEN_RE, (match, key: string) => {
    const lookup = Object.keys(tokens).find((k) => k.toLowerCase() === key.toLowerCase());
    if (!lookup) return match;
    const value = tokens[lookup];
    if (value === null || value === undefined) return '';
    return String(value);
  });
}

export function buildGuestTokens(input: {
  name?: string | null;
  email?: string | null;
  eventTitle?: string | null;
  eventDate?: string | null;
  eventLocation?: string | null;
  rsvpUrl?: string | null;
  unsubscribeUrl?: string | null;
  mealChoice?: string | null;
  status?: string | null;
  organizerName?: string | null;
}): TemplateTokens {
  return {
    name: input.name ?? '',
    guest_name: input.name ?? '',
    email: input.email ?? '',
    event: input.eventTitle ?? '',
    event_title: input.eventTitle ?? '',
    event_date: input.eventDate ?? '',
    event_location: input.eventLocation ?? '',
    rsvp_url: input.rsvpUrl ?? '',
    unsubscribe_url: input.unsubscribeUrl ?? '',
    meal_choice: input.mealChoice ?? '',
    status: input.status ?? '',
    organizer: input.organizerName ?? '',
  };
}
