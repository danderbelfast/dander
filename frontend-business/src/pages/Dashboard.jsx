import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { getDashboard, getMyOffers } from '../api/business';
import { useAuth } from '../context/AuthContext';
import { Spinner } from '../components/ui/Spinner';

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={accent ? { color: 'var(--c-primary)' } : {}}>{value ?? '—'}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = { active: 'badge-active', scheduled: 'badge-scheduled', expired: 'badge-expired', inactive: 'badge-expired' };
  return <span className={`badge ${map[status] || 'badge-expired'}`}>{status}</span>;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid var(--c-border)', borderRadius: 8, padding: '8px 14px', fontSize: '0.82rem' }}>
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{label}</div>
      <div style={{ color: 'var(--c-primary)' }}>{payload[0].value} redemptions</div>
    </div>
  );
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { business } = useAuth();
  const [data, setData]     = useState(null);
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  useEffect(() => {
    Promise.all([getDashboard(), getMyOffers()])
      .then(([dashData, { offers: list }]) => {
        setData(dashData);
        setOffers(list || []);
      })
      .catch(() => setError('Failed to load dashboard.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <Spinner />
    </div>
  );

  if (error) return (
    <div className="form-error-box" style={{ maxWidth: 480 }}>{error}</div>
  );

  const { dashboard = {} } = data || {};
  const stats = {
    activeOffers:    dashboard.active_offers,
    totalClaimed:    dashboard.total_claimed,
    totalRedeemed:   dashboard.total_redeemed,
    weekRedemptions: dashboard.redemptions_this_week,
    topOffer:        dashboard.top_offer
      ? { title: dashboard.top_offer.title, redemptions: dashboard.top_offer.current_redemptions }
      : null,
  };
  const chartData   = [];
  const activeOffers = offers.filter((o) => o.is_active);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* Welcome */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--c-heading)', margin: 0 }}>
            Welcome back{business?.name ? `, ${business.name}` : ''}
          </h2>
          <p style={{ margin: '4px 0 0', color: 'var(--c-text-muted)', fontSize: '0.88rem' }}>
            Here's how your business is performing.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/offers/new')}>
          + Create offer
        </button>
      </div>

      {/* Stat cards */}
      <div className="stats-grid">
        <StatCard label="Active offers" value={stats.activeOffers} />
        <StatCard label="Coupons claimed" value={stats.totalClaimed} sub="waiting to be used" />
        <StatCard label="Coupons redeemed" value={stats.totalRedeemed} sub="used at counter" accent />
        <StatCard label="Top offer" value={stats.topOffer?.title || '—'} sub={stats.topOffer ? `${stats.topOffer.redemptions} redeemed` : null} />
      </div>

      {/* Bar chart */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Redemptions — last 14 days</span>
        </div>
        <div className="card-body" style={{ padding: '16px 8px' }}>
          {chartData.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--c-text-muted)', padding: '40px 0', fontSize: '0.88rem' }}>
              No redemption data yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 16, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--c-text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--c-text-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(232,93,38,0.06)' }} />
                <Bar dataKey="redemptions" fill="var(--c-primary)" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Active offers */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Active offers</span>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/offers')}>View all</button>
        </div>
        {activeOffers.length === 0 ? (
          <div className="card-body" style={{ textAlign: 'center', color: 'var(--c-text-muted)', padding: '40px 0', fontSize: '0.88rem' }}>
            No active offers. <span style={{ color: 'var(--c-primary)', cursor: 'pointer' }} onClick={() => navigate('/offers/new')}>Create one →</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {activeOffers.map((o, i) => {
              const expires = o.expires_at
                ? new Date(o.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                : null;
              const claimed  = parseInt(o.claimed_count  ?? 0, 10);
              const redeemed = parseInt(o.redeemed_count ?? 0, 10);
              return (
                <div key={o.id} style={{
                  display: 'flex', gap: 16, alignItems: 'center',
                  padding: '14px 20px',
                  borderTop: i > 0 ? '1px solid var(--c-border)' : 'none',
                }}>
                  {/* Thumbnail */}
                  <div style={{
                    width: 72, height: 72, flexShrink: 0, borderRadius: 10,
                    overflow: 'hidden', background: 'var(--c-bg-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {o.image_url
                      ? <img src={o.image_url} alt={o.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: '1.8rem' }}>🏷️</span>
                    }
                  </div>

                  {/* Details */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--c-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {o.title}
                      </span>
                      <StatusBadge status="active" />
                    </div>
                    {o.category && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--c-text-muted)', marginBottom: 4 }}>{o.category}</div>
                    )}
                    <div style={{ display: 'flex', gap: 16, fontSize: '0.8rem', color: 'var(--c-text-muted)', flexWrap: 'wrap' }}>
                      <span>🎟 {claimed} claimed</span>
                      <span>✅ {redeemed} redeemed</span>
                      {expires && <span>⏳ Ends {expires}</span>}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/offers/${o.id}/edit`)}>Edit</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/offers/${o.id}/stats`)}>Stats</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
