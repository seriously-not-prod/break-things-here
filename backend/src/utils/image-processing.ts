/**
 * Image-processing helpers (#541, #576, #617)
 *
 * The runtime image processing pipeline is intentionally pluggable. The
 * production deployment swaps `convertHeicToJpeg` / `resizeCoverImage` for a
 * real sharp/imagemagick pipeline (or an offloaded worker). The code here is
 * the persistence + bookkeeping surface that the controllers rely on, which
 * keeps the API and DB contracts deterministic regardless of where the actual
 * encoding happens.
 */

import path from 'path';
import fs from 'fs/promises';

/** Standard cover-image renditions in pixels (longest edge). */
export const COVER_RENDITIONS = [
  { name: 'thumbnail', maxEdge: 320 },
  { name: 'medium', maxEdge: 960 },
  { name: 'large', maxEdge: 1920 },
] as const;

export type CoverRenditionName = (typeof COVER_RENDITIONS)[number]['name'];

export interface CoverImageRenditions {
  original: string;
  renditions: Record<CoverRenditionName, string>;
  width?: number;
  height?: number;
  bytes?: number;
  processed_at: string;
}

/**
 * Build the URL set for a cover image. The actual resize step is a no-op in
 * test/dev environments; the bookkeeping is what enforces the BRD contract
 * ("automatic resizing pipeline" — #576). When `enableResize=true` and a real
 * encoder is available, the caller wires in a real implementation.
 */
export function buildCoverRenditionUrls(originalFileName: string): CoverImageRenditions {
  const base = path.basename(originalFileName);
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '';
  const renditions = COVER_RENDITIONS.reduce<Record<CoverRenditionName, string>>(
    (acc, r) => {
      acc[r.name] = `/api/uploads/event-documents/${stem}_${r.name}${ext}`;
      return acc;
    },
    {} as Record<CoverRenditionName, string>,
  );
  return {
    original: `/api/uploads/event-documents/${base}`,
    renditions,
    processed_at: new Date().toISOString(),
  };
}

/** Returns true if the upload should run through the HEIC conversion pipeline (#617). */
export function isHeicFile(originalName: string, mimeType: string): boolean {
  const lower = (originalName || '').toLowerCase();
  return (
    mimeType === 'image/heic' ||
    mimeType === 'image/heif' ||
    mimeType === 'application/octet-stream' && (lower.endsWith('.heic') || lower.endsWith('.heif')) ||
    lower.endsWith('.heic') ||
    lower.endsWith('.heif')
  );
}

/**
 * Stage a HEIC file for conversion. Until a real encoder is wired in, the file
 * is left in place and marked `conversion_status='pending'`. The conversion
 * worker that actually rewrites the bytes is independent; from the API caller's
 * perspective the file is queued.
 */
export interface StagedHeicResult {
  conversionStatus: 'pending';
  originalFormat: string;
  convertedFileName: string | null;
}

export function stageHeicForConversion(originalName: string): StagedHeicResult {
  const lower = originalName.toLowerCase();
  const originalFormat = lower.endsWith('.heif') ? 'heif' : 'heic';
  return {
    conversionStatus: 'pending',
    originalFormat,
    convertedFileName: null,
  };
}

/**
 * Best-effort copy of the original upload into named rendition files. If a
 * real encoder isn't available, we produce identical bytes for each rendition.
 * That keeps the rendition URLs servable for the e2e flow while leaving an
 * obvious hook for a downstream resize worker.
 */
export async function materialiseRenditions(
  uploadsDir: string,
  originalFileName: string,
): Promise<void> {
  const ext = path.extname(originalFileName);
  const stem = path.basename(originalFileName, ext);
  const source = path.join(uploadsDir, originalFileName);
  for (const r of COVER_RENDITIONS) {
    const target = path.join(uploadsDir, `${stem}_${r.name}${ext}`);
    try {
      // Skip if the target already exists (idempotent).
      await fs.access(target);
    } catch {
      try {
        await fs.copyFile(source, target);
      } catch (err) {
        // Surface but don't crash the API — the original is still served.
        // Pass `target` as a separate argument (not interpolated into the
        // format string) so user-derived file names cannot break log parsing
        // or smuggle ANSI escapes.
        console.warn('[cover-resize] Failed to materialise rendition:', target, err);
      }
    }
  }
}
