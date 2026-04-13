import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { getProfitReports, exportProfitCSV } from '../api/business';
import { Spinner } from '../components/ui/Spinner';
import { DateRangePicker } from '../components/ui/DateRangePicker';

function fmt(n) { return `£${Number(n || 0).toFixed(2)}`; }

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={accent ? { color: 'var(--c-primary)' } : {}}>{value ?? '—'}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid var(--c-border)', borderRadius: 8, padding: '8px 14px', fontSize: '0.82rem' }}>
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{label}</div>
      <div style={{ color: 'var(--c-primary)' }}>{fmt(payload[0].value)} profit</div>
    </div>
  );
};

export default function Reports() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const monthStart = (() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); })();

  const [from, setFrom] = useState(monthStart);
  const [to, setTo]     = useState(todayStr);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setLoading(true);
    getProfitReports(from, to)
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [from, to]);

  async function handleExport() {
    setExporting(true);
    try {
      const resp = await exportProfitCSV(from, to);
      const url = URL.createObjectURL(new Blob([resp.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url; a.download = `dander-profit-${from}-to-${to}.csv`;
      a.click(); URL.revokeObjectURL(url);
    } catch { /* ignore */ }
    finally { setExporting(false); }
  }

  const summary = data?.summary;
  const offers  = data?.offers || [];
  const chart   = data?.chart  || [];

  // Totals row
  const totals = offers.reduce((acc, o) => {
    acc.redemptions += o.redemptions;
    if (o.has_pricing) { acc.revenue += o.revenue; acc.cost += o.cost; acc.profit += o.gross_profit; }
    return acc;
  }, { redemptions: 0, revenue: 0, cost: 0, profit: 0 });

  // Best offer
  const best = offers.filter(o => o.has_pricing).sort((a, b) => b.gross_profit - a.gross_profit)[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0 }}>Profit Reports</h2>
        <button className="btn btn-secondary btn-sm" onClick={handleExport} disabled={exporting}>
          {exporting ? 'Exporting…' : 'Export to CSV'}
        </button>
      </div>

      <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner /></div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="stats-grid">
            <StatCard label="Total redemptions" value={summary?.total_redemptions ?? 0} />
            <StatCard label="Total revenue" value={fmt(summary?.total_revenue)} />
            <StatCard label="Total cost" value={fmt(summary?.total_cost)} />
            <StatCard label="Total profit" value={fmt(summary?.total_profit)} accent />
            {best && <StatCard label="Best offer" value={best.title} sub={`${fmt(best.gross_profit)} profit`} />}
          </div>

          {summary?.offers_with_pricing > 0 && (
            <div style={{ fontSize: '0.78rem', color: 'var(--c-text-muted)' }}>
              Based on {summary.offers_with_pricing} offer{summary.offers_with_pricing !== 1 ? 's' : ''} with pricing data
            </div>
          )}

          {/* Daily profit chart */}
          {chart.length > 0 && (
            <div className="card">
              <div className="card-header"><span className="card-title">Daily profit</span></div>
              <div className="card-body" style={{ padding: '16px 8px' }}>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={chart} margin={{ top: 4, right: 16, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--c-text-muted)' }} axisLine={false} tickLine={false}
                      tickFormatter={v => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--c-text-muted)' }} axisLine={false} tickLine={false}
                      tickFormatter={v => `£${v}`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="profit" stroke="var(--c-primary)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Offer breakdown table */}
          <div className="card">
            <div className="card-header"><span className="card-title">Offer breakdown</span></div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--c-border)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 16px' }}>Offer</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Redemptions</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Revenue</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Cost</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Gross profit</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Per redemption</th>
                  </tr>
                </thead>
                <tbody>
                  {offers.map(o => (
                    <tr key={o.id} style={{ borderBottom: '1px solid var(--c-border)' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 500 }}>{o.title}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{o.redemptions}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{o.has_pricing ? fmt(o.revenue) : '—'}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{o.has_pricing ? fmt(o.cost) : '—'}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--c-primary)', fontWeight: 600 }}>
                        {o.has_pricing ? fmt(o.gross_profit) : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        {o.profit_per_redemption != null ? fmt(o.profit_per_redemption) : '—'}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--c-bg-muted)', fontWeight: 700 }}>
                    <td style={{ padding: '10px 16px' }}>Total</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{totals.redemptions}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{fmt(totals.revenue)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{fmt(totals.cost)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--c-primary)' }}>{fmt(totals.profit)}</td>
                    <td style={{ padding: '10px 12px' }} />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
