/**
 * Event location map widget — task #446 / compatibility task #448
 *
 * Covers:
 * - Renders an iframe embed when valid coordinates are provided.
 * - Falls back to placeholder when coordinates are missing or out of range.
 * - Embed URL contains the coordinates and a marker.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import EventLocationMap from '../src/components/events/event-location-map';

describe('EventLocationMap', () => {
  it('renders an iframe with marker when coordinates are valid', () => {
    render(
      <EventLocationMap latitude={37.7749} longitude={-122.4194} locationLabel="SF" />,
    );
    const iframe = screen.getByTestId('event-location-map-iframe') as HTMLIFrameElement;
    expect(iframe).toBeInTheDocument();
    expect(iframe.src).toContain('openstreetmap.org/export/embed.html');
    expect(decodeURIComponent(iframe.src)).toContain('marker=37.7749,-122.4194');
  });

  it('shows placeholder when coordinates are missing', () => {
    render(<EventLocationMap latitude={null} longitude={null} locationLabel="TBD" />);
    expect(screen.getByTestId('event-location-map-placeholder')).toBeInTheDocument();
    expect(screen.queryByTestId('event-location-map-iframe')).not.toBeInTheDocument();
  });

  it('shows placeholder when coordinates are out of range', () => {
    render(<EventLocationMap latitude={91} longitude={0} locationLabel="Invalid" />);
    expect(screen.getByTestId('event-location-map-placeholder')).toBeInTheDocument();
  });

  it('renders the venue label when provided', () => {
    render(<EventLocationMap latitude={1} longitude={2} locationLabel="Plaza" />);
    expect(screen.getByText('Plaza')).toBeInTheDocument();
  });
});
