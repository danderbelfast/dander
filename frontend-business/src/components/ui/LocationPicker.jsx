import React, { useState, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

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

function ClickHandler({ onMove }) {
  useMapEvents({ click(e) { onMove(e.latlng.lat, e.latlng.lng); } });
  return null;
}

/**
 * Reverse-geocode a lat/lng to get address parts.
 */
async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();
    if (!data.address) return null;
    const a = data.address;
    return {
      address: [a.house_number, a.road].filter(Boolean).join(' ') || '',
      city: a.city || a.town || a.village || a.suburb || '',
      postcode: a.postcode || '',
      display_name: data.display_name || '',
    };
  } catch {
    return null;
  }
}

/**
 * Extract address parts from a Nominatim search result.
 */
function parseSearchResult(r) {
  const parts = (r.display_name || '').split(',').map(s => s.trim());
  // Nominatim display_name is usually: house, road, suburb, city, county, postcode, country
  // We'll do a reverse geocode for accuracy instead
  return {
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    display_name: r.display_name,
  };
}

/**
 * @param {object} props
 * @param {number|null} props.lat
 * @param {number|null} props.lng
 * @param {(lat: number, lng: number) => void} props.onChange
 * @param {(info: { address, city, postcode }) => void} [props.onAddressFound]
 */
export function LocationPicker({ lat, lng, onChange, onAddressFound }) {
  const [search, setSearch]   = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState('');

  const center = (lat && lng) ? [lat, lng] : [54.5973, -5.9301];

  const handleMove = useCallback(async (newLat, newLng) => {
    onChange(newLat, newLng);
    if (onAddressFound) {
      const info = await reverseGeocode(newLat, newLng);
      if (info) onAddressFound(info);
    }
  }, [onChange, onAddressFound]);

  async function doSearch(e) {
    e.preventDefault();
    if (!search.trim()) return;
    setSearching(true); setSearchErr(''); setResults([]);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=1&q=${encodeURIComponent(search)}`;
      const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      const data = await res.json();
      if (data.length === 0) setSearchErr('No results found. Try adding a postcode or country.');
      else setResults(data);
    } catch {
      setSearchErr('Search failed. Check your connection.');
    } finally { setSearching(false); }
  }

  async function pickResult(r) {
    const newLat = parseFloat(r.lat);
    const newLng = parseFloat(r.lon);
    onChange(newLat, newLng);
    setResults([]);
    setSearch('');

    if (onAddressFound) {
      // Use addressdetails from the search result directly
      const a = r.address || {};
      onAddressFound({
        address: [a.house_number, a.road].filter(Boolean).join(' ') || '',
        city: a.city || a.town || a.village || a.suburb || '',
        postcode: a.postcode || '',
        display_name: r.display_name || '',
      });
    }
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
