import React, { useEffect, useState } from 'react';
import { getLiveZones } from '../api/business';
import { useToast } from '../context/ToastContext';
import { Spinner } from '../components/ui/Spinner';

const NOISE_TINT = {
  quiet:    { fg: '#1A9E58', bg: '#E6F4EA' },
  moderate: { fg: '#B86E00', bg: '#FFF3E0' },
  busy:     { fg: '#C2185B', bg: '#FCE4EC' },
};

function tintFor(label) {
  return NOISE_TINT[label] || { fg: '#666', bg: '#F2F2F4' };
}

function timeAgo(ts) {
  if (!ts) return '—';
  const secs = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const m = Math.round(secs / 60);
  return `${m}m ago`;
}

export default function Zones() {
  const { toast } = useToast();
  const [zones, setZones]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer;

    async function load(initial) {
      try {
        const d = await getLiveZones();
        if (!cancelled) setZones(d.zones || []);
      } catch {
        if (initial && !cancelled) toast({ message: 'Failed to load zones.', type: 'error' });
      } finally {
        if (initial && !cancelled) setLoading(false);
      }
    }

    load(true);
    timer = setInterval(() => load(false), 30_000);

    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><Spinner /></div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Live Zones</h2>
        <p style={{ color: 'var(--c-text-muted)', fontSize: '0.88rem', marginTop: 4 }}>
          Real-time activity from your Dander Node phone counters. Refreshes every 30 seconds.
        </p>
      </div>

      {zones.length === 0 ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: 56, color: 'var(--c-text-muted)' }}>
            <div style={{ fontSize: '2.4rem', marginBottom: 12, opacity: 0.3 }}>📡</div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--c-text)', margin: '0 0 6px' }}>
              No active zones
            </h3>
            <p style={{ fontSize: '0.9rem', maxWidth: 420, margin: '0 auto' }}>
              Install Dander Node phones at your entrance / display / till and configure each zone
              from the phone&apos;s setup screen.
            </p>
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14,
        }}>
          {zones.map((z) => {
            const tint = tintFor(z.noise_label);
            return (
              <div key={z.zone_name} className="card" style={{ margin: 0 }}>
                <div className="card-body" style={{ padding: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--c-text)' }}>
                        {z.zone_name}
                      </div>
                      {z.zone_type && (
                        <div style={{
                          fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 0.5,
                          color: 'var(--c-text-muted)', fontWeight: 600, marginTop: 2,
                        }}>{z.zone_type}</div>
                      )}
                    </div>
                    <div style={{
                      fontSize: '0.7rem', fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                      color: tint.fg, background: tint.bg,
                    }}>
                      {z.noise_label || '—'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
                    <div>
                      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#00A653' }}>{z.count_in ?? 0}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--c-text-muted)', fontWeight: 600 }}>IN</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#D84315' }}>{z.count_out ?? 0}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--c-text-muted)', fontWeight: 600 }}>OUT</div>
                    </div>
                  </div>

                  <div style={{
                    marginTop: 14, fontSize: '0.78rem', color: 'var(--c-text-muted)',
                    display: 'flex', justifyContent: 'space-between',
                  }}>
                    <span>
                      {z.noise_db != null ? `${Math.round(z.noise_db)} dB` : 'no noise'}
                      {z.bluetooth_count != null ? `  ·  BT ${z.bluetooth_count}` : ''}
                    </span>
                    <span>{timeAgo(z.last_seen)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
