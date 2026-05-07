/**
 * ICS payload generator unit tests (#436).
 */
import { describe, expect, it } from 'vitest';
import { buildIcsEvent, escapeIcsText, foldIcsLine, formatIcsDate } from '../src/utils/ics';

describe('formatIcsDate', () => {
  it('formats UTC dates as YYYYMMDDTHHMMSSZ', () => {
    expect(formatIcsDate(new Date('2026-05-07T13:45:09Z'))).toBe('20260507T134509Z');
  });

  it('zero-pads single-digit components', () => {
    expect(formatIcsDate(new Date('2026-01-02T03:04:05Z'))).toBe('20260102T030405Z');
  });
});

describe('escapeIcsText', () => {
  it('escapes commas, semicolons, newlines, and backslashes', () => {
    expect(escapeIcsText('Hello, world; line\nbreak\\here')).toBe(
      'Hello\\, world\\; line\\nbreak\\\\here',
    );
  });
});

describe('foldIcsLine', () => {
  it('keeps short lines untouched', () => {
    expect(foldIcsLine('SUMMARY:Hi')).toBe('SUMMARY:Hi');
  });

  it('folds long lines with CRLF + space', () => {
    const long = 'X-LONG:' + 'a'.repeat(120);
    const folded = foldIcsLine(long);
    expect(folded).toContain('\r\n ');
    // Each segment ≤ 75 octets
    for (const segment of folded.split('\r\n')) {
      expect(Buffer.byteLength(segment, 'utf8')).toBeLessThanOrEqual(75);
    }
  });
});

describe('buildIcsEvent', () => {
  const now = new Date('2026-05-01T00:00:00Z');

  it('emits a minimal VEVENT with deterministic UID and DTSTAMP', () => {
    const ics = buildIcsEvent({
      uid: 'event-1-rsvp-2@festival',
      summary: 'Demo Event',
      start: new Date('2026-06-15T19:00:00Z'),
      durationMinutes: 90,
      now,
    });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('METHOD:REQUEST');
    expect(ics).toContain('UID:event-1-rsvp-2@festival');
    expect(ics).toContain('DTSTAMP:20260501T000000Z');
    expect(ics).toContain('DTSTART:20260615T190000Z');
    expect(ics).toContain('DTEND:20260615T203000Z');
    expect(ics).toContain('SUMMARY:Demo Event');
    expect(ics).toContain('END:VEVENT');
    expect(ics.endsWith('\r\n')).toBe(true);
  });

  it('escapes summary/description/location', () => {
    const ics = buildIcsEvent({
      uid: 'u',
      summary: 'A; B, C\nNext',
      description: 'Notes; here',
      location: 'Hall, A',
      start: new Date('2026-06-15T19:00:00Z'),
      now,
    });
    expect(ics).toContain('SUMMARY:A\\; B\\, C\\nNext');
    expect(ics).toContain('DESCRIPTION:Notes\\; here');
    expect(ics).toContain('LOCATION:Hall\\, A');
  });

  it('writes ATTENDEE with CN, RSVP, ROLE, PARTSTAT params', () => {
    const ics = buildIcsEvent({
      uid: 'u',
      summary: 'X',
      start: new Date('2026-06-15T19:00:00Z'),
      attendeeEmail: 'g@x.io',
      attendeeName: 'A',
      organizerEmail: 'h@x.io',
      organizerName: 'H',
      now,
    });
    expect(ics).toContain('ORGANIZER;CN="H":mailto:h@x.io');
    // ATTENDEE always exceeds 75 octets so the spec mandates line folding.
    // Strip the fold (CRLF + leading SP) before asserting on the value.
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain(
      'ATTENDEE;RSVP=TRUE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;CN="A":mailto:g@x.io',
    );
  });

  it('uses end when provided, ignoring durationMinutes', () => {
    const ics = buildIcsEvent({
      uid: 'u',
      summary: 'X',
      start: new Date('2026-06-15T19:00:00Z'),
      end: new Date('2026-06-15T22:00:00Z'),
      durationMinutes: 30,
      now,
    });
    expect(ics).toContain('DTEND:20260615T220000Z');
  });

  it('throws when uid or summary is missing', () => {
    expect(() =>
      buildIcsEvent({
        uid: '',
        summary: 'X',
        start: now,
      }),
    ).toThrow();
  });
});
