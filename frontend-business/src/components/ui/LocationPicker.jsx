import React, { useState, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

/* Fly the map to a new position when lat/lng change externally */
function MapFlyer({ lat, lng }) {
  const map = useMap();
  const prev = useRef(null);
  const key = `${lat},${lng}`;
  if (prev.current !== key) {
    prev.current = key;
    if (lat && lng) map.flyTo([lat, lng], 17, { duration: 1 });
  }
  return null;
}

/* Click anywhere on the map to drop a pin */
function ClickHandler({ onMove }) {
  useMapEvents({
    click(e) {
      onMove(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export function LocationPicker({ lat, lng, onChange }) {
  const [search, setSearch]   = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState('');

  const center = (lat && lng) ? [lat, lng] : [54.5973, -5.9301];

  const handleMove = useCallback((newLat, newLng) => {
    onChange(newLat, newLng);
  }, [onChange]);

  async function doSearch(e) {
    e.preventDefault();
    if (!search.trim()) return;
    setSearching(true); setSearchErr(''); setResults([]);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(search)}`;
      const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      const data = await res.json();
      if (data.length === 0) setSearchErr('No results found. Try adding a postcode or country.');
      else setResults(data);
    } catch {
      setSearchErr('Search failed. Check your connection.');
    } finally { setSearching(false); }
  }

  function pickResult(r) {
    onChange(parseFloat(r.lat), parseFloat(r.lon));
    setResults([]);
    setSearch('');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Search bar */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="input"
          style={{ flex: 1 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search address, postcode or place…"
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), doSearch(e))}
        />
        <button className="btn btn-secondary" type="button" onClick={doSearch} disabled={searching} style={{ whiteSpace: 'nowrap' }}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </div>

      {searchErr && <p style={{ fontSize: '0.8rem', color: 'var(--c-danger, #dc2626)' }}>{searchErr}</p>}

      {/* Search results dropdown */}
      {results.length > 0 && (
        <ul style={{
          listStyle: 'none', margin: 0, padding: 0,
          border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)',
          background: '#fff', maxHeight: 200, overflowY: 'auto',
        }}>
          {results.map((r) => (
            <li
              key={r.place_id}
              onClick={() => pickResult(r)}
              style={{
                padding: '10px 14px', cursor: 'pointer', fontSize: '0.85rem',
                borderBottom: '1px solid var(--c-border)',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--c-bg-muted)'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
            >
              {r.display_name}
            </li>
          ))}
        </ul>
      )}

      {/* Map */}
      <div style={{ height: 300, borderRadius: 'var(--r-md)', overflow: 'hidden', border: '1px solid var(--c-border)' }}>
        <MapContainer
          center={center}
          zoom={lat && lng ? 17 : 13}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {lat && lng && (
            <Marker
              position={[lat, lng]}
              draggable
              eventHandlers={{
                dragend(e) {
                  const pos = e.target.getLatLng();
                  handleMove(pos.lat, pos.lng);
                },
              }}
            />
          )}
          <ClickHandler onMove={handleMove} />
          {lat && lng && <MapFlyer lat={lat} lng={lng} />}
        </MapContainer>
      </div>

      {lat && lng ? (
        <p className="field-hint">
          Pin at {lat.toFixed(6)}, {lng.toFixed(6)} — drag the pin or click the map to adjust.
        </p>
      ) : (
        <p className="field-hint">Search for your address above or click the map to place a pin.</p>
      )}
    </div>
  );
}
