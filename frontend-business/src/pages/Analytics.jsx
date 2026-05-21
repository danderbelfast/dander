import React, { useEffect, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { getAnalyticsDashboard, getAnalyticsRealtime, getAnalyticsDemographics } from '../api/business';
import { Spinner } from '../components/ui/Spinner';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DEMO_COLORS = { male: '#3B82F6', female: '#EC4899', adults: '#6B7280', children: '#F59E0B', staff: '#8B5CF6' };

function MetricCard({ label, value, sub, accent, icon }) {
  return (
    <div className="stat-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon && <span style={{ fontSize: '1.2rem', opacity: 0.5 }}>{icon}</span>}
        <div className="stat-label">{label}</div>
      </div>
      <div className="stat-value" style={accent ? { color: 'var(--c-primary)' } : {}}>{value ?? '—'}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function StatusBadge({ status }) {
  const colors = { quiet: '#EAB308', normal: '#16A34A', busy: '#E85D26', no_data: '#9CA3AF' };
  const labels = { quiet: 'Quiet', normal: 'Normal', busy: 'Busy', no_data: 'No data' };
  return (
    <span style={{
      background: colors[status] || '#9CA3AF', color: '#fff',
      padding: '3px 10px', borderRadius: 'var(--r-full)',
      fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase',
    }}>
      {labels[status] || status}
    </span>
  );
}

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid var(--c-border)', borderRadius: 8, padding: '8px 14px', fontSize: '0.82rem' }}>
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>{p.name}: {p.value}</div>
      ))}
    </div>
  );
};

