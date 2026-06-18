import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { getAnalyticsDashboard, getAnalyticsRealtime, getAnalyticsDemographics, getAnalyticsZones, getAnnotations, createAnnotation, deleteAnnotation, generateAnalyticsPlaceholder } from '../api/business';
import { Spinner } from '../components/ui/Spinner';
import { useAuth } from '../context/AuthContext';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DEMO_COLORS = { male: '#3B82F6', female: '#EC4899', adults: '#6B7280', children: '#F59E0B', staff: '#8B5CF6' };

const ANNOTATION_CATEGORIES = [
  { value: 'product_launch', label: 'Product Launch', emoji: '🚀', color: '#3B82F6' },
  { value: 'marketing', label: 'Marketing', emoji: '📢', color: '#16A34A' },
  { value: 'store_change', label: 'Store Change', emoji: '🏪', color: '#E85D26' },
  { value: 'external_event', label: 'External Event', emoji: '🌍', color: '#6B7280' },
  { value: 'offer', label: 'Offer', emoji: '🎁', color: '#8B5CF6' },
];

function getCategoryBadge(cat) {
  const c = ANNOTATION_CATEGORIES.find(a => a.value === cat) || ANNOTATION_CATEGORIES[2];
  return { ...c };
}

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

// ---------------------------------------------------------------------------
// Pro gating — Demographics, Zone Performance, and Dwell Time are Pro-only.
// Lower tiers see these sections rendered with sample data, blurred behind an
// "Upgrade to Pro" overlay. Real data is withheld server-side.
// ---------------------------------------------------------------------------

// Sample data shown (blurred) behind the upgrade overlay for non-Pro plans.
const SAMPLE_DEMO = { male: 1840, female: 2210, adults: 3360, children: 690, staff: 210 };

const SAMPLE_ZONES = [
  { zone_number: 1, zone_name: 'Entrance',      zone_type: 'counting', entries: 4120, avg_occupancy: 12.4, avg_dwell: 145 },
  { zone_number: 2, zone_name: 'Main Aisle',    zone_type: 'counting', entries: 3380, avg_occupancy: 9.1,  avg_dwell: 260 },
  { zone_number: 3, zone_name: 'Checkout',      zone_type: 'counting', entries: 2740, avg_occupancy: 6.7,  avg_dwell: 95  },
  { zone_number: 4, zone_name: 'Promo Display', zone_type: 'counting', entries: 1980, avg_occupancy: 4.2,  avg_dwell: 180 },
];

const SAMPLE_DWELL_SECONDS = 252; // → "4.2m"

const SAMPLE_DEMODATA = {
  totals: { male: 1840, female: 2210, adults: 3360, children: 690, staff: 210, total_entries: 4260 },
  gender_split: { male_pct: 45.4, female_pct: 54.6 },
  hourly_breakdown: [9, 10, 11, 12, 13, 14, 15, 16, 17].map((h, i) => ({
    hour: h, male: 60 + i * 14, female: 80 + i * 16, adults: 110 + i * 22, children: 20 + i * 5,
  })),
  network_comparison: { network_male_pct: 48.2, network_female_pct: 51.8, network_adult_pct: 79.5, businesses_sampled: 34 },
};

const SAMPLE_ZONEDATA = {
  zones: SAMPLE_ZONES.map((z, i) => ({
    zone_number: z.zone_number, zone_name: z.zone_name, zone_type: z.zone_type,
    visitors: z.entries, exits: Math.round(z.entries * 0.96),
    avg_occupancy: z.avg_occupancy, avg_dwell_seconds: z.avg_dwell,
    peak_occupancy: Math.round(z.avg_occupancy * 2.4), passersby: Math.round(z.entries * 1.7),
    popularity_rank: i + 1,
  })),
  journey: { entry: 4120, browsed_2min: 2680, approached_till: 1648, redeemed: 540, bounced: 720, bounce_rate: 17.5 },
  period: { from: '', to: '' },
};

/**
 * Wraps a metric section. When `locked`, renders the children (sample data)
 * blurred and non-interactive behind an "Upgrade to Pro" overlay.
 * `compact` is for small cards — a lock badge only, no description/button.
 */
