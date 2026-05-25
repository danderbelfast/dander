import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getMonthlyLeaderboard, getMyLeaderboard } from '../api/offers';
import { Spinner } from '../components/ui/Spinner';

/* ---------------------------------------------------------------------------
   Leaderboard.jsx — simple monthly leaderboard.
   Source of truth: points_transactions (the canonical ledger).
--------------------------------------------------------------------------- */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function daysUntilReset() {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return Math.ceil((next - now) / (1000 * 60 * 60 * 24));
}

function fmt(n) { return Number(n || 0).toLocaleString(); }

export default function Leaderboard() {
  const { user } = useAuth();
  const [tab, setTab]               = useState('monthly');
  const [board, setBoard]           = useState([]);
  const [me, setMe]                 = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([getMonthlyLeaderboard(), getMyLeaderboard()])
      .then(([b, m]) => {
        setBoard(b.leaderboard || []);
        setMe(m.me || null);
      })
      .catch(() => setError('Failed to load the leaderboard. Please try again.'))
      .finally(() => setLoading(false));
  }, []);

  const now = new Date();
  const monthLabel = `${MONTH_NAMES[now.getUTCMonth()]} ${now.getUTCFullYear()}`;
  const resetIn = daysUntilReset();

  return (
    <div style={{ paddingBottom: 80 }}>
      <header style={{ padding: '16px 16px 8px' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Belfast Leaderboard</h1>
        <div style={{ fontSize: '0.85rem', color: 'var(--c-text-muted)', marginTop: 4 }}>
          {monthLabel} — resets in {resetIn} day{resetIn === 1 ? '' : 's'}
        </div>
      </header>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, padding: '0 12px', borderBottom: '1px solid var(--c-border)' }}>
        {[
          { key: 'monthly',  label: 'Monthly',  enabled: true  },
          { key: 'friends',  label: 'Friends',  enabled: false },
          { key: 'all_time', label: 'All Time', enabled: false },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => t.enabled && setTab(t.key)}
            disabled={!t.enabled}
            style={{
              flex: 1, padding: '10px 6px', background: 'none', border: 'none',
              borderBottom: tab === t.key ? '2px solid var(--c-primary)' : '2px solid transparent',
              fontSize: '0.86rem', fontWeight: tab === t.key ? 700 : 500,
              color: !t.enabled ? 'var(--c-text-dim)' : tab === t.key ? 'var(--c-primary)' : 'var(--c-text)',
              cursor: t.enabled ? 'pointer' : 'not-allowed',
            }}
          >
            {t.label}
            {!t.enabled && <span style={{ fontSize: '0.65rem', display: 'block', opacity: 0.7 }}>coming soon</span>}
          </button>
        ))}
      </div>

      {/* My ranking card */}
      {!loading && me && (
        <div style={{
          margin: '14px 12px 8px', padding: 14, borderRadius: 'var(--r-lg)',
          background: 'var(--c-primary)', color: '#fff',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.85 }}>
              Your rank
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, lineHeight: 1 }}>
              {me.rank ? `#${me.rank}` : '—'}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: '0.78rem' }}>
            <Stat label="Points"   value={fmt(me.points_this_month)} />
            <Stat label="Steps"    value={fmt(me.steps_this_month)} />
            <Stat label="Networks" value={fmt(me.wifi_networks_this_month)} />
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
      ) : error ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--c-danger)', fontSize: '0.88rem' }}>{error}</div>
      ) : tab !== 'monthly' ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--c-text-muted)', fontSize: '0.88rem' }}>
          Coming soon.
        </div>
      ) : board.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--c-text-muted)', fontSize: '0.88rem' }}>
          No one has earned points yet this month — be the first!
        </div>
      ) : (
        <div style={{ padding: '4px 8px 24px' }}>
          {board.map((row) => {
            const isMe = row.user_id === user?.id;
            return (
              <div key={row.user_id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px', borderRadius: 'var(--r-md)',
                background: isMe ? 'var(--c-bg-muted)' : 'transparent',
                border: isMe ? '1px solid var(--c-primary)' : '1px solid transparent',
                marginBottom: 4,
              }}>
                <div style={{
                  width: 32, textAlign: 'right',
                  fontWeight: 700, fontSize: '0.95rem',
                  color: row.rank <= 3 ? 'var(--c-primary)' : 'var(--c-text-muted)',
                }}>
                  {row.rank}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.92rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.display_name}{isMe ? ' (you)' : ''}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--c-text-muted)' }}>
                    {fmt(row.steps_this_month)} steps · {fmt(row.wifi_networks_this_month)} networks
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{fmt(row.points_this_month)}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--c-text-muted)' }}>pts</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ opacity: 0.85, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: '1rem', fontWeight: 700, marginTop: 2 }}>{value}</div>
    </div>
  );
}
