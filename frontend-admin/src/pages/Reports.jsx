import React, { useEffect, useState } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend,
  BarChart, Bar,
} from 'recharts';
import { getReports, exportCSV, getProfitReports, exportProfitCSV } from '../api/admin';
import { LoadingBlock, Spinner } from '../components/ui/Spinner';
import { useToast } from '../context/ToastContext';
import { DateRangePicker } from '../components/ui/DateRangePicker';

const PALETTE = ['#E85D26', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

function fmt(n) { return `£${Number(n || 0).toFixed(2)}`; }

function StatCard({ label, value, sub, accent }) {
  return (
    <div className={`stat-card${accent ? ' stat-accent' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value ?? '—'}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#1A1916', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 14px', fontSize: '0.76rem', color: '#fff' }}>
      {label && <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>}
      {payload.map((p) => <div key={p.name} style={{ color: p.color || p.fill || '#fff' }}>{p.name}: {p.value}</div>)}
    </div>
  );
};

const PieTip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div style={{ background: '#1A1916', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 14px', fontSize: '0.76rem', color: '#fff' }}>
      <div style={{ fontWeight: 600 }}>{p.name}</div>
      <div>{p.value} ({((p.payload.percent || 0) * 100).toFixed(1)}%)</div>
    </div>
  );
};

export default function Reports() {
  const { addToast } = useToast();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState('');

  // Profit report state
  const todayStr = new Date().toISOString().slice(0, 10);
  const monthStart = (() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); })();
  const [profitFrom, setProfitFrom] = useState(monthStart);
  const [profitTo, setProfitTo]     = useState(todayStr);
  const [profitData, setProfitData] = useState(null);

  useEffect(() => {
    getReports()
      .then(setData)
      .catch(() => addToast('Failed to load reports.', 'error'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    getProfitReports(profitFrom, profitTo)
      .then(setProfitData)
      .catch(() => {});
  }, [profitFrom, profitTo]);

  async function handleExport(type, filename) {
    setExporting(type);
    try {
      let blob;
      if (type === 'profit') {
        const resp = await exportProfitCSV(profitFrom, profitTo);
        blob = new Blob([resp.data], { type: 'text/csv' });
      } else {
        blob = await exportCSV(type);
      }
      downloadBlob(blob, filename);
      addToast(`${filename} downloaded.`, 'success');
    } catch {
      addToast('Export failed.', 'error');
    } finally { setExporting(''); }
  }

  if (loading) return <LoadingBlock label="Building reports…" />;
  if (!data)   return <div className="form-error-box" style={{ maxWidth: 480 }}>Failed to load reports.</div>;

  const {
    categoryBreakdown = [],
    offerTypeBreakdown = [],
    businessGrowth = [],
    dailyActivity = [],
  } = data;

  // compute percent for pie tooltip
  const catTotal = categoryBreakdown.reduce((s, r) => s + (r.redemptions || 0), 0);
  const catWithPct = categoryBreakdown.map((r) => ({ ...r, percent: catTotal ? r.redemptions / catTotal : 0 }));

  const typeTotal = offerTypeBreakdown.reduce((s, r) => s + (r.count || 0), 0);
  const typeWithPct = offerTypeBreakdown.map((r) => ({ ...r, percent: typeTotal ? r.count / typeTotal : 0 }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      <div className="page-header">
        <div>
          <div className="page-title">Reports</div>
          <div className="page-sub">Platform analytics and data exports</div>
        </div>

        {/* Export buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { type: 'users',        label: 'Export users',        file: 'dander-users.csv' },
            { type: 'businesses',   label: 'Export businesses',   file: 'dander-businesses.csv' },
            { type: 'redemptions',  label: 'Export redemptions',  file: 'dander-redemptions.csv' },
          { type: 'profit', label: 'Export profit', file: 'dander-platform-profit.csv' },
          ].map(({ type, label, file }) => (
            <button
              key={type}
              className="btn btn-secondary btn-sm"
              onClick={() => handleExport(type, file)}
              disabled={!!exporting}
            >
              {exporting === type ? <Spinner /> : '↓'} {label}
            </button>
          ))}
        </div>
      </div>

      {/* Pie charts row */}
      <div className="charts-row">

        <div className="card">
          <div className="card-header"><span className="card-title">Redemptions by category</span></div>
          <div className="card-body">
            {catWithPct.length === 0
              ? <div className="empty-state">No data yet.</div>
              : (
                <div className="pie-wrap">
                  <ResponsiveContainer width={180} height={180}>
                    <PieChart>
                      <Pie data={catWithPct} dataKey="redemptions" nameKey="category" cx="50%" cy="50%" outerRadius={80} strokeWidth={0}>
                        {catWithPct.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                      </Pie>
                      <Tooltip content={<PieTip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pie-legend">
                    {catWithPct.map((r, i) => (
                      <div key={r.category} className="pie-legend-item">
                        <div className="pie-legend-dot" style={{ background: PALETTE[i % PALETTE.length] }} />
                        <span style={{ color: 'var(--c-text-muted)', fontSize: '0.76rem' }}>{r.category}</span>
                        <span style={{ marginLeft: 'auto', fontFamily: 'var(--f-mono)', fontSize: '0.74rem', paddingLeft: 8 }}>{r.redemptions}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Offers by discount type</span></div>
          <div className="card-body">
            {typeWithPct.length === 0
              ? <div className="empty-state">No data yet.</div>
              : (
                <div className="pie-wrap">
                  <ResponsiveContainer width={180} height={180}>
                    <PieChart>
                      <Pie data={typeWithPct} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={80} strokeWidth={0}>
                        {typeWithPct.map((_, i) => <Cell key={i} fill={PALETTE[(i + 3) % PALETTE.length]} />)}
                      </Pie>
                      <Tooltip content={<PieTip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pie-legend">
                    {typeWithPct.map((r, i) => (
                      <div key={r.type} className="pie-legend-item">
                        <div className="pie-legend-dot" style={{ background: PALETTE[(i + 3) % PALETTE.length] }} />
                        <span style={{ color: 'var(--c-text-muted)', fontSize: '0.76rem', textTransform: 'capitalize' }}>{r.type?.replace('_', ' ')}</span>
                        <span style={{ marginLeft: 'auto', fontFamily: 'var(--f-mono)', fontSize: '0.74rem', paddingLeft: 8 }}>{r.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>
        </div>

      </div>

      {/* Business growth */}
      <div className="card">
        <div className="card-header"><span className="card-title">Business growth over time</span></div>
        <div className="card-body" style={{ padding: '12px 4px 12px 0' }}>
          {businessGrowth.length === 0
            ? <div className="empty-state">No data yet.</div>
            : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={businessGrowth} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--c-text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--c-text-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTip />} />
                  <Legend wrapperStyle={{ fontSize: '0.76rem', paddingTop: 8 }} />
                  <Line type="monotone" dataKey="total"    name="Total businesses" stroke="var(--c-accent)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="active"   name="Active" stroke="#10B981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="pending"  name="Pending" stroke="#F59E0B" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
                </LineChart>
              </ResponsiveContainer>
            )}
        </div>
      </div>

      {/* Daily claimed vs redeemed bar chart */}
      <div className="card">
        <div className="card-header"><span className="card-title">Daily activity — last 30 days</span></div>
        <div className="card-body" style={{ padding: '12px 4px 12px 0' }}>
          {dailyActivity.length === 0
            ? <div className="empty-state">No data yet.</div>
            : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dailyActivity} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--c-text-muted)' }} axisLine={false} tickLine={false} interval={4} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--c-text-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(232,93,38,0.06)' }} />
                  <Legend wrapperStyle={{ fontSize: '0.76rem', paddingTop: 8 }} />
                  <Bar dataKey="claimed"  name="Claimed"  fill="#F59E0B" radius={[3, 3, 0, 0]} maxBarSize={16} />
                  <Bar dataKey="redeemed" name="Redeemed" fill="var(--c-accent)" radius={[3, 3, 0, 0]} maxBarSize={16} />
                </BarChart>
              </ResponsiveContainer>
            )}
        </div>
      </div>

      {/* Platform Profit Report */}
      <div className="card">
        <div className="card-header"><span className="card-title">Platform Profit</span></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <DateRangePicker from={profitFrom} to={profitTo} onChange={(f, t) => { setProfitFrom(f); setProfitTo(t); }} />
          {profitData ? (
            <>
              <div className="stats-grid">
                <StatCard label="Businesses with active offers" value={profitData.businesses?.filter(b => b.offer_count > 0).length ?? 0} />
                <StatCard label="Total redemptions" value={profitData.summary?.total_redemptions?.toLocaleString() ?? 0} />
                <StatCard label="Revenue generated" value={fmt(profitData.summary?.total_revenue)} />
                <StatCard label="Profit generated" value={fmt(profitData.summary?.total_profit)} accent />
              </div>

              {profitData.chart?.length > 0 && (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={profitData.chart} margin={{ top: 4, right: 16, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--c-text-muted)' }} axisLine={false} tickLine={false} tickFormatter={v => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--c-text-muted)' }} axisLine={false} tickLine={false} tickFormatter={v => `£${v}`} />
                    <Tooltip content={<ChartTip />} />
                    <Line type="monotone" dataKey="profit" name="Profit" stroke="var(--c-accent)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}

              {profitData.businesses?.length > 0 && (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr><th>Business</th><th>Category</th><th style={{ textAlign: 'right' }}>Redeemed</th><th style={{ textAlign: 'right' }}>Revenue</th><th style={{ textAlign: 'right' }}>Profit</th><th style={{ textAlign: 'right' }}>Offers</th><th>Joined</th></tr>
                    </thead>
                    <tbody>
                      {profitData.businesses.map(b => (
                        <tr key={b.id}>
                          <td style={{ fontWeight: 500 }}>{b.name}</td>
                          <td style={{ fontSize: '0.78rem', color: 'var(--c-text-muted)' }}>{b.category || '—'}</td>
                          <td className="table-mono" style={{ textAlign: 'right' }}>{b.redemptions}</td>
                          <td className="table-mono" style={{ textAlign: 'right' }}>{fmt(b.revenue)}</td>
                          <td className="table-mono" style={{ textAlign: 'right', color: 'var(--c-accent)', fontWeight: 600 }}>{fmt(b.profit)}</td>
                          <td className="table-mono" style={{ textAlign: 'right' }}>{b.offer_count}</td>
                          <td style={{ fontSize: '0.76rem', color: 'var(--c-text-muted)' }}>{b.created_at ? new Date(b.created_at).toISOString().slice(0, 10) : '—'}</td>
                        </tr>
                      ))}
                      {(() => {
                        const tots = profitData.businesses.reduce((a, b) => ({
                          redemptions: a.redemptions + b.redemptions,
                          revenue: a.revenue + b.revenue,
                          profit: a.profit + b.profit,
                          offers: a.offers + b.offer_count,
                        }), { redemptions: 0, revenue: 0, profit: 0, offers: 0 });
                        return (
                          <tr style={{ background: 'rgba(255,255,255,0.04)', fontWeight: 700 }}>
                            <td>Total</td><td /><td style={{ textAlign: 'right' }}>{tots.redemptions}</td>
                            <td style={{ textAlign: 'right' }}>{fmt(tots.revenue)}</td>
                            <td style={{ textAlign: 'right', color: 'var(--c-accent)' }}>{fmt(tots.profit)}</td>
                            <td style={{ textAlign: 'right' }}>{tots.offers}</td><td />
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">No profit data yet.</div>
          )}
        </div>
      </div>

    </div>
  );
}
