import { useState, useEffect } from 'react';

function calc(expiresAt) {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt) - Date.now();
  if (diff <= 0) return { label: 'Expired', urgent: false, expired: true };

  const h   = Math.floor(diff / 3_600_000);
  const m   = Math.floor((diff % 3_600_000) / 60_000);
  const s   = Math.floor((diff % 60_000) / 1_000);
  const urgent = diff < 3 * 3_600_000; // < 3 hours

  let label;
  if (h >= 24) label = `${Math.floor(h / 24)}d left`;
  else if (h > 0) label = `${h}h ${m}m`;
  else label = `${m}m ${s}s`;

  return { label, urgent, expired: false, diffMs: diff };
}

/**
 * Returns { label, urgent, expired } that updates every second
 * while the deadline is within the next 3 hours, and every minute otherwise.
 */
export function useCountdown(expiresAt) {
  const [state, setState] = useState(() => calc(expiresAt));

  useEffect(() => {
    if (!expiresAt) return;

    const tick  = () => setState(calc(expiresAt));
    tick();

    // Check if < 3 hrs to decide tick rate
    const diff = new Date(expiresAt) - Date.now();
    const ms   = diff < 3 * 3_600_000 ? 1_000 : 60_000;
    const id   = setInterval(tick, ms);
    return () => clearInterval(id);
  }, [expiresAt]);

  return state;
}