function ProGate({ locked, label, compact = false, children }) {
  if (!locked) return children;

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--r-lg)' }}>
      <div aria-hidden="true" style={{
        filter: 'blur(5px) grayscale(0.7)', opacity: 0.55,
        pointerEvents: 'none', userSelect: 'none',
      }}>
        {children}
      </div>

      {compact ? (
        <Link to="/settings" title={`${label} — upgrade to Pro`} style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 4, textDecoration: 'none',
          background: 'rgba(255,255,255,0.45)',
        }}>
          <span style={{ fontSize: '1.3rem' }}>🔒</span>
          <span style={{
            fontSize: '0.68rem', fontWeight: 700, color: 'var(--c-primary)',
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>Pro</span>
        </Link>
      ) : (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 8, textAlign: 'center',
          padding: 24, background: 'rgba(255,255,255,0.5)',
        }}>
          <span style={{ fontSize: '2rem' }}>🔒</span>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>{label} is a Pro feature</div>
          <div style={{ fontSize: '0.84rem', color: 'var(--c-text-muted)', maxWidth: 320 }}>
            Upgrade to Pro to unlock {label.toLowerCase()} and see what your customers are really doing.
          </div>
          <Link to="/settings" className="btn btn-primary btn-sm" style={{ marginTop: 6 }}>
            Upgrade to Pro
          </Link>
        </div>
      )}
    </div>
  );
}

