import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Privacy notice for the TapProve customer-facing platform.
 *
 * Covers the GDPR Article 13 / 14 "tell people they're being measured"
 * obligation for both:
 *   - Visitors to a TapProve-equipped venue who don't have the app
 *     (the in-store sensor side — counted by the kiosk)
 *   - TapProve loyalty-app users (the registered side — name, email,
 *     points, location, etc.)
 *
 * The wording is intentionally plain so a non-technical reader can
 * understand what's collected and why. The legal-bases column lists
 * the GDPR Article 6 ground for each processing activity.
 */

const SECTION = {
  background: '#0f1115',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  padding: '20px 24px',
  marginBottom: 16,
};
const H2 = { fontSize: 18, fontWeight: 700, color: '#FF6B35', marginBottom: 8, marginTop: 0 };
const H3 = { fontSize: 15, fontWeight: 700, color: '#fff', marginTop: 14, marginBottom: 4 };
const P  = { fontSize: 14, lineHeight: 1.55, color: '#cfd6df', margin: '4px 0' };
const SMALL = { fontSize: 12, color: '#9aa4b1', marginTop: 6 };

export default function Privacy() {
  return (
    <div style={{
      minHeight: '100vh', background: '#0a0d12', color: '#fff',
      padding: '24px 16px', maxWidth: 760, margin: '0 auto',
      font: '15px/1.55 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif',
    }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, marginTop: 8, marginBottom: 4 }}>
        Privacy Notice
      </h1>
      <p style={{ ...P, color: '#9aa4b1', marginBottom: 18 }}>
        How TapProve collects and uses information about visitors to TapProve-equipped
        venues, and about registered TapProve loyalty users.
      </p>

      <div style={SECTION}>
        <h2 style={H2}>1. Who we are</h2>
        <p style={P}>
          <strong>TapProve</strong> provides retail and hospitality businesses with
          footfall analytics and a customer loyalty platform. If you have questions
          about this notice or want to exercise any data right described below,
          contact us at <a href="mailto:support@tapprove.io" style={{ color: '#FF6B35' }}>support@tapprove.io</a>.
        </p>
      </div>

      <div style={SECTION}>
        <h2 style={H2}>2. If you visit a TapProve venue (you don't need to have our app)</h2>
        <p style={P}>
          Each TapProve venue has one or more small sensor devices (we call them <em>nodes</em>)
          counting visitors and measuring the environment. We've designed this so that
          <strong> no personal information about you is sent off the device</strong>. Here's
          everything a node collects:
        </p>

        <h3 style={H3}>People counting (camera)</h3>
        <p style={P}>
          A camera in each node runs an on-device person-detection model. <strong>Video is never
          recorded, transmitted, or stored.</strong> Frames are processed in memory and discarded
          immediately. Only aggregate counts (people in / people out, dwell-time buckets)
          leave the device.
        </p>

        <h3 style={H3}>Bluetooth & Wi-Fi counting</h3>
        <p style={P}>
          The node listens for nearby Bluetooth devices and Wi-Fi signals to estimate how
          busy a zone is. <strong>We don't store individual MAC addresses.</strong> Bluetooth
          MAC addresses are hashed on the device with a per-business secret before
          transmission — the result cannot be matched back to your phone without that
          secret, which only the venue and TapProve hold. For Wi-Fi, only the count of
          visible networks is transmitted; SSIDs and BSSIDs are discarded immediately.
        </p>

        <h3 style={H3}>Ambient noise & light</h3>
        <p style={P}>
          The microphone measures noise <em>level</em> only (in decibels, plus a "quiet /
          moderate / busy" label). <strong>No audio is recorded</strong> and no conversation
          content is processed. The light sensor reports ambient brightness in lux.
        </p>

        <h3 style={H3}>NFC tap</h3>
        <p style={P}>
          If you tap a TapProve sticker with an NFC-enabled phone, your phone reads a URL
          identifying the venue and that tap point. No personal data is read from your
          phone — the tap is one-directional.
        </p>

        <h3 style={H3}>What we do NOT collect from venue visitors</h3>
        <p style={P}>
          We don't collect: video, photos, audio recordings, raw Wi-Fi MAC addresses, raw
          Bluetooth MAC addresses, your name, your phone number, your email, your face,
          your gender, your age, or any persistent identifier that would let us recognise
          you across visits to different venues.
        </p>

        <h3 style={H3}>Legal basis & retention</h3>
        <p style={P}>
          Processing for footfall analytics is performed under the venue's
          <em> legitimate interests</em> (GDPR Article 6(1)(f)) — running their business and
          improving customer experience. Aggregate counts are retained for up to 13 months
          to enable year-over-year comparisons. Per-device Bluetooth hashes are deleted
          after 24 hours.
        </p>
      </div>

      <div style={SECTION}>
        <h2 style={H2}>3. If you're a registered TapProve loyalty user</h2>
        <p style={P}>
          When you create a TapProve account and use the customer app, we hold the
          following information about you to run the loyalty service:
        </p>
        <ul style={{ ...P, paddingLeft: 22 }}>
          <li><strong>Account:</strong> email, phone number, first name, last name, password (hashed), optional two-factor secret</li>
          <li><strong>Profile:</strong> avatar (if you upload one), date of birth, country</li>
          <li><strong>Loyalty:</strong> points balance, lifetime points, tier, transaction history</li>
          <li><strong>Location (optional, on your consent):</strong> your last-known location, used so the app can show you nearby offers and recognise you when you arrive at a venue</li>
          <li><strong>Preferences:</strong> notification settings, whether you've opted in to personalised greetings on venue displays, whether you've shared your birthday for birthday rewards</li>
        </ul>

        <h3 style={H3}>What we won't do</h3>
        <p style={P}>
          We don't sell your personal data. We don't share your name, email, phone, or
          location with venues or other third parties unless you take an action that
          requires it (e.g. redeeming a coupon at a specific venue). Aggregate footfall
          analytics we share with venues — and any anonymous footfall data we ever make
          available externally — never include identifiable information about you.
        </p>

        <h3 style={H3}>Legal basis & retention</h3>
        <p style={P}>
          Processing your account and loyalty data is performed under <em>contract</em>
          (GDPR Article 6(1)(b)) — you need an account to use the loyalty service. Location
          and personalised-display features are processed under <em>consent</em>
          (Article 6(1)(a)) and you can withdraw consent in the app's settings at any time.
          Your data is kept while your account is active, and deleted within 30 days if
          you delete your account.
        </p>
      </div>

      <div style={SECTION}>
        <h2 style={H2}>4. Your rights</h2>
        <p style={P}>Under GDPR you can ask us to:</p>
        <ul style={{ ...P, paddingLeft: 22 }}>
          <li>Tell you what data we hold about you (right of access)</li>
          <li>Correct anything that's wrong (right to rectification)</li>
          <li>Delete your data (right to erasure)</li>
          <li>Restrict or object to specific processing</li>
          <li>Receive a portable copy of the data you've given us (right to portability)</li>
          <li>Withdraw any consent you've given (without affecting prior processing)</li>
        </ul>
        <p style={P}>
          Email <a href="mailto:support@tapprove.io" style={{ color: '#FF6B35' }}>support@tapprove.io</a> to exercise
          any of these. We respond within 30 days. If you're unhappy with our response, you
          can complain to your local data protection authority — in the UK that's the
          Information Commissioner's Office (<a href="https://ico.org.uk" style={{ color: '#FF6B35' }}>ico.org.uk</a>).
        </p>
      </div>

      <div style={SECTION}>
        <h2 style={H2}>5. Where this data lives</h2>
        <p style={P}>
          TapProve's backend runs in the European Economic Area. Loyalty user data and
          node telemetry are stored on EU-hosted infrastructure (Railway, Frankfurt
          region). We do not transfer personal data outside the UK / EEA except where the
          recipient is covered by an adequacy decision or equivalent safeguard.
        </p>
      </div>

      <div style={SECTION}>
        <h2 style={H2}>6. Changes to this notice</h2>
        <p style={P}>
          We may update this notice as the platform evolves. The "last updated" date
          below changes when we revise it. Material changes will be flagged in the
          customer app and via email to registered users.
        </p>
        <p style={SMALL}>Last updated: 19 June 2026.</p>
      </div>

      <p style={{ ...P, textAlign: 'center', marginTop: 20 }}>
        <Link to="/" style={{ color: '#FF6B35' }}>← Back to TapProve</Link>
      </p>
    </div>
  );
}
