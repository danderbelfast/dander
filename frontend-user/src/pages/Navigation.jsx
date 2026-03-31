import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { getRoute } from '../api/directions';

// ── Icons ────────────────────────────────────────────────
const destIcon = L.divIcon({
  className: '',
  html: `<div style="width:20px;height:20px;background:#E85D26;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.5);"></div>`,
  iconSize: [20, 20], iconAnchor: [10, 20],
});

const userIcon = L.divIcon({
  className: '',
  html: `<div style="width:16px;height:16px;background:#4A90E2;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 6px rgba(74,144,226,0.25);"></div>`,
  iconSize: [16, 16], iconAnchor: [8, 8],
});

// ── Haversine distance (metres) ──────────────────────────
function distanceBetween([lat1, lng1], [lat2, lng2]) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDist(m) {
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
}

function formatEta(seconds) {
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

// Step type → arrow emoji
function stepArrow(type) {
  const map = { 0: '↰', 1: '↱', 2: '⬅', 3: '➡', 4: '↖', 5: '↗', 6: '↑', 7: '⟳', 8: '⟳', 10: '📍', 11: '🚦' };
  return map[type] ?? '↑';
}

// ── Map controller — follows user position ───────────────
function MapFollow({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.setView(position, map.getZoom(), { animate: true });
  }, [position, map]);
  return null;
}

// ── Voice ────────────────────────────────────────────────
function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

