import { describe, it, expect } from 'vitest';
import { buildShareUrl, buildCanonicalShareUrl } from './shareUrl';
import { PUBLIC_APP_URL } from '../config';

describe('shareUrl', () => {
  it('tags a platform share link with ?src=social_<platform>', () => {
    expect(buildShareUrl(7, 'facebook')).toBe(`${PUBLIC_APP_URL}/o/7?src=social_facebook`);
    expect(buildShareUrl(7, 'instagram')).toBe(`${PUBLIC_APP_URL}/o/7?src=social_instagram`);
    expect(buildShareUrl(7, 'other')).toBe(`${PUBLIC_APP_URL}/o/7?src=social_other`);
  });
  it('builds a clean canonical link (no tag) for the generic copy', () => {
    expect(buildCanonicalShareUrl(7)).toBe(`${PUBLIC_APP_URL}/o/7`);
  });
});
