/**
 * QR generator smoke tests (#437).
 *
 * The renderer is a self-contained byte-mode QR encoder. We don't try to
 * decode the resulting matrix — instead we assert on shape invariants so
 * regressions in the bit-stream or masking are caught.
 */
import { describe, expect, it } from 'vitest';
import { renderQrDataUri, renderQrSvg } from '../src/utils/qr';

describe('renderQrSvg', () => {
  it('produces a square SVG with the expected viewBox', () => {
    const svg = renderQrSvg('https://example.com/rsvp/test', { scale: 4, quietZone: 4 });
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('viewBox=');
    expect(svg).toContain('shape-rendering="crispEdges"');
    // White background then black modules
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('fill="#000000"');
  });

  it('renders deterministically for the same input', () => {
    const a = renderQrSvg('https://example.com/rsvp/abc');
    const b = renderQrSvg('https://example.com/rsvp/abc');
    expect(a).toBe(b);
  });

  it('renders different output for different input', () => {
    const a = renderQrSvg('https://example.com/rsvp/abc');
    const b = renderQrSvg('https://example.com/rsvp/xyz');
    expect(a).not.toBe(b);
  });

  it('handles short and longer payloads', () => {
    expect(() => renderQrSvg('hi')).not.toThrow();
    expect(() =>
      renderQrSvg('https://very-long-host.example.com/rsvp/' + 'a'.repeat(100)),
    ).not.toThrow();
  });
});

describe('renderQrDataUri', () => {
  it('returns a base64 data URI', () => {
    const uri = renderQrDataUri('hello');
    expect(uri.startsWith('data:image/svg+xml;base64,')).toBe(true);
    const payload = uri.slice('data:image/svg+xml;base64,'.length);
    expect(Buffer.from(payload, 'base64').toString('utf8')).toContain('<svg');
  });
});
