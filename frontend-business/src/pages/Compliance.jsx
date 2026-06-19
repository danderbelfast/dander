import React, { useEffect, useState } from 'react';
import { getComplianceStatus } from '../api/business';
import { Spinner } from '../components/ui/Spinner';

/**
 * Compliance.jsx — Legal & Compliance hub for the business dashboard.
 *
 * Four sections:
 *   1. App permissions explained
 *   2. What anonymised data we collect + how
 *   3. How the data is used (and the forward-looking aggregate-sale note)
 *   4. Country-specific privacy signage download
 *
 * IMPORTANT: every paragraph in sections 1–3 is marked PLACEHOLDER.
 * The wording is derived from the audit findings but is intended for
 * solicitor review before launch. Replace `placeholder` strings with
 * the legally-reviewed equivalents.
 */

// ─── Placeholder copy ─────────────────────────────────────────
// All copy in this file is marked with this tag so it's grep-able
// at solicitor-review time. Visible on the rendered page too via the
// PlaceholderTag component.
const PLACEHOLDER = '[PLACEHOLDER — needs solicitor review]';

const NODE_APP_PERMISSIONS = [
  { permission: 'Camera',     reason: 'On-device people counting (counts only — no video recorded, no faces stored).' },
  { permission: 'Microphone', reason: 'Ambient noise level in decibels (no audio recorded, no conversation processed).' },
  { permission: 'Bluetooth',  reason: 'Counts nearby devices to estimate busyness. MAC addresses are hashed on-device with a per-business secret before transmission.' },
  { permission: 'Wi-Fi',      reason: 'Counts visible networks to estimate busyness. SSIDs and BSSIDs are discarded immediately on the device.' },
  { permission: 'Location',   reason: 'Not requested by the node app — node position is fixed at installation, no GPS reads needed.' },
  { permission: 'NFC',        reason: 'Allows customer phones to tap the node to start a loyalty interaction. One-directional — no data read from the customer phone.' },
  { permission: 'Network',    reason: 'Uploads aggregated counts to TapProve every ~60 seconds while open. HTTPS / TLS 1.3.' },
];

const CUSTOMER_APP_PERMISSIONS = [
  { permission: 'Location (optional)',     reason: 'So the app can show nearby offers and recognise the customer when they arrive at a venue. Customer can decline at install and revoke later.' },
  { permission: 'Bluetooth',               reason: 'Allows the app to broadcast a short-range signal to TapProve nodes so the customer is greeted by name (if they\'ve opted in). The signal is anonymous to anyone other than TapProve.' },
  { permission: 'Notifications',           reason: 'Loyalty-points alerts, expiring-coupon reminders, business announcements. Customer can decline at install and per-category in Settings.' },
  { permission: 'Camera (optional)',       reason: 'For scanning QR-code coupons. Photos are not stored — the QR code is decoded in memory and discarded.' },
  { permission: 'Activity recognition',    reason: 'Step count for "active customer" rewards. Steps are read from the OS; raw movement data never leaves the device.' },
  { permission: 'Storage / photos',        reason: 'For uploading a profile avatar (optional). The customer picks the file; the app does not scan the gallery.' },
];

const DATA_TYPES = [
  { name: 'People in/out counts',          form: 'Aggregate counts',                  anonymised: 'On-device, counts only — frames never leave the device' },
  { name: 'Bluetooth device counts',       form: 'Aggregate count + brand-bucket counts (Apple / Samsung / etc.)', anonymised: 'OUI lookup on-device; randomised MACs short-circuited to "unknown" before counting' },
  { name: 'Bluetooth per-device sightings', form: 'Per-device hashed identifier + signal strength', anonymised: 'On-device SHA-256 with a per-business secret salt; the original MAC never leaves the node' },
  { name: 'Wi-Fi network count',           form: 'Single count per scan window',     anonymised: 'On-device — SSIDs and BSSIDs are discarded immediately after counting' },
  { name: 'Ambient noise',                 form: 'Decibel scalar + label (quiet / moderate / busy)', anonymised: 'On-device — audio buffer reduced to dB, no audio ever recorded' },
  { name: 'Ambient light',                 form: 'Lux scalar',                        anonymised: 'Environmental reading — no personal data involved' },
  { name: 'Queue depth / queue alerts',    form: 'Integer + boolean',                anonymised: 'Derived on-device from the camera people-counter' },
];

