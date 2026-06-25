import React from 'react';
import { buildShareUrl, buildCanonicalShareUrl } from '../../utils/shareUrl';
import { trackShare } from '../../api/offers';
import { useToast } from '../../context/ToastContext';

// Per-platform share with attribution. Web-intent platforms open their share
// dialog; Instagram/TikTok (no web intent) copy a tagged link; the generic Copy
// is untagged; "More…" uses the native share sheet tagged social_other.
const PLATFORMS = [
  { key: 'facebook',  label: 'Facebook',  kind: 'intent', intent: (u) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}` },
  { key: 'whatsapp',  label: 'WhatsApp',  kind: 'intent', intent: (u, t) => `https://wa.me/?text=${encodeURIComponent(`${t} ${u}`)}` },
  { key: 'instagram', label: 'Instagram', kind: 'copy' },
  { key: 'x',         label: 'X',         kind: 'intent', intent: (u, t) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(t)}&url=${encodeURIComponent(u)}` },
  { key: 'telegram',  label: 'Telegram',  kind: 'intent', intent: (u, t) => `https://t.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}` },
  { key: 'tiktok',    label: 'TikTok',    kind: 'copy' },
];

export default function ShareSheet({ offerId, title, text, open, onClose }) {
  const { toast } = useToast();
  if (!open) return null;

  const shareText = text || title || 'Check out this deal';
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function copy(url, message) {
    try {
      await navigator.clipboard.writeText(url);
      toast({ type: 'success', title: 'Link copied', message });
    } catch {
      toast({ type: 'error', title: 'Copy failed', message: 'Could not copy the link.' });
    }
  }

  function onPlatform(p) {
    trackShare(offerId).catch(() => {});
    const url = buildShareUrl(offerId, p.key);
    if (p.kind === 'intent') window.open(p.intent(url, shareText), '_blank', 'noopener');
    else copy(url, `Link copied — paste it into your ${p.label} story or bio.`);
    onClose();
  }
  function onCopyGeneric() {
    trackShare(offerId).catch(() => {});
    copy(buildCanonicalShareUrl(offerId), 'Share link copied to clipboard.');
    onClose();
  }
  async function onMore() {
    trackShare(offerId).catch(() => {});
    try { await navigator.share({ title: title || 'TapProve', text: shareText, url: buildShareUrl(offerId, 'other') }); } catch {}
    onClose();
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Share this offer" onClick={onClose} style={backdrop}>
      <div onClick={(e) => e.stopPropagation()} style={sheet}>
        <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 12 }}>Share this deal</div>
        <div style={grid}>
          {PLATFORMS.map((p) => (
            <button key={p.key} type="button" onClick={() => onPlatform(p)} style={btn}>{p.label}</button>
          ))}
          <button type="button" onClick={onCopyGeneric} style={btn}>Copy link</button>
          {canNativeShare && <button type="button" onClick={onMore} style={btn}>More…</button>}
        </div>
        <button type="button" onClick={onClose} style={cancel}>Cancel</button>
      </div>
    </div>
  );
}

const backdrop = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' };
const sheet = { width: '100%', maxWidth: 480, background: '#fff', borderRadius: '16px 16px 0 0', padding: 20, boxShadow: '0 -8px 32px rgba(0,0,0,0.2)' };
const grid = { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 };
const btn = { padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.12)', background: '#fff', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer' };
const cancel = { marginTop: 12, width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: 'transparent', color: 'var(--c-text-muted, #666)', fontWeight: 600, cursor: 'pointer' };
