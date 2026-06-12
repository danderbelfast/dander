import React, { useEffect, useState } from 'react';
import { getLoyaltyCustomers } from '../api/business';
import { useToast } from '../context/ToastContext';
import { Spinner } from '../components/ui/Spinner';

function timeAgo(ts) {
  if (!ts) return '—';
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60_000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function Customers() {
  const { toast } = useToast();
  const [visits, setVisits]   = useState([]);
  const [summary, setSummary] = useState({ total_members: 0, visits_today: 0, points_today: 0 });
  const [top, setTop]         = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLoyaltyCustomers()
      .then((d) => {
        setVisits(d.visits || []);
        setSummary(d.summary || { total_members: 0, visits_today: 0, points_today: 0 });
        setTop(d.top_customer || null);
      })
      .catch(() => toast({ message: 'Failed to load customer visits.', type: 'error' }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><Spinner /></div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Customer Visits</h2>
        <p style={{ color: 'var(--c-text-muted)', fontSize: '0.88rem', marginTop: 4 }}>
          Recent loyalty visits captured by TapProve Node proximity detection.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <SummaryCard label="Loyalty members" value={summary.total_members} />
        <SummaryCard label="Visits today" value={summary.visits_today} />
        <SummaryCard label="Points awarded today" value={summary.points_today} />
        <SummaryCard
          label="Most loyal"
          value={top ? `${top.first_name} (${top.total_visits} visits)` : '—'}
          small
        />
      </div>

      <div className="card">
        <div className="card-body">
          {visits.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--c-text-muted)', fontSize: '0.88rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: 12, opacity: 0.3 }}>👋</div>
              No recognised customers yet — they'll appear here as soon as the TapProve Node spots a paired phone.
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Visit</th>
                    <th>Points</th>
                    <th>Time</th>
                    <th>GIF</th>
                  </tr>
                </thead>
                <tbody>
                  {visits.map((v) => (
                    <tr key={v.id}>
                      <td>{v.first_name || '—'}</td>
                      <td>#{v.visit_number ?? '—'}</td>
                      <td style={{ color: v.points_awarded > 0 ? '#1A9E58' : 'var(--c-text-muted)' }}>
                        +{v.points_awarded ?? 0}
                      </td>
                      <td style={{ color: 'var(--c-text-muted)', fontSize: '0.85rem' }}>{timeAgo(v.visited_at)}</td>
                      <td>
                        {v.gif_url
                          ? <img src={v.gif_url} alt="" style={{ width: 64, height: 36, objectFit: 'cover', borderRadius: 4 }} />
                          : <span style={{ color: 'var(--c-text-muted)', fontSize: '0.8rem' }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, small }) {
  return (
    <div className="card" style={{ margin: 0 }}>
      <div className="card-body" style={{ padding: 16 }}>
        <div style={{
          fontSize: small ? '1rem' : '1.6rem',
          fontWeight: 800,
          color: 'var(--c-text)',
        }}>
          {value}
        </div>
        <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--c-text-muted)', fontWeight: 600, marginTop: 4 }}>
          {label}
        </div>
      </div>
    </div>
  );
}
