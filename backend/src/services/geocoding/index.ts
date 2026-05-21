/**
 * Geocoding service entrypoint — story #765 / task #806.
 *
 * Resolves a free-text address by trying each configured adapter in order.
 * The default chain is `[NominatimAdapter]` which depends on no API keys.
 * To plug in another provider, register it via `registerGeocodingAdapter`
 * before any request resolves coordinates.
 *
 * On total provider failure the service returns `null` so callers can
 * fall through to the plain-address rendering path described in the AC.
 */

import { NominatimAdapter } from './nominatim.js';
import type { GeocodeResult, GeocodingAdapter } from './types.js';

let adapters: GeocodingAdapter[] | null = null;

function defaultAdapters(): GeocodingAdapter[] {
  return [new NominatimAdapter()];
}

export function registerGeocodingAdapter(
  adapter: GeocodingAdapter,
  position: 'prepend' | 'append' = 'prepend',
): void {
  if (adapters === null) adapters = defaultAdapters();
  if (position === 'prepend') adapters.unshift(adapter);
  else adapters.push(adapter);
}

export function resetGeocodingAdapters(replacement?: GeocodingAdapter[]): void {
  adapters = replacement ?? null;
}

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const trimmed = address?.trim?.();
  if (!trimmed) return null;
  const chain = adapters ?? defaultAdapters();
  for (const adapter of chain) {
    try {
      const result = await adapter.geocode(trimmed);
      if (result) return result;
    } catch (err) {
      console.warn(
        `[geocoding] adapter "${adapter.name}" failed:`,
        err instanceof Error ? err.message : err,
      );
      // continue to next adapter
    }
  }
  return null;
}

export type { GeocodeResult, GeocodingAdapter } from './types.js';
