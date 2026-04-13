import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { getOfferStats, getOfferProfit } from '../api/business';
import { Spinner } from '../components/ui/Spinner';

function StatCard({ label, value, sub }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value ?? '—'}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid var(--c-border)', borderRadius: 8, padding: '8px 14px', fontSize: '0.82rem' }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color }}>{p.name}: {p.value}</div>
      ))}
    </div>
  );
};

export default function CampaignStats() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [data, setData]       = useState(null);
  const [profit, setProfit]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    Promise.all([
      getOfferStats(id),
      getOfferProfit(id).catch(() => null),
    ])
      .then(([statsData, profitData]) => { setData(statsData); setProfit(profitData?.profit || null); })
      .catch(() => setError('Failed to load stats.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><Spinner /></div>
  );
  if (error) return <div className="form-error-box" style={{ maxWidth: 480 }}>{error}</div>;

  const s = (data || {}).stats || {};
  const offer         = s.offer        || {};
  const totalViews    = s.views        || 0;
  const totalClaimed  = s.total_claimed  || 0;
  const totalRedeemed = s.total_redeemed || 0;

  // Merge views + claimed into one daily series (keyed by date)
  const viewsClaimedMap = {};
  (s.views_by_day   || []).forEach((r) => { viewsClaimedMap[r.date] = { day: r.date, views: r.count, claimed: 0 }; });
  (s.claimed_by_day || []).forEach((r) => {
    if (!viewsClaimedMap[r.date]) viewsClaimedMap[r.date] = { day: r.date, views: 0, claimed: 0 };
    viewsClaimedMap[r.date].claimed = r.count;
  });
  const viewsClaimedData = Object.values(viewsClaimedMap).sort((a, b) => a.day.localeCompare(b.day));

  // Merge claimed + redeemed into one daily series (keyed by date)
  const claimedRedeemedMap = {};
  (s.claimed_by_day  || []).forEach((r) => { claimedRedeemedMap[r.date] = { day: r.date, claimed: r.count, redeemed: 0 }; });
  (s.redeemed_by_day || []).forEach((r) => {
    if (!claimedRedeemedMap[r.date]) claimedRedeemedMap[r.date] = { day: r.date, claimed: 0, redeemed: 0 };
    claimedRedeemedMap[r.date].redeemed = r.count;
  });
  const claimedRedeemedData = Object.values(claimedRedeemedMap).sort((a, b) => a.day.localeCompare(b.day));

  const hourlyData = s.peak_hour != null ? [{ hour: s.peak_hour, redemptions: totalRedeemed }] : [];

  const redemptionRate = totalViews > 0
    ? `${((totalRedeemed / totalViews) * 100).toFixed(1)}%`
    : '—';

  const totalIssued = totalClaimed + totalRedeemed;
  const cap = offer.max_redemptions;
  const capUsed = cap != null
    ? `${totalIssued} / ${cap}`
    : `${totalIssued} (no cap)`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/offers')} style={{ marginBottom: 12 }}>
          ← Back to offers
        </button>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--c-heading)', margin: 0 }}>
          {offer.title || 'Campaign Stats'}
        </h2>
        {offer.category && (
          <p style={{ margin: '4px 0 0', color: 'var(--c-text-muted)', fontSize: '0.88rem' }}>{offer.category}</p>
        )}
      </div>

      {/* Stat cards */}
      <div className="stats-grid">
        <StatCard label="Total views" value={totalViews.toLocaleString()} />
        <StatCard label="Coupons claimed" value={totalClaimed.toLocaleString()} sub="waiting to be used" />
        <StatCard label="Coupons redeemed" value={totalRedeemed.toLocaleString()} sub="used at counter" />
        <StatCard label="Cap used" value={capUsed} sub={cap != null ? 'issued / cap' : null} />
      </div>

      {/* Daily chart: views vs claimed */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Views vs claimed — daily</span>
        </div>
        <div className="card-body" style={{ padding: '16px 8px' }}>
          {viewsClaimedData.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--c-text-muted)', padding: '40px 0', fontSize: '0.88rem' }}>
              No daily data yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={viewsClaimedData} margin={{ top: 4, right: 16, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--c-text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--c-text-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '0.8rem', paddingTop: 8 }} />
                <Line type="monotone" dataKey="views" name="Views" stroke="#94a3b8" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="claimed" name="Claimed" stroke="var(--c-primary)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Daily chart: claimed vs redeemed */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Claimed vs redeemed — daily</span>
        </div>
        <div className="card-body" style={{ padding: '16px 8px' }}>
          {claimedRedeemedData.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--c-text-muted)', padding: '40px 0', fontSize: '0.88rem' }}>
              No daily data yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={claimedRedeemedData} margin={{ top: 4, right: 16, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--c-text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--c-text-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '0.8rem', paddingTop: 8 }} />
                <Line type="monotone" dataKey="claimed" name="Claimed" stroke="var(--c-primary)" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="redeemed" name="Redeemed" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Hourly bar chart */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Peak hours (redemptions by hour of day)</span>
        </div>
        <div className="card-body" style={{ padding: '16px 8px' }}>
          {hourlyData.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--c-text-muted)', padding: '40px 0', fontSize: '0.88rem' }}>
              Not enough data yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={hourlyData} margin={{ top: 4, right: 16, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: 'var(--c-text-muted)' }} axisLine={false} tickLine={false}
                  tickFormatter={(h) => `${h}:00`} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--c-text-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(232,93,38,0.06)' }} />
                <Bar dataKey="redemptions" name="Redemptions" fill="var(--c-primary)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Offer info */}
      <div className="card">
        <div className="card-header"><span className="card-title">Offer info</span></div>
        <div className="card-body">
          <dl style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '10px 16px', fontSize: '0.88rem' }}>
            <dt style={{ color: 'var(--c-text-muted)', fontWeight: 500 }}>Status</dt>
            <dd style={{ margin: 0 }}>{offer.is_active != null ? (offer.is_active ? 'active' : 'inactive') : '—'}</dd>
            <dt style={{ color: 'var(--c-text-muted)', fontWeight: 500 }}>Radius</dt>
            <dd style={{ margin: 0 }}>
              {offer.radius_meters >= 1000
                ? `${offer.radius_meters / 1000} km`
                : `${offer.radius_meters ?? '—'} m`}
            </dd>
            <dt style={{ color: 'var(--c-text-muted)', fontWeight: 500 }}>Starts</dt>
            <dd style={{ margin: 0 }}>
              {offer.starts_at ? new Date(offer.starts_at).toLocaleString('en-GB') : '—'}
            </dd>
            <dt style={{ color: 'var(--c-text-muted)', fontWeight: 500 }}>Expires</dt>
            <dd style={{ margin: 0 }}>
              {offer.expires_at ? new Date(offer.expires_at).toLocaleString('en-GB') : 'No expiry set'}
            </dd>
          </dl>
          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            {offer.is_active !== false && (
              <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/offers/${id}/edit`)}>
                Edit offer
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Profit breakdown */}
      <div className="card">
        <div className="card-header"><span className="card-title">Profit breakdown</span></div>
        <div className="card-body">
          {profit && profit.has_pricing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="stats-grid">
                <StatCard label="Revenue generated" value={`£${profit.revenue_generated.toFixed(2)}`} />
                <StatCard label="Cost of offers" value={`£${profit.cost_of_offers.toFixed(2)}`} />
                <StatCard label="Gross profit" value={`£${profit.gross_profit.toFixed(2)}`} />
                <StatCard label="Per redemption" value={`£${profit.profit_per_redemption.toFixed(2)}`} />
              </div>
              <div style={{ display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden', background: 'var(--c-bg-muted)' }}>
                {profit.revenue_generated > 0 && (
                  <>
                    <div style={{ width: `${(profit.cost_of_offers / profit.revenue_generated) * 100}%`, background: 'var(--c-border)', transition: 'width 0.3s' }} title="Cost" />
                    <div style={{ flex: 1, background: 'var(--c-primary)', transition: 'width 0.3s' }} title="Profit" />
                  </>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--c-text-muted)' }}>
                <span>Cost: £{profit.cost_of_offers.toFixed(2)}</span>
                <span style={{ color: 'var(--c-primary)', fontWeight: 600 }}>Profit: £{profit.gross_profit.toFixed(2)}</span>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ color: 'var(--c-text-muted)', fontSize: '0.88rem', marginBottom: 12 }}>
                Add your cost and pricing data to see profit reports for this offer
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => navigate(`/offers/${id}/edit`)}>
                Edit offer pricing
              </button>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
