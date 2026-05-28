import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  getFootfallDevices, getFootfallSummary, getFootfallHourly,
} from '../api/business';
import { useToast } from '../context/ToastContext';
import { Spinner } from '../components/ui/Spinner';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// peakHour is a 0-23 UTC bucket. Format as a readable clock label.
function hourLabel(h) {
  if (h == null) return '—';
  const period = h < 12 ? 'AM' : 'PM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${period}`;
}

export default function Footfall() {
  const { toast } = useToast();
  const [loading, setLoading]   = useState(true);
  const [hasSensor, setHasSensor] = useState(false);
  const [summary, setSummary]   = useState(null);
  const [hourly, setHourly]     = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const devices = await getFootfallDevices();
        if (cancelled) return;
        const connected = (devices.devices || []).length > 0;
        setHasSensor(connected);

        if (connected) {
          const [s, h] = await Promise.all([
            getFootfallSummary(todayISO()),
            getFootfallHourly(todayISO()),
          ]);
          if (cancelled) return;
          setSummary(s.summary);
          setHourly(h.hourly || []);
        }
      } catch {
        if (!cancelled) toast({ message: 'Failed to load footfall data.', type: 'error' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><Spinner /></div>;
  }

  if (!hasSensor) {
    return (
      <div className="card">
        <div className="card-body" style={{ textAlign: 'center', padding: 56, color: 'var(--c-text-muted)' }}>
          <div style={{ fontSize: '2.4rem', marginBottom: 12, opacity: 0.3 }}>📷</div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--c-text)', margin: '0 0 8px' }}>
            No sensor connected
          </h2>
          <p style={{ fontSize: '0.9rem', maxWidth: 420, margin: '0 auto 18px' }}>
            Connect a FootfallCam camera to see live entries, occupancy and hourly footfall here.
            Register your device by its serial number on the My Sensors page.
          </p>
          <Link className="btn btn-primary" to="/sensors">Go to My Sensors</Link>
        </div>
      </div>
    );
  }

  const chartData = hourly.map((row) => ({ ...row, label: hourLabel(row.hour) }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Footfall</h2>
        <p style={{ color: 'var(--c-text-muted)', fontSize: '0.88rem', marginTop: 4 }}>
          Live entries and occupancy from your FootfallCam camera ({summary?.date}).
        </p>
      </div>

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
        <MetricCard label="Entries today" value={summary?.entriesToday ?? 0}
          sub={summary?.vsYesterdayPct == null
            ? 'No comparison yet'
            : `${summary.vsYesterdayPct >= 0 ? '▲' : '▼'} ${Math.abs(summary.vsYesterdayPct)}% vs yesterday`}
          subColor={summary?.vsYesterdayPct == null ? undefined : (summary.vsYesterdayPct >= 0 ? 'var(--c-success, #1a9e58)' : 'var(--c-danger, #d23)')}
        />
        <MetricCard label="Current occupancy" value={summary?.currentOccupancy ?? 0} sub="people inside now" />
        <MetricCard label="Peak hour" value={hourLabel(summary?.peakHour)} sub="busiest hour today" />
        <MetricCard label="Entries this hour" value={summary?.entriesThisHour ?? 0} sub="so far" />
      </div>

      {/* Hourly chart */}
      <div className="card">
        <div className="card-header"><span className="card-title">Hourly footfall</span></div>
        <div className="card-body">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={1} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="entries" name="Entries" fill="#E85D26" radius={[3, 3, 0, 0]} />
              <Bar dataKey="exits"   name="Exits"   fill="#c9c9cf" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, subColor }) {
  return (
    <div className="card" style={{ margin: 0 }}>
      <div className="card-body" style={{ padding: 18 }}>
        <div style={{ fontSize: '0.78rem', color: 'var(--c-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>
          {label}
        </div>
        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--c-text)', marginTop: 6 }}>
          {value}
        </div>
        {sub && (
          <div style={{ fontSize: '0.8rem', marginTop: 4, color: subColor || 'var(--c-text-muted)' }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}
