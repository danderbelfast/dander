import React, { useEffect, useState } from 'react';
import { getLoyaltyStatus, getLoyaltyHistory } from '../api/offers';
import { Spinner } from '../components/ui/Spinner';

const TIER_CONFIG = {
  bronze:   { color: '#CD7F32', label: 'Bronze',   emoji: '🥉' },
  silver:   { color: '#9CA3AF', label: 'Silver',   emoji: '🥈' },
  gold:     { color: '#EAB308', label: 'Gold',     emoji: '🥇' },
  platinum: { color: '#8B5CF6', label: 'Platinum', emoji: '💎' },
};

const REWARD_ICONS = {
  badge: '🏅',
  discount: '🎫',
  freebie: '🎁',
  premium_deal: '⭐',
};

export default function Rewards() {
  const [loyalty, setLoyalty]   = useState(null);
  const [history, setHistory]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    Promise.all([getLoyaltyStatus(), getLoyaltyHistory()])
      .then(([lData, hData]) => {
        setLoyalty(lData.loyalty);
        setHistory(hData.history || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
      <Spinner />
    </div>
  );

  if (!loyalty) return (
    <div style={{ padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: '2rem', marginBottom: 12 }}>⭐</div>
      <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 6 }}>Start earning rewards</div>
      <div style={{ color: 'var(--c-text-muted)', fontSize: '0.88rem' }}>
        Claim and redeem deals to earn points toward free rewards.
      </div>
    </div>
  );

  const tier = TIER_CONFIG[loyalty.tier] || TIER_CONFIG.bronze;
  const next = loyalty.next_milestone;
  const milestones = loyalty.milestones || [];

  return (
    <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Tier card */}
      <div style={{
        background: `linear-gradient(135deg, ${tier.color}22, ${tier.color}08)`,
        border: `1.5px solid ${tier.color}44`,
        borderRadius: 16, padding: '24px 20px', textAlign: 'center',
      }}>
        <div style={{ fontSize: '2.2rem', marginBottom: 4 }}>{tier.emoji}</div>
        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: tier.color }}>{tier.label} Member</div>
        <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: 8 }}>
          £{loyalty.total_saved_gbp.toFixed(2)}
        </div>
        <div style={{ fontSize: '0.82rem', color: 'var(--c-text-muted)' }}>total saved with Dander</div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 16 }}>
          <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{loyalty.total_points}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--c-text-muted)' }}>points</div>
          </div>
          <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{loyalty.lifetime_points}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--c-text-muted)' }}>lifetime</div>
          </div>
        </div>
      </div>

      {/* Progress to next milestone */}
      {next && (
        <div style={{ background: 'var(--c-surface)', borderRadius: 12, padding: '16px 18px', border: '1px solid var(--c-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Next reward: {next.title}</span>
            <span style={{ fontSize: '0.78rem', color: 'var(--c-text-muted)' }}>£{next.remaining_gbp} to go</span>
          </div>
          <div style={{ height: 8, background: 'var(--c-border)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: 8, borderRadius: 4,
              width: `${Math.min(100, next.progress_pct)}%`,
              background: 'var(--c-primary)',
              transition: 'width 0.5s ease',
            }} />
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--c-text-muted)', marginTop: 4, textAlign: 'right' }}>
            {next.progress_pct}%
          </div>
        </div>
      )}

      {/* Milestones */}
      <div>
        <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 12 }}>Milestones</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {milestones.map(m => (
            <div key={m.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px', borderRadius: 10,
              background: m.unlocked ? 'var(--c-surface)' : 'var(--c-bg)',
              border: `1px solid ${m.unlocked ? 'var(--c-primary)' : 'var(--c-border)'}`,
              opacity: m.unlocked ? 1 : 0.6,
            }}>
              <span style={{ fontSize: '1.4rem' }}>{REWARD_ICONS[m.reward_type] || '🎁'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                  {m.title}
                  {m.unlocked && <span style={{ marginLeft: 6, color: 'var(--c-primary)', fontSize: '0.72rem' }}>✓ UNLOCKED</span>}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--c-text-muted)' }}>{m.description}</div>
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--c-text-muted)', whiteSpace: 'nowrap' }}>
                £{parseFloat(m.threshold_gbp).toFixed(0)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div>
          <button onClick={() => setShowHistory(!showHistory)}
            style={{ fontWeight: 600, fontSize: '0.88rem', background: 'none', border: 'none', color: 'var(--c-primary)', cursor: 'pointer', padding: 0 }}>
            {showHistory ? '▼' : '▶'} Points history ({history.length})
          </button>
          {showHistory && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {history.map(h => (
                <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--c-border)' }}>
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 500 }}>{h.description}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--c-text-muted)' }}>
                      {new Date(h.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </div>
                  </div>
                  <span style={{ fontWeight: 700, fontSize: '0.88rem', color: h.type === 'earn' ? '#16A34A' : '#E85D26' }}>
                    {h.type === 'earn' ? '+' : '-'}{h.points} pts
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
