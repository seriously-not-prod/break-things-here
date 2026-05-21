/**
 * Event Location Map — story #414, task #446
 *
 * Renders a small read-only map for an event's coordinates. Uses the
 * OpenStreetMap embed iframe so we add no JS bundle dependency and no
 * provider key. When coordinates are missing or invalid, falls back to a
 * neutral placeholder so the surrounding layout stays stable.
 *
 * Implementation notes:
 * - The iframe URL fails closed (placeholder shown) when window.fetch to OSM
 *   is unavailable — we don't probe the iframe load.
 * - We use a small bbox margin around the marker to render a useful zoom
 *   level even at low decimal precision.
 */

import { Box, Link as MuiLink, Paper, Typography } from '@mui/material';
import LocationOnRounded from '@mui/icons-material/LocationOnRounded';

export interface EventLocationMapProps {
  latitude?: number | null;
  longitude?: number | null;
  /** Plain-text venue name shown above the map */
  locationLabel?: string | null;
  /** Approximate viewport size in CSS units */
  height?: number | string;
}

function isFiniteCoord(value: unknown, min: number, max: number): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  return value >= min && value <= max;
}

function buildEmbedUrl(lat: number, lng: number): string {
  // ~0.005 degrees is roughly a few hundred metres — gives a usable zoom level.
  const span = 0.005;
  const bbox = [lng - span, lat - span, lng + span, lat + span].join(',');
  const params = new URLSearchParams({
    bbox,
    layer: 'mapnik',
    marker: `${lat},${lng}`,
  });
  return `https://www.openstreetmap.org/export/embed.html?${params.toString()}`;
}

function buildLargeMapUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`;
}

export function EventLocationMap({
  latitude,
  longitude,
  locationLabel,
  height = 240,
}: EventLocationMapProps): JSX.Element {
  const hasCoords = isFiniteCoord(latitude, -90, 90) && isFiniteCoord(longitude, -180, 180);

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
        <LocationOnRounded fontSize="small" color="action" />
        <Typography variant="subtitle2" fontWeight={600}>
          Location
        </Typography>
      </Box>
      {locationLabel && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {locationLabel}
        </Typography>
      )}
      {hasCoords ? (
        <>
          <Box
            sx={{
              width: '100%',
              height,
              borderRadius: 1,
              overflow: 'hidden',
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <iframe
              title="Event location map"
              data-testid="event-location-map-iframe"
              src={buildEmbedUrl(latitude as number, longitude as number)}
              style={{ width: '100%', height: '100%', border: 0 }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
            <MuiLink
              href={buildLargeMapUrl(latitude as number, longitude as number)}
              target="_blank"
              rel="noopener noreferrer"
              underline="hover"
            >
              Open in OpenStreetMap
            </MuiLink>
            {' · '}
            {(latitude as number).toFixed(5)}, {(longitude as number).toFixed(5)}
          </Typography>
        </>
      ) : (
        <Box
          data-testid="event-location-map-placeholder"
          sx={{
            height,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px dashed',
            borderColor: 'divider',
            borderRadius: 1,
            bgcolor: 'action.hover',
            textAlign: 'center',
            p: 2,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Add coordinates to display this event on a map.
          </Typography>
        </Box>
      )}
    </Paper>
  );
}

export default EventLocationMap;
