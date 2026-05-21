/**
 * @mentions parser — Issue #810
 *
 * Parses `@username` and `@"display name"` tokens from a plain-text body.
 *
 * Supported forms
 * ---------------
 *   @alice            — simple handle: word chars + . - _
 *   @"Alice Smith"    — quoted display name: any chars except newline / quote
 *
 * Escape rule
 * -----------
 *   A backslash immediately before @ (`\@`) suppresses the token.
 *
 * Deduplication
 * -------------
 *   Handles are compared case-insensitively.  Only the first occurrence of a
 *   handle is returned.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedMention {
  /** Full raw token as it appeared in the text, e.g. `@alice` or `@"Alice Smith"` */
  raw: string;
  /**
   * Normalised handle: the username or display name without `@` and enclosing
   * quotes.  Never contains leading/trailing whitespace.
   */
  handle: string;
  /** `true` when the `@"..."` quoted form was used */
  isQuoted: boolean;
}

// ---------------------------------------------------------------------------
// Regex
// ---------------------------------------------------------------------------

/**
 * Negative lookbehind `(?<![\w.\-+\\])`:
 *   - `\w`  — word character: prevents matching `@` inside email addresses
 *             (e.g. `alice@example.com` — the `@` follows `e`, a word char).
 *   - `.`   — period: blocks `foo.@example.com` style false positives.
 *   - `-`   — hyphen: blocks `foo-@example.com` style false positives.
 *   - `+`   — plus: blocks `foo+@example.com` style false positives.
 *   - `\\`  — backslash: `\@alice` is treated as an escaped, non-mention token.
 *
 * Capture groups:
 *   [1] — quoted display name  (content inside `@"..."`, no newlines)
 *   [2] — simple handle        (starts AND ends with a word char; dots/hyphens
 *                               allowed in the interior only)
 *
 * Simple handle pattern `\w(?:[\w.\-]*\w)?`:
 *   - Single char  → matched by the leading `\w` alone.
 *   - Multi-char   → interior may contain word chars, dots, hyphens; final char
 *                    must be a word char (prevents trailing `.` / `-`).
 */
const MENTION_RE = /(?<![\w.\-+\\])@(?:"([^"\n]+)"|(\w(?:[\w.\-]*\w)?))/g;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract all @mention tokens from `text`.
 *
 * @param text - Raw message body (may contain newlines).
 * @returns Ordered, deduplicated list of parsed mentions.
 */
export function parseMentions(text: string): ParsedMention[] {
  const seen = new Set<string>();
  const results: ParsedMention[] = [];

  for (const match of text.matchAll(MENTION_RE)) {
    const quotedName = match[1] as string | undefined;
    const simpleName = match[2] as string | undefined;
    const handle = (quotedName ?? simpleName ?? '').trim();

    if (!handle) continue;

    // Deduplicate case-insensitively — keep first occurrence.
    const key = handle.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      raw: match[0],
      handle,
      isQuoted: Boolean(quotedName),
    });
  }

  return results;
}