export default function Analytics() {
  const { business } = useAuth();
  const isPro = business?.subscription_tier === 'pro';

  const [dashboard, setDashboard] = useState(null);
  const [realtime, setRealtime]   = useState(null);
  const [demoData, setDemoData]   = useState(null);
  const [zoneData, setZoneData]   = useState(null);
  const [annotations, setAnnotations] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [period, setPeriod]       = useState('7d');
  const [tab, setTab]             = useState('overview');
  const [annotModal, setAnnotModal] = useState(null);

  function loadData(days) {
    setLoading(true);
    const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const to = new Date().toISOString().slice(0, 10);

    const safe = (p) => p.catch(() => null);
    Promise.all([
      safe(getAnalyticsDashboard({ from, to })),
      safe(getAnalyticsRealtime()),
      safe(getAnalyticsDemographics({ from, to })),
      safe(getAnalyticsZones({ from, to })),
      safe(getAnnotations({ from, to })),
    ])
      .then(([dashData, rtData, dData, zData, aData]) => {
        if (dashData) setDashboard(dashData.analytics);
        if (rtData) setRealtime(rtData.realtime);
        if (dData) setDemoData(dData.demographics);
        if (zData) setZoneData(zData);
        if (aData) setAnnotations(aData.annotations || []);
      })
      .catch(() => setError('Failed to load analytics.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    loadData(days);
  }, [period]);

  const generatePlaceholder = async () => {
    setLoading(true);
    try {
      await generateAnalyticsPlaceholder();
      window.location.reload();
    } catch (error) {
      console.error('Failed to generate placeholder data:', error.response?.status, error.response?.data || error.message);
    } finally {
      setLoading(false);
    }
  };

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

  // Pro-gated views: real data when Pro, blurred sample data otherwise.
  const zonesView = isPro ? zones : SAMPLE_ZONES;
  const demoView  = isPro ? demo  : SAMPLE_DEMO;

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
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {['7d', '30d', '90d'].map(p => (
            <button key={p} className={`btn btn-sm ${period === p ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setPeriod(p)}>{p}</button>
          ))}
          <button className="btn btn-outline btn-sm dev-button" onClick={generatePlaceholder} disabled={loading} style={{ marginLeft: 8 }}>
            Generate Test Data
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        {[{ key: 'overview', label: 'Overview' }, { key: 'audience', label: 'Audience' }, { key: 'behaviour', label: 'Behaviour' }, { key: 'realtime', label: 'Real-Time' }].map(t => (
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
        <ProGate locked={!isPro} label="Dwell Time" compact>
          <MetricCard icon="⏱" label="Avg dwell time"
            value={isPro
              ? (avgDwell > 0 ? `${(avgDwell / 60).toFixed(1)}m` : '—')
              : `${(SAMPLE_DWELL_SECONDS / 60).toFixed(1)}m`}
            sub="Time spent in-store" />
        </ProGate>
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

      {/* Daily trend with annotations */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Daily visitors</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setAnnotModal({ event_date: new Date().toISOString().slice(0, 10), title: '', description: '', category: 'store_change' })}>+ Add event</button>
        </div>
        <div className="card-body">
          {daily.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--c-text-muted)', padding: 32, fontSize: '0.88rem' }}>No daily data available.</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={daily.map(d => {
                const dateStr = typeof d.day === 'string' ? d.day.slice(0, 10) : new Date(d.day).toISOString().slice(0, 10);
                const ann = annotations.filter(a => a.event_date?.slice?.(0, 10) === dateStr);
                return { ...d, label: new Date(d.day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), annotation: ann.length > 0 ? ann : null, dateStr };
              })} onClick={(e) => { if (e?.activePayload?.[0]?.payload?.dateStr) setAnnotModal({ event_date: e.activePayload[0].payload.dateStr, title: '', description: '', category: 'store_change' }); }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" />
                <XAxis dataKey="label" fontSize={10} />
                <YAxis fontSize={11} />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div style={{ background: '#fff', border: '1px solid var(--c-border)', borderRadius: 8, padding: '8px 14px', fontSize: '0.82rem', maxWidth: 220 }}>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>{d.label}</div>
                      <div style={{ color: '#E85D26' }}>{d.entries} visitors</div>
                      {d.annotation && d.annotation.map((a, i) => {
                        const badge = getCategoryBadge(a.category);
                        return <div key={i} style={{ marginTop: 4, fontSize: '0.75rem' }}><span style={{ background: badge.color, color: '#fff', padding: '1px 5px', borderRadius: 3, fontSize: '0.68rem' }}>{badge.emoji} {badge.label}</span> {a.title}</div>;
                      })}
                    </div>
                  );
                }} />
                <Bar dataKey="entries" name="Visitors" fill="#E85D26" radius={[4, 4, 0, 0]}
                  shape={(props) => {
                    const { x, y, width, height, payload } = props;
                    return (
                      <g>
                        <rect x={x} y={y} width={width} height={height} fill="#E85D26" rx={4} />
                        {payload.annotation && <circle cx={x + width / 2} cy={y - 6} r={4} fill={getCategoryBadge(payload.annotation[0].category).color} stroke="#fff" strokeWidth={1.5} />}
                      </g>
                    );
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Recent events sidebar */}
      {annotations.length > 0 && (
        <div className="card">
          <div className="card-header"><span className="card-title">Recent events</span></div>
          <div className="card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {annotations.slice(0, 5).map(a => {
                const badge = getCategoryBadge(a.category);
                return (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--c-border)' }}>
                    <span style={{ background: badge.color, color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: '0.7rem', whiteSpace: 'nowrap', marginTop: 2 }}>
                      {badge.emoji} {badge.label}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{a.title}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--c-text-muted)' }}>
                        {new Date(a.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.72rem', color: 'var(--c-danger)', padding: '2px 6px' }}
                      onClick={() => { deleteAnnotation(a.id).then(() => { setAnnotations(prev => prev.filter(x => x.id !== a.id)); }).catch(() => {}); }}>
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Annotation modal */}
      {annotModal && <AnnotationModal initial={annotModal} onClose={() => setAnnotModal(null)} onSave={(ann) => { setAnnotations(prev => [ann, ...prev]); setAnnotModal(null); }} businessId={null} />}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Zone breakdown */}
        <ProGate locked={!isPro} label="Zone Performance">
        <div className="card">
          <div className="card-header"><span className="card-title">Zones</span></div>
          <div className="card-body">
            {zonesView.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--c-text-muted)', padding: 24, fontSize: '0.88rem' }}>No zone data.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {zonesView.map(z => (
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
        </ProGate>

        {/* Demographics */}
        <ProGate locked={!isPro} label="Demographics">
        <div className="card">
          <div className="card-header"><span className="card-title">Demographics</span></div>
          <div className="card-body">
            {!demoView.male && !demoView.female ? (
              <div style={{ textAlign: 'center', color: 'var(--c-text-muted)', padding: 24, fontSize: '0.88rem' }}>No demographic data.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: 'Male', value: demoView.male, color: '#3B82F6' },
                  { label: 'Female', value: demoView.female, color: '#EC4899' },
                  { label: 'Adults', value: demoView.adults, color: '#6B7280' },
                  { label: 'Children', value: demoView.children, color: '#F59E0B' },
                  { label: 'Staff', value: demoView.staff, color: '#8B5CF6' },
                ].filter(d => d.value > 0).map(d => {
                  const total = (demoView.male || 0) + (demoView.female || 0);
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
        </ProGate>
      </div>
      </>}

      {tab === 'audience' && (
        <ProGate locked={!isPro} label="Demographics">
          <AudienceTab demoData={isPro ? demoData : SAMPLE_DEMODATA} />
        </ProGate>
      )}
      {tab === 'behaviour' && (
        <ProGate locked={!isPro} label="Zone Performance">
          <BehaviourTab zoneData={isPro ? zoneData : SAMPLE_ZONEDATA} />
        </ProGate>
      )}
      {tab === 'realtime' && <RealtimeTab />}
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

// ---------------------------------------------------------------------------
// Behaviour Tab
// ---------------------------------------------------------------------------

const ZONE_COLORS = ['#E85D26', '#3B82F6', '#16A34A', '#8B5CF6', '#F59E0B', '#EC4899'];

function HeatBox({ zone, maxVisitors }) {
  const intensity = maxVisitors > 0 ? Math.min(1, zone.visitors / maxVisitors) : 0;
  const bg = `rgba(232, 93, 38, ${0.1 + intensity * 0.7})`;
  const [hover, setHover] = useState(false);

  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: bg, borderRadius: 'var(--r-md)', padding: '20px 16px',
        position: 'relative', cursor: 'default', border: '1px solid var(--c-border)',
        transition: 'transform 0.15s', transform: hover ? 'scale(1.03)' : 'scale(1)',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 4, color: intensity > 0.5 ? '#fff' : 'var(--c-text)' }}>
        {zone.zone_name}
      </div>
      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: intensity > 0.5 ? '#fff' : 'var(--c-primary)' }}>
        {zone.visitors.toLocaleString()}
      </div>
      <div style={{ fontSize: '0.75rem', color: intensity > 0.5 ? 'rgba(255,255,255,0.8)' : 'var(--c-text-muted)', marginTop: 2 }}>
        visitors
      </div>
      {hover && (
        <div style={{
          position: 'absolute', top: -8, right: -8, background: '#1A1A19', color: '#fff',
          padding: '8px 12px', borderRadius: 'var(--r-md)', fontSize: '0.78rem', zIndex: 10,
          boxShadow: 'var(--shadow-lg)', whiteSpace: 'nowrap',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{zone.zone_name}</div>
          <div>Visitors: {zone.visitors.toLocaleString()}</div>
          <div>Avg dwell: {zone.avg_dwell_seconds > 0 ? `${(zone.avg_dwell_seconds / 60).toFixed(1)}m` : '—'}</div>
          <div>Rank: #{zone.popularity_rank}</div>
        </div>
      )}
    </div>
  );
}

function FunnelBar({ label, value, total, pct, prevPct, color }) {
  const width = total > 0 ? Math.max(8, (value / total) * 100) : 0;
  const dropoff = prevPct != null ? parseFloat((prevPct - pct).toFixed(1)) : null;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 3 }}>
        <span style={{ fontWeight: 500 }}>{label}</span>
        <span>
          <strong>{value.toLocaleString()}</strong> ({pct}%)
          {dropoff != null && dropoff > 0 && (
            <span style={{ color: '#DC2626', fontSize: '0.72rem', marginLeft: 6 }}>-{dropoff}% drop</span>
          )}
        </span>
      </div>
      <div style={{ height: 24, background: 'var(--c-bg-muted)', borderRadius: 4 }}>
        <div style={{ height: 24, width: `${width}%`, background: color, borderRadius: 4, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

function BehaviourTab({ zoneData }) {
  const [sortCol, setSortCol] = useState('visitors');
  const [sortDir, setSortDir] = useState('desc');

  if (!zoneData) return <div style={{ textAlign: 'center', color: 'var(--c-text-muted)', padding: 48, fontSize: '0.88rem' }}>No behaviour data available yet.</div>;

  const zones = zoneData.zones || [];
  const journey = zoneData.journey || {};
  const maxVisitors = Math.max(...zones.map(z => z.visitors), 1);
  const totalEntries = journey.entry || 1;

  const funnelSteps = [
    { label: 'Entered', value: journey.entry || 0, color: '#E85D26' },
    { label: 'Browsed >2 min', value: journey.browsed_2min || 0, color: '#F59E0B' },
    { label: 'Approached till', value: journey.approached_till || 0, color: '#3B82F6' },
    { label: 'Redeemed offer', value: journey.redeemed || 0, color: '#16A34A' },
  ].map((s, i, arr) => ({
    ...s,
    pct: parseFloat(((s.value / totalEntries) * 100).toFixed(1)),
    prevPct: i > 0 ? parseFloat(((arr[i - 1].value / totalEntries) * 100).toFixed(1)) : null,
  }));

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  }

  const sorted = [...zones].sort((a, b) => {
    const av = a[sortCol] ?? 0;
    const bv = b[sortCol] ?? 0;
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const topZone = zones.reduce((best, z) => z.visitors > (best?.visitors || 0) ? z : best, null);

  return (
    <>
      {/* Heat map */}
      <div className="card">
        <div className="card-header"><span className="card-title">Zone heat map</span></div>
        <div className="card-body">
          {zones.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--c-text-muted)', padding: 32, fontSize: '0.85rem' }}>No zone data.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              {zones.map(z => <HeatBox key={z.zone_number} zone={z} maxVisitors={maxVisitors} />)}
            </div>
          )}
        </div>
      </div>

      {/* Funnel + bounce rate */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
        <div className="card">
          <div className="card-header"><span className="card-title">Customer journey funnel</span></div>
          <div className="card-body">
            {funnelSteps.map((s, i) => (
              <FunnelBar key={i} {...s} total={totalEntries} />
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><span className="card-title">Bounce rate</span></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <div style={{ fontSize: '2.4rem', fontWeight: 800, color: journey.bounce_rate > 30 ? '#DC2626' : journey.bounce_rate > 15 ? '#F59E0B' : '#16A34A' }}>
              {journey.bounce_rate || 0}%
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--c-text-muted)', textAlign: 'center' }}>
              Entered but left within 30 seconds
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--c-text-dim)' }}>
              {(journey.bounced || 0).toLocaleString()} of {(journey.entry || 0).toLocaleString()} visitors
            </div>
          </div>
        </div>
      </div>

      {/* Zone performance table */}
      <div className="card">
        <div className="card-header"><span className="card-title">Zone performance</span></div>
        <div className="card-body">
          {zones.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--c-text-muted)', padding: 32, fontSize: '0.85rem' }}>No zone data.</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    {[
                      { key: 'zone_name', label: 'Zone Name' },
                      { key: 'visitors', label: 'Visitors' },
                      { key: 'avg_dwell_seconds', label: 'Avg Dwell Time' },
                      { key: 'popularity_rank', label: 'Rank' },
                    ].map(col => (
                      <th key={col.key} onClick={() => toggleSort(col.key)}
                        style={{ cursor: 'pointer', userSelect: 'none' }}>
                        {col.label} {sortCol === col.key ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(z => (
                    <tr key={z.zone_number} style={topZone && z.zone_number === topZone.zone_number ? { background: 'rgba(232,93,38,0.06)' } : {}}>
                      <td style={{ fontWeight: 600 }}>
                        {z.zone_name}
                        {topZone && z.zone_number === topZone.zone_number && (
                          <span style={{ marginLeft: 8, fontSize: '0.7rem', background: 'var(--c-primary)', color: '#fff', padding: '1px 6px', borderRadius: 'var(--r-full)' }}>TOP</span>
                        )}
                      </td>
                      <td>{z.visitors.toLocaleString()}</td>
                      <td>{z.avg_dwell_seconds > 0 ? `${(z.avg_dwell_seconds / 60).toFixed(1)} min` : '—'}</td>
                      <td>#{z.popularity_rank}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Real-Time Tab
// ---------------------------------------------------------------------------

function RealtimeTab() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  function fetchRealtime() {
    getAnalyticsRealtime()
      .then(d => { setData(d.realtime); setLastUpdate(new Date()); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchRealtime();
    const interval = setInterval(fetchRealtime, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>;
  if (!data) return <div style={{ textAlign: 'center', color: 'var(--c-text-muted)', padding: 48, fontSize: '0.88rem' }}>Unable to load real-time data.</div>;

  const rt = data;
  const recentZones = rt.recent_zones || [];
  const devices = rt.devices || [];
  const alerts = rt.alerts || [];
  const todayActivity = rt.today_activity || [];

  const recentEntries = recentZones.reduce((s, z) => s + (z.entries || 0), 0);
  const recentExits = recentZones.reduce((s, z) => s + (z.exits || 0), 0);

  // Node uploads (zone_name) and kilo uploads (zone_number) take different
  // identity keys. Prefer zone_name when present (node-only setups) and
  // fall back to zone_number for kilo. Latest reading per zone wins.
  const zoneOccupancy = {};
  for (const z of recentZones) {
    const key = z.zone_name || `kilo-${z.zone_number}`;
    if (!zoneOccupancy[key] || new Date(z.timestamp) > new Date(zoneOccupancy[key].timestamp)) {
      zoneOccupancy[key] = z;
    }
  }
  const liveZones = Object.values(zoneOccupancy);
  const staffDetected = liveZones.reduce((s, z) => s + (z.staff_count || 0), 0);

  // Server now emits queue / device_offline / after_hours alerts directly
  // for node-only setups, so no client-side derivation. Capacity remains
  // client-side because it needs the baseline_expected the server already
  // sends — and that's still kilo-only territory.
  const smartAlerts = [...alerts];
  if (rt.current_occupancy > 0 && rt.baseline_expected && rt.current_occupancy > rt.baseline_expected * 0.9) {
    smartAlerts.push({ type: 'capacity', message: 'Near capacity (90%+ of baseline)' });
  }

  const alertIcons = { device_offline: '⚠️', low_footfall: '📉', queue: '⚠️', capacity: '📊', after_hours: '🔔' };

  return (
    <>
      {/* Live indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: -8 }}>
        <span style={{
          width: 10, height: 10, borderRadius: '50%', background: '#16A34A',
          display: 'inline-block', animation: 'story-pulse 2s ease-in-out infinite',
        }} />
        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#16A34A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Live
        </span>
        {lastUpdate && (
          <span style={{ fontSize: '0.75rem', color: 'var(--c-text-dim)' }}>
            Updated {lastUpdate.toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Current status */}
      <div className="card" style={{ borderLeft: '4px solid #16A34A' }}>
        <div className="card-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--c-primary)', lineHeight: 1 }}>
                {rt.current_occupancy || 0}
              </div>
              <div style={{ fontSize: '0.95rem', color: 'var(--c-text-muted)', marginTop: 4 }}>
                people inside right now
              </div>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <StatusBadge status={rt.status} />
              {rt.baseline_expected != null && (
                <div style={{ fontSize: '0.78rem', color: 'var(--c-text-dim)', marginTop: 6 }}>
                  Expected: {rt.baseline_expected} for this hour
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 24, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--c-border)' }}>
            <div>
              <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#16A34A' }}>↑ {recentEntries}</span>
              <span style={{ fontSize: '0.82rem', color: 'var(--c-text-muted)', marginLeft: 6 }}>entered</span>
            </div>
            <div>
              <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#DC2626' }}>↓ {recentExits}</span>
              <span style={{ fontSize: '0.82rem', color: 'var(--c-text-muted)', marginLeft: 6 }}>exited</span>
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--c-text-dim)' }}>in last 30 minutes</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Active zones */}
        <div className="card">
          <div className="card-header"><span className="card-title">Active zones</span></div>
          <div className="card-body">
            {liveZones.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--c-text-muted)', padding: 24, fontSize: '0.85rem' }}>No recent zone data.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {liveZones.map(z => (
                  <div key={z.zone_name || `kilo-${z.zone_number}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--c-border)' }}>
                    <span style={{ fontWeight: 500, fontSize: '0.88rem' }}>
                      {z.zone_name || `Zone ${z.zone_number}`}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>{z.occupancy || 0}</span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--c-text-muted)' }}>people</span>
                    </div>
                  </div>
                ))}
                {staffDetected > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', color: 'var(--c-text-muted)', fontSize: '0.85rem' }}>
                    <span>Staff detected</span>
                    <span style={{ fontWeight: 600 }}>{staffDetected}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Live alerts */}
        <div className="card">
          <div className="card-header"><span className="card-title">Live alerts</span></div>
          <div className="card-body">
            {smartAlerts.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 24 }}>
                <span style={{ fontSize: '2rem' }}>✅</span>
                <span style={{ fontSize: '0.88rem', color: 'var(--c-text-muted)' }}>All systems normal</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {smartAlerts.map((a, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', borderRadius: 'var(--r-md)',
                    background: a.type === 'device_offline' || a.type === 'queue' ? 'var(--c-danger-light)'
                      : a.type === 'capacity' || a.type === 'after_hours' ? '#FEF3C7' : 'var(--c-bg-muted)',
                    fontSize: '0.85rem',
                  }}>
                    <span>{alertIcons[a.type] || '🔔'}</span>
                    <span>{a.message || `${a.type}: ${a.device || ''}`}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Today's activity */}
      <div className="card">
        <div className="card-header"><span className="card-title">Today's activity</span></div>
        <div className="card-body">
          {todayActivity.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--c-text-muted)', padding: 32, fontSize: '0.85rem' }}>No activity today yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={todayActivity}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" />
                <XAxis dataKey="hour" tickFormatter={h => `${h}:00`} fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div style={{ background: '#fff', border: '1px solid var(--c-border)', borderRadius: 8, padding: '8px 14px', fontSize: '0.82rem' }}>
                      <div style={{ fontWeight: 600 }}>{label}:00</div>
                      <div style={{ color: '#E85D26' }}>{payload[0].value} entries</div>
                    </div>
                  );
                }} />
                <Bar dataKey="entries" fill="#E85D26" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Device health */}
      {devices.length > 0 && (
        <div className="card">
          <div className="card-header"><span className="card-title">Device health</span></div>
          <div className="card-body">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Device</th><th>Name</th><th>Status</th><th>Firmware</th><th>Last seen</th></tr></thead>
                <tbody>
                  {devices.map((d, i) => {
                    const ago = d.last_seen ? Math.round((Date.now() - new Date(d.last_seen).getTime()) / 60000) : null;
                    const online = ago != null && ago < 30;
                    // Kilo cameras give us device_sn; TapProve Nodes give us
                    // device_id. Whichever is set is what we render.
                    const deviceLabel = d.device_sn || d.device_id || '—';
                    return (
                      <tr key={i}>
                        <td><code style={{ fontSize: '0.8rem' }}>{deviceLabel}</code></td>
                        <td>{d.device_name || '—'}</td>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', fontWeight: 600, color: online ? '#16A34A' : '#DC2626' }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: online ? '#16A34A' : '#DC2626' }} />
                            {online ? 'Online' : 'Offline'}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--c-text-muted)' }}>{d.firmware_version || '—'}</td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--c-text-muted)' }}>
                          {ago != null ? (ago < 1 ? 'Just now' : ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Annotation Modal
// ---------------------------------------------------------------------------

function AnnotationModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const { annotation } = await createAnnotation(form);
      onSave(annotation);
    } catch {}
    setSaving(false);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 'var(--r-xl)', padding: 28, width: '100%', maxWidth: 440, boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 16 }}>Add event annotation</h3>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field">
            <label className="label label-required">Date</label>
            <input className="input" type="date" value={form.event_date} onChange={e => setForm({ ...form, event_date: e.target.value })} required />
          </div>
          <div className="field">
            <label className="label label-required">Title</label>
            <input className="input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Launched new menu" maxLength={120} required />
          </div>
          <div className="field">
            <label className="label">Description</label>
            <textarea className="textarea" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Optional details..." />
          </div>
          <div className="field">
            <label className="label label-required">Category</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ANNOTATION_CATEGORIES.map(c => (
                <button key={c.value} type="button"
                  onClick={() => setForm({ ...form, category: c.value })}
                  style={{
                    padding: '5px 12px', borderRadius: 'var(--r-full)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                    background: form.category === c.value ? c.color : 'var(--c-bg-muted)',
                    color: form.category === c.value ? '#fff' : 'var(--c-text)',
                    border: form.category === c.value ? 'none' : '1px solid var(--c-border)',
                  }}>
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button className="btn btn-secondary" type="button" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" type="submit" style={{ flex: 1 }} disabled={saving}>
              {saving ? <Spinner white /> : 'Save event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