export default function Analytics() {
  const [dashboard, setDashboard] = useState(null);
  const [realtime, setRealtime]   = useState(null);
  const [demoData, setDemoData]   = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [period, setPeriod]       = useState('7d');
  const [tab, setTab]             = useState('overview');

  function loadData(days) {
    setLoading(true);
    const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const to = new Date().toISOString().slice(0, 10);

    Promise.all([
      getAnalyticsDashboard({ from, to }),
      getAnalyticsRealtime(),
      getAnalyticsDemographics({ from, to }),
    ])
      .then(([dashData, rtData, dData]) => {
        setDashboard(dashData.analytics);
        setRealtime(rtData.realtime);
        setDemoData(dData.demographics);
      })
      .catch(() => setError('Failed to load analytics.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    loadData(days);
  }, [period]);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
      <Spinner />
    </div>
  );

  if (error) return <div className="form-error-box" style={{ maxWidth: 480 }}>{error}</div>;

  const s = dashboard?.summary || {};
  const rt = realtime || {};
  const hourly = dashboard?.hourly_breakdown || [];
  const daily = dashboard?.daily_breakdown || [];
  const zones = dashboard?.zones || [];
  const demo = dashboard?.demographics || {};
  const peaks = dashboard?.peak_hours || [];
  const alerts = rt.alerts || [];

  const totalVisitors = parseInt(s.total_entries) || 0;
  const convRate = parseFloat(s.conversion_rate) || 0;
  const avgDwell = parseFloat(s.avg_dwell_seconds) || 0;
  const daysTracked = s.days_tracked || 0;

  const insights = [];
  if (daysTracked >= 7 && daily.length >= 7) {
    const thisWeek = daily.slice(-7).reduce((sum, d) => sum + (d.entries || 0), 0);
    const prevWeek = daily.slice(-14, -7).reduce((sum, d) => sum + (d.entries || 0), 0);
    if (prevWeek > 0) {
      const pctChange = ((thisWeek - prevWeek) / prevWeek * 100).toFixed(0);
      insights.push(pctChange >= 0
        ? `You're up ${pctChange}% vs last week`
        : `Footfall is down ${Math.abs(pctChange)}% vs last week`);
    }
  }
  if (avgDwell > 0) {
    insights.push(`Average customer spends ${(avgDwell / 60).toFixed(1)} minutes browsing`);
  }
  if (peaks.length > 0) {
    insights.push(`Busiest hour: ${peaks[0].hour}:00 with ${peaks[0].total_entries} visitors`);
  }
  if (convRate > 0) {
    insights.push(`${convRate}% of passersby convert to visitors`);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Analytics</h2>
          <p style={{ color: 'var(--c-text-muted)', fontSize: '0.88rem', marginTop: 4 }}>
            Footfall, occupancy, and visitor insights.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['7d', '30d', '90d'].map(p => (
            <button key={p} className={`btn btn-sm ${period === p ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setPeriod(p)}>{p}</button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        {[{ key: 'overview', label: 'Overview' }, { key: 'audience', label: 'Audience' }].map(t => (
          <button key={t.key} className={`tab-btn ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <>
      {/* Realtime status */}
      <div className="card" style={{ borderLeft: `4px solid ${rt.status === 'busy' ? '#E85D26' : rt.status === 'quiet' ? '#EAB308' : '#16A34A'}` }}>
        <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--c-text-muted)', marginBottom: 4 }}>RIGHT NOW</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '1.8rem', fontWeight: 800 }}>{rt.current_occupancy || 0}</span>
              <span style={{ color: 'var(--c-text-muted)', fontSize: '0.88rem' }}>people in-store</span>
              <StatusBadge status={rt.status} />
            </div>
            {rt.baseline_expected != null && (
              <div style={{ fontSize: '0.82rem', color: 'var(--c-text-muted)', marginTop: 4 }}>
                Baseline for this hour: {rt.baseline_expected}
              </div>
            )}
          </div>
          {alerts.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {alerts.map((a, i) => (
                <div key={i} style={{ fontSize: '0.78rem', padding: '4px 10px', borderRadius: 'var(--r-sm)', background: 'var(--c-danger-light)', color: 'var(--c-danger)' }}>
                  {a.type === 'device_offline' ? `⚠ ${a.device} offline` : a.type === 'low_footfall' ? '⚠ Low footfall' : a.type}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {insights.map((text, i) => (
            <div key={i} style={{
              background: 'var(--c-bg-muted)', border: '1px solid var(--c-border)',
              borderRadius: 'var(--r-md)', padding: '10px 16px', fontSize: '0.85rem',
              flex: '1 1 200px', color: 'var(--c-text)',
            }}>
              💡 {text}
            </div>
          ))}
        </div>
      )}

      {/* Metric cards */}
      <div className="stats-grid">
        <MetricCard icon="👣" label="Total visitors" value={totalVisitors.toLocaleString()} sub={`${daysTracked} days tracked`} accent />
        <MetricCard icon="📊" label="Avg occupancy" value={s.avg_occupancy || 0} sub={`Peak: ${s.peak_occupancy || 0}`} />
        <MetricCard icon="🔄" label="Conversion rate" value={`${convRate}%`} sub="Passersby → visitors" />
        <MetricCard icon="⏱" label="Avg dwell time" value={avgDwell > 0 ? `${(avgDwell / 60).toFixed(1)}m` : '—'} sub="Time spent in-store" />
      </div>

      {/* Hourly traffic chart */}
      <div className="card">
        <div className="card-header"><span className="card-title">Hourly traffic pattern</span></div>
        <div className="card-body">
          {hourly.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--c-text-muted)', padding: 32, fontSize: '0.88rem' }}>No hourly data available.</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={hourly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" />
                <XAxis dataKey="hour" tickFormatter={h => `${h}:00`} fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="avg_entries" name="Avg entries" stroke="#E85D26" fill="#E85D26" fillOpacity={0.15} strokeWidth={2} />
                <Area type="monotone" dataKey="avg_occupancy" name="Avg occupancy" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.1} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Daily trend */}
      <div className="card">
        <div className="card-header"><span className="card-title">Daily visitors</span></div>
        <div className="card-body">
          {daily.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--c-text-muted)', padding: 32, fontSize: '0.88rem' }}>No daily data available.</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={daily.map(d => ({ ...d, label: new Date(d.day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" />
                <XAxis dataKey="label" fontSize={10} />
                <YAxis fontSize={11} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="entries" name="Visitors" fill="#E85D26" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Zone breakdown */}
        <div className="card">
          <div className="card-header"><span className="card-title">Zones</span></div>
          <div className="card-body">
            {zones.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--c-text-muted)', padding: 24, fontSize: '0.88rem' }}>No zone data.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {zones.map(z => (
                  <div key={z.zone_number} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--c-border)' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{z.zone_name}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--c-text-muted)' }}>{z.zone_type}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{z.entries}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--c-text-muted)' }}>
                        {z.avg_dwell > 0 ? `${(z.avg_dwell / 60).toFixed(1)}m dwell` : `occ: ${z.avg_occupancy}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Demographics */}
        <div className="card">
          <div className="card-header"><span className="card-title">Demographics</span></div>
          <div className="card-body">
            {!demo.male && !demo.female ? (
              <div style={{ textAlign: 'center', color: 'var(--c-text-muted)', padding: 24, fontSize: '0.88rem' }}>No demographic data.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: 'Male', value: demo.male, color: '#3B82F6' },
                  { label: 'Female', value: demo.female, color: '#EC4899' },
                  { label: 'Adults', value: demo.adults, color: '#6B7280' },
                  { label: 'Children', value: demo.children, color: '#F59E0B' },
                  { label: 'Staff', value: demo.staff, color: '#8B5CF6' },
                ].filter(d => d.value > 0).map(d => {
                  const total = (demo.male || 0) + (demo.female || 0);
                  const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
                  return (
                    <div key={d.label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 3 }}>
                        <span>{d.label}</span>
                        <span style={{ fontWeight: 600 }}>{d.value.toLocaleString()} ({pct}%)</span>
                      </div>
                      <div style={{ height: 6, background: 'var(--c-bg-muted)', borderRadius: 3 }}>
                        <div style={{ height: 6, width: `${pct}%`, background: d.color, borderRadius: 3 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      </>}

      {tab === 'audience' && <AudienceTab demoData={demoData} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audience Tab
// ---------------------------------------------------------------------------

function ComparisonCard({ label, yours, network, unit = '%' }) {
  const diff = yours != null && network != null ? parseFloat((yours - network).toFixed(1)) : null;
  return (
    <div style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: '14px 18px', flex: '1 1 220px' }}>
      <div style={{ fontSize: '0.78rem', color: 'var(--c-text-muted)', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: '1.3rem', fontWeight: 700 }}>{yours != null ? `${yours}${unit}` : '—'}</span>
        {diff != null && (
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: diff >= 0 ? '#16A34A' : '#DC2626' }}>
            {diff >= 0 ? '▲' : '▼'} {Math.abs(diff)}{unit} vs network
          </span>
        )}
      </div>
      {network != null && (
        <div style={{ fontSize: '0.75rem', color: 'var(--c-text-dim)', marginTop: 4 }}>
          Network avg: {network}{unit}
        </div>
      )}
    </div>
  );
}

function AudienceTab({ demoData }) {
  if (!demoData) return <div style={{ textAlign: 'center', color: 'var(--c-text-muted)', padding: 48, fontSize: '0.88rem' }}>No audience data available yet. Sensor readings with demographics are needed.</div>;

  const t = demoData.totals || {};
  const gs = demoData.gender_split || {};
  const hourly = demoData.hourly_breakdown || [];
  const net = demoData.network_comparison || {};

  const totalGender = (t.male || 0) + (t.female || 0);
  const totalAge = (t.adults || 0) + (t.children || 0);

  const genderPie = totalGender > 0 ? [
    { name: 'Male', value: t.male || 0, color: DEMO_COLORS.male },
    { name: 'Female', value: t.female || 0, color: DEMO_COLORS.female },
  ] : [];

  const agePie = totalAge > 0 ? [
    { name: 'Adults', value: t.adults || 0, color: DEMO_COLORS.adults },
    { name: 'Children', value: t.children || 0, color: DEMO_COLORS.children },
  ] : [];

  const staffRatio = t.total_entries > 0 ? parseFloat(((t.staff / t.total_entries) * 100).toFixed(1)) : 0;

  return (
    <>
      {/* Comparison cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <ComparisonCard label="Male visitors" yours={gs.male_pct} network={net.network_male_pct} />
        <ComparisonCard label="Female visitors" yours={gs.female_pct} network={net.network_female_pct} />
        <ComparisonCard label="Adult ratio" yours={totalAge > 0 ? parseFloat(((t.adults / totalAge) * 100).toFixed(1)) : null} network={net.network_adult_pct} />
        <ComparisonCard label="Staff ratio" yours={staffRatio} network={null} />
      </div>

      {/* Pie charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card">
          <div className="card-header"><span className="card-title">Gender split</span></div>
          <div className="card-body">
            {genderPie.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--c-text-muted)', padding: 24, fontSize: '0.85rem' }}>No gender data.</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={genderPie} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {genderPie.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => v.toLocaleString()} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Age groups</span></div>
          <div className="card-body">
            {agePie.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--c-text-muted)', padding: 24, fontSize: '0.85rem' }}>No age data.</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={agePie} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {agePie.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => v.toLocaleString()} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Stacked bar: peak hours by demographic */}
      <div className="card">
        <div className="card-header"><span className="card-title">Peak hours by demographic</span></div>
        <div className="card-body">
          {hourly.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--c-text-muted)', padding: 32, fontSize: '0.85rem' }}>No hourly demographic data.</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={hourly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" />
                <XAxis dataKey="hour" tickFormatter={h => `${h}:00`} fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div style={{ background: '#fff', border: '1px solid var(--c-border)', borderRadius: 8, padding: '8px 14px', fontSize: '0.82rem' }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}:00</div>
                      {payload.map((p, i) => <div key={i} style={{ color: p.color }}>{p.name}: {p.value}</div>)}
                    </div>
                  );
                }} />
                <Legend />
                <Bar dataKey="male" name="Male" stackId="a" fill={DEMO_COLORS.male} />
                <Bar dataKey="female" name="Female" stackId="a" fill={DEMO_COLORS.female} />
                <Bar dataKey="children" name="Children" stackId="a" fill={DEMO_COLORS.children} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </>
  );
}
