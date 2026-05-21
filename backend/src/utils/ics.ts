/**
 * RFC 5545 iCalendar (.ics) payload generator for RSVP confirmation emails (#436).
 *
 * Kept dependency-free and deterministic so unit tests can compare exact output.
 * Output uses CRLF line endings as required by the spec, folds long lines at 75
 * octets, and escapes commas/semicolons/newlines/backslashes inside text fields.
 */

export interface IcsEventInput {
  uid: string;
  start: Date;
  end?: Date;
  durationMinutes?: number;
  summary: string;
  description?: string | null;
  location?: string | null;
  organizerEmail?: string | null;
  organizerName?: string | null;
  attendeeEmail?: string | null;
  attendeeName?: string | null;
  url?: string | null;
  /** Used as DTSTAMP and SEQUENCE base. Defaults to "now". */
  now?: Date;
}

const PRODID = '-//Festival Event Planner//RSVP//EN';

function pad(n: number, width = 2): string {
  return n.toString().padStart(width, '0');
}

/** Format a Date as ICS UTC stamp (YYYYMMDDTHHMMSSZ). */
export function formatIcsDate(date: Date): string {
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  );
}

/** RFC 5545 §3.3.11 text escaping. */
export function escapeIcsText(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/\r\n/g, '\\n')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/** RFC 5545 §3.1 line folding: split at 75 octets, fold with CRLF + space. */
export function foldIcsLine(line: string): string {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;
  const out: string[] = [];
  let buf = '';
  let bytes = 0;
  for (const ch of line) {
    const chBytes = Buffer.byteLength(ch, 'utf8');
    if (bytes + chBytes > 75 && buf.length > 0) {
      out.push(buf);
      buf = ' ' + ch;
      bytes = 1 + chBytes;
    } else {
      buf += ch;
      bytes += chBytes;
    }
  }
  if (buf.length > 0) out.push(buf);
  return out.join('\r\n');
}

function line(name: string, value: string): string {
  return foldIcsLine(`${name}:${value}`);
}

function paramLine(name: string, params: Record<string, string>, value: string): string {
  const paramPart = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join(';');
  return foldIcsLine(`${name};${paramPart}:${value}`);
}

export function buildIcsEvent(input: IcsEventInput): string {
  if (!input.uid || !input.summary) {
    throw new Error('uid and summary are required for an ICS event');
  }
  const start = input.start;
  const end =
    input.end ??
    (typeof input.durationMinutes === 'number'
      ? new Date(start.getTime() + input.durationMinutes * 60_000)
      : new Date(start.getTime() + 60 * 60_000));
  const stamp = input.now ?? new Date();

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'METHOD:REQUEST',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    line('UID', input.uid),
    line('DTSTAMP', formatIcsDate(stamp)),
    line('DTSTART', formatIcsDate(start)),
    line('DTEND', formatIcsDate(end)),
    line('SUMMARY', escapeIcsText(input.summary)),
  ];
  if (input.description) lines.push(line('DESCRIPTION', escapeIcsText(input.description)));
  if (input.location) lines.push(line('LOCATION', escapeIcsText(input.location)));
  if (input.url) lines.push(line('URL', input.url));
  if (input.organizerEmail) {
    const params: Record<string, string> = {};
    if (input.organizerName) params['CN'] = `"${input.organizerName.replace(/"/g, '')}"`;
    lines.push(paramLine('ORGANIZER', params, `mailto:${input.organizerEmail}`));
  }
  if (input.attendeeEmail) {
    const params: Record<string, string> = {
      RSVP: 'TRUE',
      ROLE: 'REQ-PARTICIPANT',
      PARTSTAT: 'NEEDS-ACTION',
    };
    if (input.attendeeName) params['CN'] = `"${input.attendeeName.replace(/"/g, '')}"`;
    lines.push(paramLine('ATTENDEE', params, `mailto:${input.attendeeEmail}`));
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
