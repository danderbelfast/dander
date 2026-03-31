import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const RADIUS_OPTIONS = [
  { label: '100m', value: 100 },
  { label: '250m', value: 250 },
  { label: '500m', value: 500 },
  { label: '1 km', value: 1000 },
  { label: '2 km', value: 2000 },
];

function MapUpdater({ center, radius }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, map.getZoom(), { animate: true });
  }, [center, map]);
  return null;
}

export function RadiusMapPicker({ radiusMeters, onChange, lat, lng }) {
  const center = (lat && lng) ? [lat, lng] : [54.5973, -5.9301];

  return (
    <div>
      <div className="radius-options">
        {RADIUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`radius-pill ${radiusMeters === opt.value ? 'active' : ''}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="radius-map">
        <MapContainer
          center={center}
          zoom={14}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapUpdater center={center} radius={radiusMeters} />
          <Circle
            center={center}
            radius={radiusMeters}
            pathOptions={{ color: '#E85D26', fillColor: '#E85D26', fillOpacity: 0.12, weight: 2 }}
          />
        </MapContainer>
      </div>

      <p className="field-hint" style={{ marginTop: 8 }}>
        Your offer will be visible to users within {radiusMeters >= 1000 ? `${radiusMeters / 1000} km` : `${radiusMeters} m`} of your business.
      </p>
    </div>
  );
}

export { RADIUS_OPTIONS };
