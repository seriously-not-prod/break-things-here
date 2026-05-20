/**
 * Pluggable geocoding adapter contracts — story #765 / task #806.
 *
 * Each adapter resolves a free-text address to coordinates (or returns
 * null when no match is found). Adapters must throw on transport
 * failures so the controller can fall back to the configured chain.
 */

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  /** Provider-supplied normalised address; useful for displaying back to the user. */
  display_name: string;
  /** Adapter that produced the result. */
  provider: string;
}

export interface GeocodingAdapter {
  readonly name: string;
  /** Returns the first result, or null when no match is found. */
  geocode(_address: string): Promise<GeocodeResult | null>;
}