// ─── Components ───────────────────────────────────────────────

function PlaceholderTag() {
  return (
    <span style={{
      display: 'inline-block',
      background: '#FEF3C7',
      color: '#92400E',
      padding: '1px 8px',
      borderRadius: 4,
      fontSize: '0.7rem',
      fontWeight: 700,
      letterSpacing: '0.04em',
      marginRight: 6,
      textTransform: 'uppercase',
    }}>
      Placeholder
    </span>
  );
}

function Section({ title, children }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <span className="card-title">{title}</span>
      </div>
      <div className="card-body" style={{ fontSize: '0.92rem', lineHeight: 1.5 }}>
        {children}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────

export default function Compliance() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getComplianceStatus()
      .then((d) => setStatus(d))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spinner />
      </div>
    );
  }

  const country = status?.country_code || 'GB';
  const signage = status?.signage || {};

  return (
    <div style={{ maxWidth: 880, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ marginBottom: 8 }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Legal &amp; Compliance</h2>
        <p style={{ color: 'var(--c-text-muted)', fontSize: '0.88rem', marginTop: 4 }}>
          What TapProve collects, how it&rsquo;s anonymised, and the privacy signage you need to display.
        </p>
      </div>

      <div style={{
        background: '#FEF3C7', color: '#78350F',
        border: '1px solid #FBBF24', borderRadius: 6,
        padding: '10px 14px', fontSize: '0.84rem', marginBottom: 12,
      }}>
        <strong>Placeholder copy.</strong> The wording on this page is engineering placeholder
        text awaiting solicitor review. Do not rely on it as legal advice for your business.
        Final copy will replace these sections before launch.
      </div>

      {/* ─── 1. App permissions ─── */}
      <Section title="1. App permissions explained">
        <p><PlaceholderTag />{PLACEHOLDER} The TapProve Node Android app and the TapProve customer
        app request the following device permissions. Each permission is used only for the purpose
        listed and nothing else.</p>

        <h4 style={{ marginTop: 14, marginBottom: 6, fontSize: '0.95rem' }}>Node app (in-venue sensor)</h4>
        <table className="table" style={{ fontSize: '0.86rem' }}>
          <thead><tr><th>Permission</th><th>Used for</th></tr></thead>
          <tbody>
            {NODE_APP_PERMISSIONS.map((p) => (
              <tr key={p.permission}><td><strong>{p.permission}</strong></td><td>{p.reason}</td></tr>
            ))}
          </tbody>
        </table>

        <h4 style={{ marginTop: 18, marginBottom: 6, fontSize: '0.95rem' }}>Customer app (loyalty user)</h4>
        <table className="table" style={{ fontSize: '0.86rem' }}>
          <thead><tr><th>Permission</th><th>Used for</th></tr></thead>
          <tbody>
            {CUSTOMER_APP_PERMISSIONS.map((p) => (
              <tr key={p.permission}><td><strong>{p.permission}</strong></td><td>{p.reason}</td></tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* ─── 2. What anonymised data we collect ─── */}
      <Section title="2. What anonymised data we collect">
        <p><PlaceholderTag />{PLACEHOLDER} TapProve&rsquo;s sensors are designed so that nothing
        personally identifiable about a visitor ever leaves the device. Everything below is
        aggregated or anonymised before it&rsquo;s transmitted.</p>
        <table className="table" style={{ fontSize: '0.86rem' }}>
          <thead>
            <tr>
              <th>Data type</th>
              <th>Form transmitted</th>
              <th>Anonymised how</th>
            </tr>
          </thead>
          <tbody>
            {DATA_TYPES.map((d) => (
              <tr key={d.name}>
                <td><strong>{d.name}</strong></td>
                <td>{d.form}</td>
                <td>{d.anonymised}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ marginTop: 14 }}>
          <PlaceholderTag />{PLACEHOLDER} What we never collect: video, photos, audio recordings,
          raw Bluetooth or Wi-Fi MAC addresses, customer names, customer faces, gender, age,
          or any identifier that links a customer across venues.
        </p>
      </Section>

      {/* ─── 3. How the data is used ─── */}
      <Section title="3. How the data is used">
        <p><PlaceholderTag />{PLACEHOLDER} <strong>For your business:</strong> aggregate counts power
        the Real-Time and Overview tabs in Analytics, the Live Zones view, and the historic Reports
        you can export. This is your data, used by you, in your own dashboard.</p>

        <p><PlaceholderTag />{PLACEHOLDER} <strong>Benchmarks across TapProve businesses:</strong>
        we compute industry-anonymous benchmarks (e.g. &ldquo;average dwell time across cafés in
        Belfast city centre&rdquo;) by aggregating across multiple businesses. Your venue&rsquo;s
        figures are never individually exposed in these benchmarks — only the cohort mean.</p>

        <p><PlaceholderTag />{PLACEHOLDER} <strong>Future external sharing:</strong> aggregate
        anonymised footfall and dwell data may, in future, be shared with or sold to third
        parties such as local councils, town planning bodies, or academic researchers. Any such
        sharing involves only zone-hour-level aggregated counts — never personal data, never
        loyalty-user information, never anything that could identify an individual venue or
        customer. This forward-looking arrangement is disclosed here for transparency; the
        privacy signage you display also references it.</p>
      </Section>

      {/* ─── 4. Signage download ─── */}
      <Section title="4. Privacy signage for your country">
        <div style={{
          background: '#0f1115', color: '#fff',
          borderRadius: 8, padding: '16px 20px',
        }}>
          <div style={{ fontSize: '0.78rem', color: '#9aa4b1', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Your country
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, marginTop: 4 }}>
            {signage.label || `${country} — (no signage configured)`}
          </div>
          <div style={{ fontSize: '0.82rem', color: '#9aa4b1', marginTop: 4 }}>
            Version: {signage.version || '—'}
          </div>
        </div>

        <p style={{ marginTop: 16 }}>
          <PlaceholderTag />{PLACEHOLDER} Download and display this sign wherever a TapProve
          sensor is operating — typically at the entrance and at the till. The sign is sized
          for printing on A5 or A4. If you operate in more than one country, contact support
          to receive each country&rsquo;s sign.
        </p>

        {signage.download_url ? (
          <a
            href={signage.download_url}
            target="_blank" rel="noopener noreferrer"
            className="btn btn-primary"
            style={{ marginTop: 8 }}
          >
            Download privacy sign ({country})
          </a>
        ) : (
          <p style={{ color: 'var(--c-text-muted)', fontStyle: 'italic' }}>
            No privacy signage is currently configured for country code &ldquo;{country}&rdquo;.
            Contact <a href="mailto:support@tapprove.io">support@tapprove.io</a>.
          </p>
        )}

        {status?.last_accepted_at && (
          <div style={{
            marginTop: 18, padding: '10px 14px',
            background: 'var(--c-bg-muted)', border: '1px solid var(--c-border)',
            borderRadius: 6, fontSize: '0.85rem',
          }}>
            <strong>Acceptance recorded:</strong>{' '}
            you accepted signage version <code>{status.last_accepted_version}</code> on{' '}
            {new Date(status.last_accepted_at).toLocaleString('en-GB')}.
            {!status.accepted_current && (
              <span style={{ color: '#92400E', marginLeft: 6 }}>
                — A newer version is now available; please re-accept.
              </span>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}
