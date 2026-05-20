/**
 * Embed-tracking unit tests — verifies that outgoing email bodies get rewritten
 * with click-tracking redirects and an open pixel (#465, #466).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { appendOpenPixel, embedTracking, wrapLinksWithTracking } from '../src/utils/embed-tracking';

beforeEach(() => {
  process.env.TRACKING_TOKEN_SECRET = 'test-secret-do-not-use-in-prod';
});

describe('wrapLinksWithTracking', () => {
  it('rewrites http and https hrefs through the click endpoint', () => {
    const html = '<a href="https://example.com/a">A</a> <a href=\'http://other.com\'>B</a>';
    const result = wrapLinksWithTracking(html, 'https://app.test', 1);
    expect(result).toContain('href="https://app.test/api/tracking/click/');
    expect(result).toContain("href='https://app.test/api/tracking/click/");
    expect(result).not.toContain('href="https://example.com/a"');
    expect(result).not.toContain("href='http://other.com'");
  });

  it('leaves mailto:, tel:, anchors, and relative paths untouched', () => {
    const html =
      '<a href="mailto:x@y.com">x</a><a href="#anchor">a</a><a href="/relative">r</a><a href="tel:+1">t</a>';
    const result = wrapLinksWithTracking(html, 'https://app.test', 1);
    expect(result).toBe(html);
  });

  it('encodes the original URL inside the click token so it round-trips', () => {
    const html = '<a href="https://example.com/page?x=1&y=2">x</a>';
    const result = wrapLinksWithTracking(html, 'https://app.test', 99);
    const tokenMatch = /\/api\/tracking\/click\/([^"'\s]+)/.exec(result);
    expect(tokenMatch).not.toBeNull();
    // The token should start with the click prefix.
    expect(tokenMatch![1].startsWith('c.')).toBe(true);
  });
});

describe('appendOpenPixel', () => {
  it('inserts the pixel before </body> when a body tag is present', () => {
    const html = '<html><body><p>hi</p></body></html>';
    const result = appendOpenPixel(html, 'https://app.test', 7);
    expect(result).toContain('<img src="https://app.test/api/tracking/open/');
    expect(result.indexOf('<img')).toBeLessThan(result.indexOf('</body>'));
  });

  it('appends the pixel to the end when no body tag exists', () => {
    const html = '<p>hi</p>';
    const result = appendOpenPixel(html, 'https://app.test', 7);
    expect(result.startsWith('<p>hi</p>')).toBe(true);
    expect(result).toContain('<img src="https://app.test/api/tracking/open/');
  });
});

describe('embedTracking', () => {
  it('applies both transforms together', () => {
    const html = '<a href="https://x.com/p">L</a>';
    const result = embedTracking(html, 'https://app.test', 5);
    expect(result).toContain('/api/tracking/click/');
    expect(result).toContain('/api/tracking/open/');
  });
});
