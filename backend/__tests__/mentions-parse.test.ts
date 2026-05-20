/**
 * Tests: @mentions parser + notification fanout — Issue #810
 *
 * Covered acceptance criteria:
 *   ✅  Parses @username (simple handle)
 *   ✅  Parses @"display name" (quoted form)
 *   ✅  Deduplicates handles case-insensitively
 *   ✅  Handles multiple distinct mentions in one message
 *   ✅  Escaped \@ tokens are NOT parsed as mentions
 *   ✅  Edge cases: empty string, only whitespace, trailing/leading text
 *   ✅  processMentions() stores rows + emits notifications (integration)
 *   ✅  processMentions() skips unknown handles gracefully
 *   ✅  processMentions() respects in_app_enabled = false preference
 *   ✅  Author mentioning themselves does not receive a notification
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseMentions } from '../src/services/mentions/parse.js';

// ---------------------------------------------------------------------------
// Unit tests for the pure parser
// ---------------------------------------------------------------------------

describe('parseMentions() — pure parser', () => {
  // ── Simple handles ───────────────────────────────────────────────────────

  it('parses a single bare @username', () => {
    const result = parseMentions('Hello @alice, how are you?');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ handle: 'alice', isQuoted: false, raw: '@alice' });
  });

  it('parses a @username with dots and hyphens', () => {
    const [m] = parseMentions('Pinging @john.doe-dev');
    expect(m.handle).toBe('john.doe-dev');
    expect(m.isQuoted).toBe(false);
  });

  it('parses a @username at the very start of the string', () => {
    const result = parseMentions('@bob please review');
    expect(result).toHaveLength(1);
    expect(result[0].handle).toBe('bob');
  });

  it('parses a @username at the very end of the string', () => {
    const result = parseMentions('Review requested from @carol');
    expect(result).toHaveLength(1);
    expect(result[0].handle).toBe('carol');
  });

  // ── Quoted display names ──────────────────────────────────────────────────

  it('parses @"display name" with spaces', () => {
    const [m] = parseMentions('Hey @"Alice Smith", can you check?');
    expect(m.handle).toBe('Alice Smith');
    expect(m.isQuoted).toBe(true);
    expect(m.raw).toBe('@"Alice Smith"');
  });

  it('parses @"display name" with special characters', () => {
    const [m] = parseMentions('@"O\'Brien, Pat"');
    expect(m.handle).toBe("O'Brien, Pat");
    expect(m.isQuoted).toBe(true);
  });

  it('does NOT parse @"" empty quoted name', () => {
    const result = parseMentions('Testing @""');
    expect(result).toHaveLength(0);
  });

  it('does not allow newlines inside quoted display names', () => {
    const result = parseMentions('@"first\nsecond"');
    // The newline breaks the quoted form; nothing should match.
    expect(result).toHaveLength(0);
  });

  // ── Multiple mentions ─────────────────────────────────────────────────────

  it('extracts multiple distinct mentions in order', () => {
    const result = parseMentions('cc @alice @bob @"Carol Danvers"');
    expect(result).toHaveLength(3);
    expect(result.map((m) => m.handle)).toEqual(['alice', 'bob', 'Carol Danvers']);
  });

  it('extracts mentions spread across multiple lines', () => {
    const body = 'Line one mentions @alice.\nLine two mentions @bob.';
    const result = parseMentions(body);
    expect(result.map((m) => m.handle)).toEqual(['alice', 'bob']);
  });

  // ── Deduplication ─────────────────────────────────────────────────────────

  it('deduplicates the same handle appearing twice (exact case)', () => {
    const result = parseMentions('@alice did something. Thanks @alice!');
    expect(result).toHaveLength(1);
    expect(result[0].handle).toBe('alice');
  });

  it('deduplicates the same handle in different cases', () => {
    const result = parseMentions('@Alice and @alice are the same');
    expect(result).toHaveLength(1);
    expect(result[0].handle).toBe('Alice'); // keeps first occurrence
  });

  it('deduplicates a quoted name matching a bare handle (case-insensitive)', () => {
    const result = parseMentions('@alice and @"alice"');
    // @"alice" is lower-case match for 'alice' already seen
    expect(result).toHaveLength(1);
  });

  // ── Escaped mentions ──────────────────────────────────────────────────────

  it('does NOT parse \\@username as a mention', () => {
    const result = parseMentions('Use \\@alice to reference a user');
    expect(result).toHaveLength(0);
  });

  it('parses a normal @mention following an escaped one', () => {
    const result = parseMentions('\\@fake but @real is valid');
    expect(result).toHaveLength(1);
    expect(result[0].handle).toBe('real');
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it('returns empty array for empty string', () => {
    expect(parseMentions('')).toEqual([]);
  });

  it('returns empty array for text with no mentions', () => {
    expect(parseMentions('No mentions here, just plain text.')).toEqual([]);
  });

  it('returns empty array for a lone @', () => {
    expect(parseMentions('Send to: @')).toEqual([]);
  });

  it('does not count an email address as a mention', () => {
    // An email like alice@example.com should not produce a mention because
    // 'alice' is preceded by a word character, not a boundary.
    // (The lookbehind only guards against \; the regex requires @ to appear
    //  after a non-word context inherently — tested via real usage.)
    const result = parseMentions('Contact alice@example.com for details');
    // The @ inside an email is not preceded by a space/start, so no match.
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Integration tests for processMentions() — uses mock DB
// ---------------------------------------------------------------------------

// Mock the database and its helpers before importing the fanout.
// - mockAll  → used by resolveHandle (db.all with LIMIT 2)
// - mockGet  → used by notifyUser (notification_preferences lookup)
// - mockRun  → used by storeMention + notifyUser INSERT
//              Default changes:1 simulates "row newly inserted".
const mockRun = vi.fn().mockResolvedValue({ lastID: undefined, changes: 1 });
const mockGet = vi.fn();
const mockAll = vi.fn();

vi.mock('../src/db/database.js', () => ({
  getDatabase: () => ({ run: mockRun, get: mockGet, all: mockAll }),
  initializeDatabase: vi.fn(),
}));

import { processMentions } from '../src/services/mentions/fanout.js';

const BASE_CTX = {
  sourceType: 'chat_message' as const,
  sourceId: 42,
  authorId: 1,
  body: '',
  contextLabel: 'event chat',
  link: '/events/1/chat',
};

describe('processMentions() — integration', () => {
  beforeEach(() => {
    mockRun.mockClear();
    mockGet.mockClear();
    mockAll.mockClear();
    // Default: storeMention inserts a new row (changes: 1 = newly inserted).
    mockRun.mockResolvedValue({ lastID: undefined, changes: 1 });
  });

  it('does nothing when there are no mention tokens', async () => {
    await processMentions({ ...BASE_CTX, body: 'No mentions here.' });
    expect(mockAll).not.toHaveBeenCalled();
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('stores a mention row and creates a notification for a resolved user', async () => {
    // resolveHandle → exactly one match (newly inserted)
    mockAll.mockResolvedValueOnce([{ id: 99, display_name: 'Alice', email: 'alice@ex.com' }]);
    // notifyUser: no preference row → default allow
    mockGet.mockResolvedValueOnce(undefined);

    await processMentions({ ...BASE_CTX, body: 'Hello @alice!', authorId: 1 });

    // storeMention INSERT
    expect(mockRun).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO message_mentions'),
      expect.arrayContaining(['chat_message', 42, 99, 1, '@alice']),
    );
    // notification INSERT
    expect(mockRun).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO notifications'),
      expect.arrayContaining([99, 'mention']),
    );
  });

  it('skips the notification when the mentioned user has opted out', async () => {
    mockAll.mockResolvedValueOnce([{ id: 99, display_name: 'Alice', email: 'alice@ex.com' }]);
    // Preference says opt-out
    mockGet.mockResolvedValueOnce({ in_app_enabled: false });

    await processMentions({ ...BASE_CTX, body: 'Hey @alice', authorId: 1 });

    // storeMention should still run
    expect(mockRun).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO message_mentions'),
      expect.anything(),
    );
    // notification INSERT should NOT run
    const notifCall = mockRun.mock.calls.find(
      ([sql]: [string]) => typeof sql === 'string' && sql.includes('INSERT INTO notifications'),
    );
    expect(notifCall).toBeUndefined();
  });

  it('does not notify the author when they mention themselves', async () => {
    mockAll.mockResolvedValueOnce([{ id: 1, display_name: 'Author', email: 'a@ex.com' }]);

    await processMentions({ ...BASE_CTX, body: '@Author look at this', authorId: 1 });

    const notifCall = mockRun.mock.calls.find(
      ([sql]: [string]) => typeof sql === 'string' && sql.includes('INSERT INTO notifications'),
    );
    expect(notifCall).toBeUndefined();
  });

  it('skips gracefully when the handle resolves to no user', async () => {
    mockAll.mockResolvedValueOnce([]); // no user found

    await processMentions({ ...BASE_CTX, body: '@unknown_handle' });

    expect(mockRun).not.toHaveBeenCalled();
  });

  it('skips gracefully when handle is ambiguous (multiple matches)', async () => {
    // Two users match — ambiguous, should not notify either
    mockAll.mockResolvedValueOnce([
      { id: 10, display_name: 'Alex', email: 'alex@a.com' },
      { id: 11, display_name: 'Alex', email: 'alex@b.com' },
    ]);

    await processMentions({ ...BASE_CTX, body: '@alex please check' });

    expect(mockRun).not.toHaveBeenCalled();
  });

  it('does not send a duplicate notification when mention row already exists', async () => {
    mockAll.mockResolvedValueOnce([{ id: 99, display_name: 'Alice', email: 'alice@ex.com' }]);
    // storeMention returns changes: 0 — row already existed
    mockRun.mockResolvedValueOnce({ lastID: undefined, changes: 0 });

    await processMentions({ ...BASE_CTX, body: '@alice replay', authorId: 2 });

    // storeMention ran but changes=0 → notification should be skipped
    const notifCall = mockRun.mock.calls.find(
      ([sql]: [string]) => typeof sql === 'string' && sql.includes('INSERT INTO notifications'),
    );
    expect(notifCall).toBeUndefined();
  });

  it('handles multiple mentions in one message', async () => {
    // bob resolves; ghost does not
    mockAll
      .mockResolvedValueOnce([{ id: 10, display_name: 'Bob', email: 'b@ex.com' }])
      .mockResolvedValueOnce([]); // @ghost → no user

    // notification_preferences for bob
    mockGet.mockResolvedValueOnce(undefined);

    await processMentions({
      ...BASE_CTX,
      body: '@bob please check, cc @ghost',
      authorId: 999,
    });

    const mentionInserts = mockRun.mock.calls.filter(
      ([sql]: [string]) => typeof sql === 'string' && sql.includes('INSERT INTO message_mentions'),
    );
    expect(mentionInserts).toHaveLength(1); // only bob stored
  });

  it('does not throw even when DB operations fail', async () => {
    mockAll.mockRejectedValueOnce(new Error('DB down'));

    await expect(processMentions({ ...BASE_CTX, body: '@alice boom' })).resolves.not.toThrow();
  });
});
