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
  const { active, result, offersBusinessId, dismiss } = useCheckInOverlay();
  const navigate = useNavigate();

  const variant = TIER_VARIANTS[result?.reward_tier] ?? TIER_VARIANTS.standard;
  const earned = (result?.points_awarded ?? 0) > 0;

  // Fire haptics + sound once per activation.
  useEffect(() => {
    if (!active) return;
    if (earned) {
      haptics.custom(variant.haptic);
      if (variant.sound === 'redeemed') sound.couponRedeemed();
      else sound.couponClaimed();
    } else {
      haptics.custom([30]);
    }
  }, [active, earned, variant]);

  const coins = useMemo(
    () => Array.from({ length: earned ? variant.coins : 0 }, (_, i) => ({
      id: i,
      left: `${(i * 37) % 100}%`,
      delay: `${(i % 6) * 90}ms`,
    })),
    [earned, variant.coins]
  );

  if (!active || !result) return null;

  const tierClass = result.reward_tier ? `tier-${result.reward_tier}` : '';

  function handleBrowse() {
    dismiss();
    navigate(`/business/${offersBusinessId}/offers`);
  }
  function handleDone() {
    dismiss();
    navigate('/home');
  }

  return (
    <div className={`po-backdrop ${earned ? tierClass : ''}`} role="dialog" aria-modal="true" aria-label={earned ? 'Points earned' : 'Already checked in today'}>
      {earned && (
        <div className="po-coins" aria-hidden="true">
          {coins.map((c) => (
            <span key={c.id} className="po-coin" style={{ left: c.left, animationDelay: c.delay }}>🪙</span>
          ))}
        </div>
      )}

      {earned ? (
        <>
          {variant.banner && <div className="po-banner">{variant.banner}</div>}
          <div className="po-points">+{result.points_awarded}</div>
          <div className="po-business">points at {result.business_name}</div>
        </>
      ) : (
        <>
          <div className="po-points" style={{ fontSize: '2.5rem' }}>👋</div>
          <div className="po-business">You're already checked in today at {result.business_name}</div>
          <div className="po-streak">Come back tomorrow to earn more.</div>
        </>
      )}

      {earned && result.tier_upgraded && (
        <div className="po-badge">⭐ {result.tier} tier unlocked!</div>
      )}
      {earned && result.streak > 1 && (
        <div className="po-streak">🔥 {result.streak}-day streak</div>
      )}
      {earned && Array.isArray(result.rewards_unlocked) && result.rewards_unlocked.map((r) => (
        <div className="po-unlock" key={r.id}>🎁 Reward unlocked: {r.name}</div>
      ))}
      {earned && result.collectable_unlocked && (
        <div className="po-unlock">🎪 {result.collectable_unlocked.name} unlocked!</div>
      )}

      <div className="po-actions">
        {offersBusinessId != null && (
          <button className="btn btn-primary btn-block btn-lg" onClick={handleBrowse}>
            See our latest offers
          </button>
        )}
        <button className="btn btn-ghost btn-block" onClick={handleDone}>Done</button>
      </div>
    </div>
  );
}
