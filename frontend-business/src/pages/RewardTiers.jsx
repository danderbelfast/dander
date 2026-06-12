import React, { useEffect, useState } from 'react';
import { getRewardTiers, updateRewardTiers } from '../api/business';
import { useToast } from '../context/ToastContext';
import { LoadingBlock } from '../components/ui/Spinner';

/**
 * RewardTiers — the dopamine system.
 *
 * Business sets a monthly budget for bronze/silver/gold prizes;
 * TapProve draws weighted-randomly on every nfc-checkin. Customer never
 * sees the remaining counts — only the surprise. The standard award
 * (10–50 points) is the always-on baseline.
 *
 * Save sends the four configurable points + three monthly_count
 * fields. _remaining is recomputed server-side on the next reset
 * (1st of each month, UTC) — except when monthly_count is reduced
 * below the current _remaining, in which case it's clamped immediately.
 */
export default function RewardTiers() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [tiers, setTiers]     = useState(null);

  useEffect(() => {
    getRewardTiers()
      .then((r) => setTiers(r.tiers))
      .catch(() => toast({ message: 'Failed to load reward tiers.', type: 'error' }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingBlock label="Loading reward tiers…" />;
  if (!tiers)  return <div className="card"><div className="card-body">No data.</div></div>;

  function set(key, value) {
    setTiers((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      const payload = {
        standard_points:      Number(tiers.standard_points),
        bronze_points:        Number(tiers.bronze_points),
        bronze_monthly_count: Number(tiers.bronze_monthly_count),
        silver_points:        Number(tiers.silver_points),
        silver_monthly_count: Number(tiers.silver_monthly_count),
        gold_points:          Number(tiers.gold_points),
        gold_monthly_count:   Number(tiers.gold_monthly_count),
      };
      const r = await updateRewardTiers(payload);
      setTiers(r.tiers);
      toast({ message: 'Reward tiers saved.', type: 'success' });
    } catch (err) {
      toast({
        message: err.response?.data?.message || 'Failed to save.',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  }

  // Rough upper-bound on monthly points spend if every prize gets drawn.
  // Standard is excluded — it's drawn on every other tap, unbounded.
  const monthlyPrizePoints =
    Number(tiers.bronze_points) * Number(tiers.bronze_monthly_count) +
    Number(tiers.silver_points) * Number(tiers.silver_monthly_count) +
    Number(tiers.gold_points)   * Number(tiers.gold_monthly_count);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Reward Tiers</h2>
        <p style={{ color: 'var(--c-text-muted)', fontSize: '0.88rem', marginTop: 4 }}>
          The variable reward system. Most taps award the standard amount;
          a few each month win bronze, silver, or gold. The customer never
          sees the remaining counts — every tap is a surprise.
        </p>
      </div>

      <div className="card">
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Section>
            <Header label="Standard" emoji="⚪" />
            <p style={subStyle}>Awarded on most taps. 10–50 points.</p>
            <div className="field">
              <label className="label">Points per tap</label>
              <input
                className="input"
                type="range"
                min="10" max="50" step="1"
                value={tiers.standard_points}
                onChange={(e) => set('standard_points', e.target.value)}
              />
              <div style={{ fontWeight: 700, marginTop: 6 }}>
                {tiers.standard_points} points
              </div>
            </div>
          </Section>

          <PrizeTier
            tierKey="bronze" tiers={tiers} set={set}
            emoji="🥉" label="Bronze" tint="rgba(205, 127, 50, 0.16)"
          />
          <PrizeTier
            tierKey="silver" tiers={tiers} set={set}
            emoji="🥈" label="Silver" tint="rgba(192, 192, 192, 0.22)"
          />
          <PrizeTier
            tierKey="gold" tiers={tiers} set={set}
            emoji="🥇" label="Gold" tint="rgba(245, 176, 65, 0.22)"
          />

          <div style={{ borderTop: '1px solid var(--c-border, rgba(0,0,0,0.08))', paddingTop: 16 }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--c-text-muted)', fontWeight: 600, letterSpacing: 0.5 }}>
              MONTHLY PRIZE COST (UPPER BOUND)
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: 4 }}>
              {monthlyPrizePoints.toLocaleString()} points
            </div>
            <p style={subStyle}>
              If every prize gets drawn (worst case). Standard awards are
              excluded — they're unbounded per month.
            </p>
          </div>

          <button
            className="btn btn-primary"
            onClick={save}
            disabled={saving}
            style={{ alignSelf: 'flex-start' }}
          >
            {saving ? 'Saving…' : 'Save reward tiers'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PrizeTier({ tierKey, tiers, set, emoji, label, tint }) {
  const pointsKey = `${tierKey}_points`;
  const monthlyKey = `${tierKey}_monthly_count`;
  const remaining = tiers[`${tierKey}_remaining`];
  const monthlyCount = Number(tiers[monthlyKey]) || 0;

  return (
    <Section tint={tint}>
      <Header label={label} emoji={emoji} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="field">
          <label className="label">Points per win</label>
          <input
            className="input"
            type="number"
            min="1" max="100000" step="1"
            value={tiers[pointsKey]}
            onChange={(e) => set(pointsKey, e.target.value)}
          />
        </div>
        <div className="field">
          <label className="label">Monthly pool size</label>
          <input
            className="input"
            type="number"
            min="0" max="1000" step="1"
            value={tiers[monthlyKey]}
            onChange={(e) => set(monthlyKey, e.target.value)}
          />
        </div>
      </div>
      <p style={subStyle}>
        Remaining this month: <strong>{remaining ?? 0} / {monthlyCount}</strong>
        {' · '}
        Resets on the 1st (UTC).
      </p>
    </Section>
  );
}

function Section({ children, tint }) {
  return (
    <div style={{
      padding: 16, borderRadius: 12,
      background: tint || 'rgba(0,0,0,0.02)',
      border: '1px solid var(--c-border, rgba(0,0,0,0.06))',
    }}>
      {children}
    </div>
  );
}

function Header({ label, emoji }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <span style={{ fontSize: '1.4rem' }}>{emoji}</span>
      <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>{label}</span>
    </div>
  );
}

const subStyle = {
  fontSize: '0.82rem',
  color: 'var(--c-text-muted)',
  marginTop: 6,
  marginBottom: 0,
};
