import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCheckInOverlay } from '../../context/CheckInOverlayProvider';
import * as haptics from '../../services/hapticService';
import * as sound from '../../services/soundService';
import './PointsOverlay.css';

const TIER_VARIANTS = {
  standard: { banner: null,        coins: 6,  haptic: [40],            sound: 'claimed'  },
  bronze:   { banner: 'Lucky!',    coins: 12, haptic: [60, 40, 60],    sound: 'claimed'  },
  silver:   { banner: 'Amazing!',  coins: 20, haptic: [80, 40, 80],    sound: 'redeemed' },
  gold:     { banner: 'JACKPOT!',  coins: 28, haptic: [100,50,100,50,100], sound: 'redeemed' },
};

export default function PointsOverlay() {
  const { active, result, offer, dismiss } = useCheckInOverlay();
  const navigate = useNavigate();

  const variant = TIER_VARIANTS[result?.reward_tier] ?? TIER_VARIANTS.standard;

  // Fire haptics + sound once per activation.
  useEffect(() => {
    if (!active) return;
    haptics.custom(variant.haptic);
    if (variant.sound === 'redeemed') sound.couponRedeemed();
    else sound.couponClaimed();
  }, [active, variant]);

  const coins = useMemo(
    () => Array.from({ length: variant.coins }, (_, i) => ({
      id: i,
      left: `${(i * 37) % 100}%`,
      delay: `${(i % 6) * 90}ms`,
    })),
    [variant.coins]
  );

  if (!active || !result) return null;

  const tierClass = result.reward_tier ? `tier-${result.reward_tier}` : '';

  function handleBrowse() {
    dismiss();
    navigate(`/offer/${offer.id}`);
  }
  function handleDone() {
    dismiss();
    navigate('/home');
  }

  return (
    <div className={`po-backdrop ${tierClass}`} role="dialog" aria-label="Points earned">
      <div className="po-coins" aria-hidden="true">
        {coins.map((c) => (
          <span key={c.id} className="po-coin" style={{ left: c.left, animationDelay: c.delay }}>🪙</span>
        ))}
      </div>

      {variant.banner && <div className="po-banner">{variant.banner}</div>}
      <div className="po-points">+{result.points_awarded}</div>
      <div className="po-business">points at {result.business_name}</div>

      {result.tier_upgraded && (
        <div className="po-badge">⭐ {result.tier} tier unlocked!</div>
      )}
      {result.streak > 1 && (
        <div className="po-streak">🔥 {result.streak}-day streak</div>
      )}
      {Array.isArray(result.rewards_unlocked) && result.rewards_unlocked.map((r) => (
        <div className="po-unlock" key={r.id}>🎁 Reward unlocked: {r.name}</div>
      ))}
      {result.collectable_unlocked && (
        <div className="po-unlock">🎪 {result.collectable_unlocked.name} unlocked!</div>
      )}

      <div className="po-actions">
        {offer && (
          <button className="btn btn-primary btn-block btn-lg" onClick={handleBrowse}>
            Browse our latest offers
          </button>
        )}
        <button className="btn btn-ghost btn-block" onClick={handleDone}>Done</button>
      </div>
    </div>
  );
}
