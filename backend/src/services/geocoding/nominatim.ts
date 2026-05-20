/**
 * OpenStreetMap Nominatim geocoding adapter — story #765 / task #806.
 *
 * Default provider when no custom geocoding adapter is configured.
 * Honours Nominatim's User-Agent + rate-limit policy: callers should
 * avoid bursty traffic. Errors surface as thrown exceptions so the
 * controller can fall through to the next adapter.
 */

import type { GeocodeResult, GeocodingAdapter } from './types.js';

const DEFAULT_USER_AGENT = 'festival-event-planner (https://example.invalid)';
const DEFAULT_TIMEOUT_MS = 5000;

interface NominatimResponseEntry {
  lat: string;
  lon: string;
  display_name: string;
}

export class NominatimAdapter implements GeocodingAdapter {
  readonly name = 'nominatim';
  private readonly endpoint: string;
  private readonly userAgent: string;
  private readonly timeoutMs: number;

  constructor(options: { endpoint?: string; userAgent?: string; timeoutMs?: number } = {}) {
    this.endpoint = options.endpoint ?? 'https://nominatim.openstreetmap.org/search';
    this.userAgent = options.userAgent ?? process.env.GEOCODING_USER_AGENT ?? DEFAULT_USER_AGENT;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async geocode(address: string): Promise<GeocodeResult | null> {
    const trimmed = address.trim();
    if (!trimmed) return null;

    const url = `${this.endpoint}?format=json&limit=1&q=${encodeURIComponent(trimmed)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Nominatim returned HTTP ${response.status}`);
      }
      const data = (await response.json()) as NominatimResponseEntry[];
      if (!Array.isArray(data) || data.length === 0) return null;
      const top = data[0];
      const lat = Number(top.lat);
      const lng = Number(top.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        latitude: lat,
        longitude: lng,
        display_name: top.display_name ?? trimmed,
        provider: this.name,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
