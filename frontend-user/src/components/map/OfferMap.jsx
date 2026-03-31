import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';

// Fix default Leaflet marker icons in Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom orange pin icon for offers
const offerIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:20px;height:20px;
    background:#E85D26;
    border:3px solid #fff;
    border-radius:50% 50% 50% 0;
    transform:rotate(-45deg);
    box-shadow:0 2px 8px rgba(0,0,0,0.5);
  "></div>`,
  iconSize:   [20, 20],
  iconAnchor: [10, 20],
  popupAnchor:[0, -22],
});

const userIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:14px;height:14px;
    background:#4A90E2;
    border:3px solid #fff;
    border-radius:50%;
    box-shadow:0 0 0 5px rgba(74,144,226,0.2);
  "></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

// Re-centre map when user location changes
function MapController({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, map.getZoom(), { animate: true });
  }, [center, map]);
  return null;
}

export function OfferMap({ offers, userLocation }) {
  const navigate  = useNavigate();
  const center    = userLocation
    ? [userLocation.lat, userLocation.lng]
    : [54.5973, -5.9301]; // Belfast default

  return (
    <MapContainer
      center={center}
      zoom={14}
      style={{ height: '100%', width: '100%' }}
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />

      <MapController center={userLocation ? center : null} />

      {userLocation && (
        <Marker position={center} icon={userIcon}>
          <Popup className="offer-map-popup">You are here</Popup>
        </Marker>
      )}

      {offers.map((offer) =>
        offer.lat && offer.lng ? (
          <Marker
            key={offer.id}
            position={[offer.lat, offer.lng]}
            icon={offerIcon}
          >
            <Popup className="offer-map-popup">
              <div style={{ minWidth: 160 }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--c-text-muted)', marginBottom: 3 }}>
                  {offer.business_name}
                </div>
                <div style={{ fontFamily: 'var(--f-head)', fontWeight: 700, fontSize: '0.9rem', marginBottom: 8 }}>
                  {offer.title}
                </div>
                <button
                  onClick={() => navigate(`/offer/${offer.id}`)}
                  style={{
                    background: 'var(--c-primary)', color: '#fff',
                    border: 'none', borderRadius: '999px',
                    padding: '6px 14px', fontSize: '0.78rem', fontWeight: 600,
                    cursor: 'pointer', width: '100%',
                  }}
                >
                  View offer
                </button>
              </div>
            </Popup>
          </Marker>
        ) : null
      )}
    </MapContainer>
  );
}
