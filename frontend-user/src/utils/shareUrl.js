import { PUBLIC_APP_URL } from '../config';

// Tagged share link: ?src=social_<platform> rides on /o/:id, survives the OG
// redirect (backend forwards query), and is stamped on the recipient's activation.
export function buildShareUrl(offerId, platform) {
  return `${PUBLIC_APP_URL}/o/${offerId}?src=social_${platform}`;
}

// Generic, channel-agnostic copy — no tag, so the recipient is attributed to
// whatever channel they actually activate from (no Social over-attribution).
export function buildCanonicalShareUrl(offerId) {
  return `${PUBLIC_APP_URL}/o/${offerId}`;
}
