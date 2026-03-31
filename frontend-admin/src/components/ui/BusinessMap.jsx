import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const ACCENT_ICON = new L.DivIcon({
  html: `<div style="
    width:12px;height:12px;border-radius:50%;
    background:#E85D26;border:2px solid #fff;
    box-shadow:0 1px 4px rgba(0,0,0,0.35);
  "></div>`,
  className: '',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
  popupAnchor: [0, -8],
});

function FitBounds({ businesses }) {
  const map = useMap();
  useEffect(() => {
    if (businesses.length > 0) {
      const pts = businesses.filter((b) => b.latitude && b.longitude).map((b) => [b.latitude, b.longitude]);
      if (pts.length > 0) {
        try { map.fitBounds(pts, { padding: [32, 32], maxZoom: 14 }); } catch {}
      }
    }
  }, [businesses, map]);
  return null;
}

export default function BusinessMap({ businesses = [] }) {
  const BELFAST = [54.5973, -5.9301];
  const active = businesses.filter((b) => b.latitude && b.longitude);

  return (
    <div className="admin-map-wrap">
      <MapContainer
        center={BELFAST}
        zoom={13}
        style={{ height: 380, width: '100%', borderRadius: '0 0 var(--r-lg) var(--r-lg)' }}
        zoomControl
        scrollWheelZoom={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
        />
        <FitBounds businesses={active} />
        {active.map((biz) => (
          <Marker key={biz.id} position={[biz.latitude, biz.longitude]} icon={ACCENT_ICON}>
            <Popup className="biz-popup" minWidth={180}>
              <div className="popup-inner">
                <div className="popup-name">{biz.name}</div>
                <div className="popup-cat">{biz.category}</div>
                <div className="popup-stats">
                  <div className="popup-stat">
                    <strong>{biz.activeOffers ?? 0}</strong>
                    offers
                  </div>
                  <div className="popup-stat">
                    <strong>{biz.redemptions ?? 0}</strong>
                    redeemed
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
