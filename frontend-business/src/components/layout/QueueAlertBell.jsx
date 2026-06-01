import React, { useEffect, useRef, useState } from 'react';
import {
  getQueueAlerts, getQueueAlertCount, acknowledgeQueueAlert,
} from '../../api/business';

// Polling cadences (per spec).
const COUNT_POLL_MS = 30_000;
const LIST_POLL_MS  = 15_000;

function minutesAgo(ts) {
  if (!ts) return '';
  const ms = Date.now() - new Date(ts).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m === 1) return '1 minute ago';
  if (m < 60) return `${m} minutes ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

/**
 * QueueAlertBell — header bell + alerts dropdown.
 *
 * Always polls the lightweight /count endpoint every 30s for the badge.
 * The expensive /list endpoint is only polled (every 15s) while the
 * panel is open. Closing the panel stops the list poll immediately.
 */
export function QueueAlertBell() {
  const [count,   setCount]   = useState(0);
  const [open,    setOpen]    = useState(false);
  const [alerts,  setAlerts]  = useState([]);
  const [loading, setLoading] = useState(false);
  const [acking,  setAcking]  = useState(null);
  const panelRef = useRef(null);
  const btnRef   = useRef(null);

  // Badge poll — always running.
  useEffect(() => {
    let cancelled = false;
    let timer;

    const load = () => {
      getQueueAlertCount()
        .then((d) => { if (!cancelled) setCount(d.count || 0); })
        .catch(() => {});
    };

    load();
    timer = setInterval(load, COUNT_POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  // List poll — only while open.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    let timer;

    const load = (initial) => {
      if (initial) setLoading(true);
      getQueueAlerts()
        .then((d) => {
          if (cancelled) return;
          setAlerts(d.alerts || []);
          setCount((d.alerts || []).length);
        })
        .catch(() => {})
        .finally(() => { if (initial && !cancelled) setLoading(false); });
    };

    load(true);
    timer = setInterval(() => load(false), LIST_POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [open]);

  // Click-away close.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (panelRef.current?.contains(e.target)) return;
      if (btnRef.current?.contains(e.target))   return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  async function acknowledge(id) {
    setAcking(id);
    try {
      await acknowledgeQueueAlert(id);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
      setCount((c) => Math.max(0, c - 1));
    } catch {
      // Leave it on the list — next poll will reconcile if it succeeded server-side.
    }
    setAcking(null);
  }

  const hasAlerts = count > 0;

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Queue alerts (${count})`}
        title={hasAlerts ? `${count} queue alert${count === 1 ? '' : 's'}` : 'No queue alerts'}
        style={{
          position: 'relative',
          background: 'transparent',
          border: 'none',
          padding: '6px 8px',
          cursor: 'pointer',
          fontSize: '1.3rem',
          lineHeight: 1,
          color: hasAlerts ? '#FF5252' : 'var(--c-text)',
          animation: hasAlerts ? 'queueBellPulse 1.4s ease-in-out infinite' : 'none',
        }}
      >
        🔔
        {hasAlerts && (
          <span
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              minWidth: 18,
              height: 18,
              padding: '0 5px',
              borderRadius: 999,
              background: '#FF5252',
              color: '#FFF',
              fontSize: '0.7rem',
              fontWeight: 700,
              lineHeight: '18px',
              textAlign: 'center',
            }}
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 360,
            maxWidth: 'calc(100vw - 24px)',
            background: '#FFFFFF',
            border: '1px solid #E5E7EB',
            borderRadius: 8,
            boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
            zIndex: 1000,
            overflow: 'hidden',
          }}
        >
          <div style={{
            padding: '12px 14px',
            borderBottom: '1px solid #E5E7EB',
            fontWeight: 700,
            fontSize: '0.95rem',
          }}>
            Queue Alerts
          </div>

          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {loading && alerts.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--c-text-muted)', fontSize: '0.85rem' }}>
                Loading…
              </div>
            ) : alerts.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--c-text-muted)', fontSize: '0.88rem' }}>
                No active queue alerts ✓
              </div>
            ) : (
              alerts.map((a) => (
                <div
                  key={a.id}
                  style={{
                    padding: '12px 14px',
                    borderBottom: '1px solid #F1F3F5',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{a.zone_name || 'Unnamed zone'}</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--c-text)', marginTop: 2 }}>
                      {a.queue_depth} people in queue
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--c-text-muted)', marginTop: 2 }}>
                      {minutesAgo(a.alerted_at)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => acknowledge(a.id)}
                    disabled={acking === a.id}
                    style={{ flexShrink: 0 }}
                  >
                    {acking === a.id ? '…' : 'Acknowledge'}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes queueBellPulse {
          0%, 100% { transform: scale(1);   }
          50%      { transform: scale(1.18);}
        }
      `}</style>
    </div>
  );
}
