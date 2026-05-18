/**
 * Helpers for embedding tracking artefacts into outgoing email bodies (#465, #466).
 *
 * - `wrapLinksWithTracking(html, baseUrl, communicationLogId)` rewrites every
 *   absolute http(s) `href` so that clicks travel through the redirect endpoint
 *   first.
 * - `appendOpenPixel(html, baseUrl, communicationLogId)` appends a 1×1 pixel
 *   `<img>` whose request will land on the open-tracking endpoint.
 *
 * Both helpers are pure string transforms and do not touch the database. They
 * are intentionally tolerant of plain-text bodies — when no `</body>` tag is
 * present the pixel is appended to the end.
 */

import { buildClickToken, buildOpenToken } from './tracking-token.js';

/** Rewrite every `href="https?://..."` to traverse the click-tracking endpoint. */
export function wrapLinksWithTracking(
  html: string,
  baseUrl: string,
  communicationLogId: number,
): string {
  // Match `href="..."` or `href='...'` containing an http(s) target. Skip
  // anything else so that mailto:, tel:, anchors, and unsubscribe links are
  // untouched.
  return html.replace(
    /href\s*=\s*(['"])(https?:\/\/[^'"\s>]+)\1/gi,
    (_match, quote: string, url: string) => {
      const token = buildClickToken(communicationLogId, url);
      return `href=${quote}${baseUrl}/api/tracking/click/${token}${quote}`;
    },
  );
}

/** Append a 1×1 open-tracking pixel to an HTML body. */
export function appendOpenPixel(
  html: string,
  baseUrl: string,
  communicationLogId: number,
): string {
  const token = buildOpenToken(communicationLogId);
  const pixel =
    `<img src="${baseUrl}/api/tracking/open/${token}" width="1" height="1" ` +
    `alt="" style="display:none" />`;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${pixel}</body>`);
  }
  return `${html}${pixel}`;
}

/**
 * Apply both transforms in one call. Use this from the mail-send code path.
 *
 * @param html               - Raw email body (HTML or plain-ish HTML).
 * @param baseUrl            - Externally reachable origin (e.g. `https://app.example.com`).
 * @param communicationLogId - Row id from `communication_log` for this delivery.
 */
export function embedTracking(
  html: string,
  baseUrl: string,
  communicationLogId: number,
): string {
  return appendOpenPixel(wrapLinksWithTracking(html, baseUrl, communicationLogId), baseUrl, communicationLogId);
}
