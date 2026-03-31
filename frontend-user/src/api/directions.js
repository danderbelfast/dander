'use strict';

const ORS_BASE = 'https://api.openrouteservice.org/v2/directions';

const PROFILES = {
  driving: 'driving-car',
  walking: 'foot-walking',
};

/**
 * Fetch a route from OpenRouteService.
 * Returns { coordinates: [[lat,lng],...], steps: [{instruction, distance, duration, type},...], summary: {distance, duration} }
 */
export async function getRoute({ startLat, startLng, destLat, destLng, mode = 'driving' }) {
  const apiKey = import.meta.env.VITE_ORS_API_KEY;
  if (!apiKey) throw new Error('ORS_KEY_MISSING');

  const profile = PROFILES[mode] ?? PROFILES.driving;

  const res = await fetch(`${ORS_BASE}/${profile}/geojson`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
    },
    body: JSON.stringify({
      coordinates: [
        [startLng, startLat],
        [destLng,  destLat],
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `ORS error ${res.status}`);
  }

  const data = await res.json();
  const feature  = data.features[0];
  const props    = feature.properties;
  const summary  = props.summary;
  const steps    = props.segments[0].steps;

  // ORS geometry is [lng, lat] — flip to [lat, lng] for Leaflet
  const coordinates = feature.geometry.coordinates.map(([lng, lat]) => [lat, lng]);

  return {
    coordinates,
    summary: {
      distance: summary.distance, // metres
      duration: summary.duration, // seconds
    },
    steps: steps.map((s) => ({
      instruction: s.instruction,
      distance:    s.distance,
      duration:    s.duration,
      type:        s.type,
      waypointEnd: s.way_points[1], // index into coordinates array
    })),
  };
}
