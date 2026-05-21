/**
 * BRD v2 — image processing helpers (#541, #576, #617).
 */

import { describe, expect, it } from 'vitest';
import {
  COVER_RENDITIONS,
  buildCoverRenditionUrls,
  isHeicFile,
  stageHeicForConversion,
} from '../src/utils/image-processing.js';

describe('cover renditions', () => {
  it('produces a rendition URL for every named size', () => {
    const result = buildCoverRenditionUrls('document-1234.jpg');
    expect(result.original).toBe('/api/uploads/event-documents/document-1234.jpg');
    for (const r of COVER_RENDITIONS) {
      expect(result.renditions[r.name]).toBe(
        `/api/uploads/event-documents/document-1234_${r.name}.jpg`,
      );
    }
    expect(typeof result.processed_at).toBe('string');
  });

  it('strips any directory components from input names', () => {
    const result = buildCoverRenditionUrls('../../malicious.png');
    expect(result.original).toBe('/api/uploads/event-documents/malicious.png');
  });
});

describe('isHeicFile', () => {
  it('detects HEIC by mime type', () => {
    expect(isHeicFile('photo.bin', 'image/heic')).toBe(true);
    expect(isHeicFile('photo.bin', 'image/heif')).toBe(true);
  });
  it('detects HEIC by extension when mime is octet-stream', () => {
    expect(isHeicFile('photo.heic', 'application/octet-stream')).toBe(true);
    expect(isHeicFile('photo.heif', 'application/octet-stream')).toBe(true);
  });
  it('detects HEIC by extension regardless of mime', () => {
    expect(isHeicFile('vacation.HEIC', 'application/octet-stream')).toBe(true);
  });
  it('returns false for jpeg/png/webp', () => {
    expect(isHeicFile('a.jpg', 'image/jpeg')).toBe(false);
    expect(isHeicFile('a.png', 'image/png')).toBe(false);
    expect(isHeicFile('a.webp', 'image/webp')).toBe(false);
  });
});

describe('stageHeicForConversion', () => {
  it('marks a heic file as pending and records the original format', () => {
    const r = stageHeicForConversion('summer.HEIC');
    expect(r.conversionStatus).toBe('pending');
    expect(r.originalFormat).toBe('heic');
    expect(r.convertedFileName).toBeNull();
  });
  it('preserves heif extension', () => {
    const r = stageHeicForConversion('skyline.heif');
    expect(r.originalFormat).toBe('heif');
  });
});