// ── Main component ───────────────────────────────────────
export default function Navigation() {
  const navigate       = useNavigate();
  const { state }      = useLocation();

  const destLat        = state?.destLat;
  const destLng        = state?.destLng;
  const businessName   = state?.businessName ?? 'Destination';
  const mode           = state?.mode ?? 'driving';
  const knownStartLat  = state?.startLat;
  const knownStartLng  = state?.startLng;

  const [route,        setRoute]        = useState(null);   // { coordinates, steps, summary }
  const [userPos,      setUserPos]      = useState(null);   // [lat, lng]
  const [stepIndex,    setStepIndex]    = useState(0);
  const [distLeft,     setDistLeft]     = useState(null);
  const [etaLeft,      setEtaLeft]      = useState(null);
  const [arrived,      setArrived]      = useState(false);
  const [loadError,    setLoadError]    = useState('');
  const [loading,      setLoading]      = useState(true);
  const [muted,        setMuted]        = useState(false);

  const announcedStep  = useRef(-1);
  const watchId        = useRef(null);

  // ── Fetch route once we have position ─────────────────
  const fetchRoute = useCallback(async (startLat, startLng) => {
    try {
      const r = await getRoute({ startLat, startLng, destLat, destLng, mode });
      setRoute(r);
      setDistLeft(r.summary.distance);
      setEtaLeft(r.summary.duration);
      if (!muted) speak(`Starting ${mode} navigation to ${businessName}`);
    } catch (err) {
      if (err.message === 'ORS_KEY_MISSING') {
        setLoadError('OpenRouteService API key not set. Add VITE_ORS_API_KEY to your .env file.');
      } else {
        setLoadError(`Could not load route: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  }, [destLat, destLng, mode, businessName, muted]);

  // ── Start GPS watch ────────────────────────────────────
  useEffect(() => {
    if (!destLat || !destLng) {
      setLoadError('No destination set.');
      setLoading(false);
      return;
    }

    if (!navigator.geolocation) {
      setLoadError('Geolocation is not supported by this browser.');
      setLoading(false);
      return;
    }

    // Use location passed via route state if available, otherwise request fresh
    if (knownStartLat != null && knownStartLng != null) {
      const p = [knownStartLat, knownStartLng];
      setUserPos(p);
      fetchRoute(p[0], p[1]);
    } else {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const p = [pos.coords.latitude, pos.coords.longitude];
          setUserPos(p);
          fetchRoute(p[0], p[1]);
        },
        () => {
          setLoadError('Could not get your location. Please allow location access.');
          setLoading(false);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }

    // Watch for ongoing updates
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => setUserPos([pos.coords.latitude, pos.coords.longitude]),
      () => {},
      { enableHighAccuracy: true, maximumAge: 2000 }
    );

    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
      window.speechSynthesis?.cancel();
    };
  }, [destLat, destLng, fetchRoute, knownStartLat, knownStartLng]);

  // ── Advance steps as user moves ────────────────────────
  useEffect(() => {
    if (!route || !userPos || arrived) return;

    const dest = [destLat, destLng];
    const distToDest = distanceBetween(userPos, dest);

    // Arrival check (within 25m)
    if (distToDest < 25) {
      setArrived(true);
      setDistLeft(0);
      setEtaLeft(0);
      if (!muted) speak(`You have arrived at ${businessName}`);
      return;
    }

    // Recalculate remaining distance along route from current step
    let remaining = 0;
    for (let i = stepIndex; i < route.steps.length; i++) {
      remaining += route.steps[i].distance;
    }
    setDistLeft(remaining);
    setEtaLeft(route.steps.slice(stepIndex).reduce((sum, s) => sum + s.duration, 0));

    // Check if we've passed the current step's endpoint waypoint
    const currentStep = route.steps[stepIndex];
    if (!currentStep) return;
    const waypointCoord = route.coordinates[currentStep.waypointEnd];
    if (!waypointCoord) return;

    const distToWaypoint = distanceBetween(userPos, waypointCoord);

    // Within 30m of the waypoint — advance step and announce next
    if (distToWaypoint < 30 && stepIndex < route.steps.length - 1) {
      const nextStepIndex = stepIndex + 1;
      setStepIndex(nextStepIndex);

      if (!muted && announcedStep.current !== nextStepIndex) {
        announcedStep.current = nextStepIndex;
        const next = route.steps[nextStepIndex];
        speak(next.instruction);
      }
    // Pre-announce: 80m away from waypoint, announce current step once
    } else if (distToWaypoint < 80 && announcedStep.current !== stepIndex) {
      if (!muted) {
        announcedStep.current = stepIndex;
        speak(`In ${formatDist(distToWaypoint)}, ${currentStep.instruction}`);
      }
    }
  }, [userPos, route, stepIndex, arrived, destLat, destLng, businessName, muted]);

  const endNavigation = () => {
    window.speechSynthesis?.cancel();
    navigate(-1);
  };

  const currentStep = route?.steps[stepIndex];
  const nextStep    = route?.steps[stepIndex + 1];

  // ── Render ─────────────────────────────────────────────
  if (loading) return (
    <div className="nav-screen nav-loading">
      <div className="nav-spinner" />
      <div style={{ marginTop: 16, color: 'var(--c-text-muted)' }}>Getting your location…</div>
    </div>
  );

  if (loadError) return (
    <div className="nav-screen nav-loading">
      <div style={{ fontSize: '2rem', marginBottom: 12 }}>⚠️</div>
      <div style={{ color: 'var(--c-text-muted)', textAlign: 'center', padding: '0 32px', lineHeight: 1.5 }}>{loadError}</div>
      <button className="btn btn-ghost" style={{ marginTop: 24 }} onClick={endNavigation}>← Back</button>
    </div>
  );

  return (
    <div className="nav-screen">

      {/* ── Top instruction banner ── */}
      <div className={`nav-instruction ${arrived ? 'nav-instruction--arrived' : ''}`}>
        <div className="nav-arrow">{arrived ? '📍' : stepArrow(currentStep?.type)}</div>
        <div className="nav-instruction-text">
          <div className="nav-instruction-main">
            {arrived ? `Arrived at ${businessName}` : currentStep?.instruction ?? '…'}
          </div>
          {!arrived && nextStep && (
            <div className="nav-instruction-next">Then: {nextStep.instruction}</div>
          )}
        </div>
        <button
          className="nav-mute"
          onClick={() => { setMuted((m) => !m); window.speechSynthesis?.cancel(); }}
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </div>

      {/* ── Map ── */}
      <div className="nav-map">
        {userPos && (
          <MapContainer
            center={userPos}
            zoom={17}
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />
            <MapFollow position={userPos} />

            {/* Route polyline */}
            {route && (
              <Polyline
                positions={route.coordinates}
                pathOptions={{ color: '#4A90E2', weight: 5, opacity: 0.85 }}
              />
            )}

            {/* User position */}
            <Marker position={userPos} icon={userIcon} />

            {/* Destination */}
            <Marker position={[destLat, destLng]} icon={destIcon} />
          </MapContainer>
        )}
      </div>

      {/* ── Bottom panel ── */}
      <div className="nav-bottom">
        <div className="nav-stats">
          <div className="nav-stat">
            <div className="nav-stat-value">{distLeft != null ? formatDist(distLeft) : '—'}</div>
            <div className="nav-stat-label">Distance</div>
          </div>
          <div className="nav-stat">
            <div className="nav-stat-value">{etaLeft != null ? formatEta(etaLeft) : '—'}</div>
            <div className="nav-stat-label">ETA</div>
          </div>
          <div className="nav-stat">
            <div className="nav-stat-value" style={{ textTransform: 'capitalize' }}>{mode}</div>
            <div className="nav-stat-label">Mode</div>
          </div>
        </div>
        <button className="btn btn-danger btn-block" onClick={endNavigation}>
          End navigation
        </button>
      </div>

    </div>
  );
}
