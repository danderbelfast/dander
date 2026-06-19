import React, { useEffect, useState } from 'react';
import { getComplianceStatus, acceptComplianceSignage } from '../api/business';

/**
 * ComplianceGate — non-skippable signage-acceptance step shown before
 * a business can activate their first node (or after a signage
 * version bump that's been issued since their last acceptance).
 *
 * Behaviour:
 *   - Mounts as a portal-style overlay above the sensors page when
 *     the backend reports accepted_current === false.
 *   - Renders the country-appropriate signage label + a "View signage
 *     in a new tab" link.
 *   - The "I will display this signage where my sensors operate"
 *     checkbox is required to enable the Accept button.
 *   - Accept POSTs to /api/business/compliance/accept-signage,
 *     re-checks status, and unmounts the modal when accepted_current
 *     flips to true.
 *   - On error, surfaces the message inline and keeps the modal up
 *     so the operator can retry.
 *
 * The gate accepts onAccepted as a prop so the parent (MySensors)
 * can refresh any data that was waiting on acceptance.
 */
export default function ComplianceGate({ onAccepted }) {
  const [status, setStatus]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [viewedSignage, setViewedSignage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState(null);

  useEffect(() => {
    let cancelled = false;
    getComplianceStatus()
      .then((d) => { if (!cancelled) setStatus(d); })
      .catch((err) => { if (!cancelled) setError(err?.response?.data?.message || 'Failed to load compliance status.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return null;
  if (!status) return null;
  // If they're already up to date, nothing to render.
  if (status.accepted_current) return null;

  const country  = status.country_code || 'GB';
  const signage  = status.signage || {};
  const signUrl  = signage.download_url;
  const label    = signage.label || `Country: ${country}`;

  async function handleAccept() {
    if (!confirmed) return;
    setSubmitting(true);
    setError(null);
    try {
      await acceptComplianceSignage();
      const fresh = await getComplianceStatus();
      setStatus(fresh);
      if (fresh.accepted_current) {
        if (typeof onAccepted === 'function') onAccepted(fresh);
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not record acceptance. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function openSignage() {
    if (!signUrl) return;
    window.open(signUrl, '_blank', 'noopener,noreferrer');
    setViewedSignage(true);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: '#fff', borderRadius: 12,
        maxWidth: 560, width: '100%',
        padding: '28px 28px 24px', boxShadow: 'var(--shadow-lg)',
      }}>
        <div style={{
          background: '#FEF3C7', color: '#78350F',
          padding: '6px 12px', borderRadius: 6,
          fontSize: '0.72rem', fontWeight: 700,
          letterSpacing: '0.06em', textTransform: 'uppercase',
          display: 'inline-block', marginBottom: 14,
        }}>
          Required before activating your first sensor
        </div>

        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 8px' }}>
          Display the privacy signage
        </h2>

        <p style={{ fontSize: '0.92rem', color: 'var(--c-text-muted)', lineHeight: 1.55, marginBottom: 14 }}>
          GDPR and equivalent privacy laws require you to inform visitors that sensors are
          measuring footfall on the premises. TapProve provides a print-ready sign tailored
          to your country&rsquo;s rules. Download it, print it, and display it where your sensors
          operate (typically the entrance and the till).
        </p>

        <div style={{
          background: '#0f1115', color: '#fff',
          borderRadius: 8, padding: '14px 18px', marginBottom: 14,
        }}>
          <div style={{ fontSize: '0.72rem', color: '#9aa4b1', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Signage for your country
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, marginTop: 4 }}>{label}</div>
          {signage.version && (
            <div style={{ fontSize: '0.78rem', color: '#9aa4b1', marginTop: 2 }}>
              Version: {signage.version}
            </div>
          )}
        </div>

        {signUrl ? (
          <button
            type="button"
            onClick={openSignage}
            className="btn btn-secondary"
            style={{ marginBottom: 14 }}
          >
            View signage in new tab
          </button>
        ) : (
          <p style={{ color: 'var(--c-danger)', fontSize: '0.86rem', marginBottom: 14 }}>
            No signage configured for country &ldquo;{country}&rdquo;.
            Contact <a href="mailto:support@tapprove.io">support@tapprove.io</a> before continuing.
          </p>
        )}

        <label style={{
          display: 'flex', gap: 10, alignItems: 'flex-start',
          padding: '12px 14px', background: 'var(--c-bg-muted)',
          borderRadius: 6, marginBottom: 14, cursor: 'pointer',
          fontSize: '0.92rem', lineHeight: 1.4,
        }}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            I will display the provided privacy signage where my sensors operate.
            {!viewedSignage && signUrl && (
              <span style={{ color: 'var(--c-text-muted)', fontSize: '0.82rem', display: 'block', marginTop: 4 }}>
                Please open the signage at least once before accepting.
              </span>
            )}
          </span>
        </label>

        {error && (
          <div style={{
            color: 'var(--c-danger)', fontSize: '0.86rem',
            background: 'var(--c-danger-light)', padding: '8px 12px',
            borderRadius: 6, marginBottom: 14,
          }}>
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleAccept}
          disabled={!confirmed || !signUrl || (!viewedSignage && !!signUrl) || submitting}
          className="btn btn-primary"
          style={{ width: '100%' }}
        >
          {submitting ? 'Recording acceptance…' : 'Accept and continue'}
        </button>

        <p style={{ fontSize: '0.76rem', color: 'var(--c-text-muted)', textAlign: 'center', marginTop: 12 }}>
          Your acceptance is logged with your name, the time, and the signage version for
          our audit records.
        </p>
      </div>
    </div>
  );
}
