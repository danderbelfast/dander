import React, { useEffect, useState, lazy, Suspense } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { getPlatformStats, getMapData, getPlatformProfitStats, getPlatformProfitChart } from '../api/admin';
import { LoadingBlock, Spinner } from '../components/ui/Spinner';
import { DateRangePicker } from '../components/ui/DateRangePicker';

const BusinessMap = lazy(() => import('../components/ui/BusinessMap'));

function StatCard({ label, value, sub, accent }) {
  return (
    <div className={`stat-card${accent ? ' stat-accent' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value ?? '—'}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#1A1916', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 14px', fontSize: '0.76rem', color: '#fff' }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color }}>{p.name}: {p.value}</div>
      ))}
    </div>
  );
};

function MiniTable({ title, rows, cols }) {
  return (
    <div className="card">
      <div className="card-header"><span className="card-title">{title}</span></div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>{cols.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={cols.length} style={{ textAlign: 'center', color: 'var(--c-text-muted)', padding: '24px 0' }}>No data</td></tr>
            )}
            {rows.map((row, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c.key} className={c.mono ? 'table-mono' : ''}>
                    {c.render ? c.render(row, i) : row[c.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [mapData, setMapData] = useState([]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const [roiFrom, setRoiFrom] = useState(yearStart);
  const [roiTo, setRoiTo]     = useState(todayStr);
  const [roi, setRoi]         = useState(null);
  const [roiChart, setRoiChart] = useState([]);

  useEffect(() => {
    Promise.all([getPlatformStats(), getMapData()])
      .then(([s, m]) => { setStats(s); setMapData(m.businesses || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    Promise.all([
      getPlatformProfitStats(roiFrom, roiTo).catch(() => null),
      getPlatformProfitChart(roiFrom, roiTo).catch(() => null),
    ]).then(([p, c]) => { setRoi(p?.profit || null); setRoiChart(c?.chart || []); });
  }, [roiFrom, roiTo]);

  if (loading) return <LoadingBlock label="Loading dashboard…" />;
  if (!stats)  return <div className="form-error-box" style={{ maxWidth: 480 }}>Failed to load dashboard data.</div>;

  const {
    totalUsers = 0, activeBusinesses = 0, offersLiveToday = 0,
    redemptionsToday = 0, redemptionsWeek = 0, redemptionsMonth = 0,
    claimsToday = 0, claimsWeek = 0, claimsMonth = 0,
    newBizToday = 0, newBizWeek = 0, newBizMonth = 0,
    signupsChart = [], redemptionsChart = [],
    topBusinesses = [], topOffers = [],
  } = stats;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Stats row */}
      <div className="stats-grid">
        <StatCard label="Total users"         value={totalUsers.toLocaleString()} />
        <StatCard label="Active businesses"   value={activeBusinesses.toLocaleString()} />
        <StatCard label="Offers live today"   value={offersLiveToday.toLocaleString()} />
        <StatCard label="Redeemed today"      value={redemptionsToday.toLocaleString()} accent />
        <StatCard label="This week"           value={redemptionsWeek.toLocaleString()} sub="redeemed" />
        <StatCard label="This month"          value={redemptionsMonth.toLocaleString()} sub="redeemed" />
        <StatCard label="Claimed today"       value={claimsToday.toLocaleString()} accent />
        <StatCard label="This week"           value={claimsWeek.toLocaleString()} sub="claimed" />
        <StatCard label="This month"          value={claimsMonth.toLocaleString()} sub="claimed" />
        <StatCard label="New businesses today" value={newBizToday.toLocaleString()} />
        <StatCard label="This week"            value={newBizWeek.toLocaleString()} sub="new businesses" />
        <StatCard label="This month"           value={newBizMonth.toLocaleString()} sub="new businesses" />
      </div>

      {/* Platform ROI */}
      {roi && (
        <div className="card">
          <div className="card-header"><span className="card-title">Platform ROI</span></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <DateRangePicker from={roiFrom} to={roiTo} onChange={(f, t) => { setRoiFrom(f); setRoiTo(t); }} />
            <div className="stats-grid">
              <StatCard label="Total redemptions" value={roi.total_redemptions?.toLocaleString()} />
              <StatCard label="Revenue for businesses" value={`£${(roi.total_revenue || 0).toFixed(2)}`} />
              <StatCard label="Profit for businesses" value={`£${(roi.total_profit || 0).toFixed(2)}`} accent />
              <StatCard label="Avg profit/redemption" value={`£${(roi.avg_profit_per_redemption || 0).toFixed(2)}`} />
              <StatCard label="Best business" value={roi.best_business?.name || '—'} sub={roi.best_business ? `£${roi.best_business.profit.toFixed(2)}` : null} />
              <StatCard label="Best offer" value={roi.best_offer?.name || '—'} sub={roi.best_offer ? `£${roi.best_offer.profit.toFixed(2)}` : null} />
            </div>
            {roiChart.length > 0 && (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={roiChart} margin={{ top: 4, right: 16, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }} axisLine={false} tickLine={false} tickFormatter={v => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }} axisLine={false} tickLine={false} tickFormatter={v => `£${v}`} />
                  <Tooltip content={<ChartTip />} />
                  <Line type="monotone" dataKey="profit" name="Profit" stroke="#E85D26" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="charts-row">
        <div className="card">
          <div className="card-header"><span className="card-title">User signups — last 30 days</span></div>
          <div className="card-body" style={{ padding: '12px 4px 12px 0' }}>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={signupsChart} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--c-text-muted)' }} axisLine={false} tickLine={false} interval={4} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--c-text-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} />
                <Line type="monotone" dataKey="signups" name="Signups" stroke="var(--c-accent)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Redemptions — last 30 days</span></div>
          <div className="card-body" style={{ padding: '12px 4px 12px 0' }}>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={redemptionsChart} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--c-text-muted)' }} axisLine={false} tickLine={false} interval={4} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--c-text-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} />
                <Line type="monotone" dataKey="redemptions" name="Redemptions" stroke="#60A5FA" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="card">
        <div className="card-header"><span className="card-title">Active business locations</span></div>
        <div className="card-body" style={{ padding: 0 }}>
          <Suspense fallback={<LoadingBlock label="Loading map…" />}>
            <BusinessMap businesses={mapData} />
          </Suspense>
        </div>
      </div>

      {/* Top tables */}
      <div className="charts-row">
        <MiniTable
          title="Top 5 businesses — all time"
          rows={topBusinesses}
          cols={[
            { key: 'rank', label: '#', render: (_, i) => i + 1 },
            { key: 'name', label: 'Business' },
            { key: 'category', label: 'Category' },
            { key: 'redeemed', label: 'Redeemed', mono: true },
          ]}
        />
        <MiniTable
          title="Top 5 offers — all time"
          rows={topOffers}
          cols={[
            { key: 'rank', label: '#', render: (_, i) => i + 1 },
            { key: 'title', label: 'Offer' },
            { key: 'businessName', label: 'Business' },
            { key: 'redeemed', label: 'Redeemed', mono: true },
          ]}
        />
      </div>

    </div>
  );
}
