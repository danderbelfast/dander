import { describe, it, expect } from 'vitest';
import { resolveActivationChannel } from './activationChannel';

describe('resolveActivationChannel', () => {
  it('maps a per-location sticker src to { channel: sticker, source }', () => {
    expect(resolveActivationChannel(new URLSearchParams('src=sticker_window')))
      .toEqual({ channel: 'sticker', source: 'sticker_window' });
  });
  it('keeps bare ?src=sticker working', () => {
    expect(resolveActivationChannel(new URLSearchParams('src=sticker')))
      .toEqual({ channel: 'sticker', source: 'sticker' });
  });
  it('defaults to web with source web when absent', () => {
    expect(resolveActivationChannel(new URLSearchParams('')))
      .toEqual({ channel: 'web', source: 'web' });
  });
  it('treats an unknown src as web but keeps the tag', () => {
    expect(resolveActivationChannel(new URLSearchParams('src=promo_email')))
      .toEqual({ channel: 'web', source: 'promo_email' });
  });
  it('sanitises junk in src', () => {
    expect(resolveActivationChannel(new URLSearchParams('src=Sticker-Window!')))
      .toEqual({ channel: 'sticker', source: 'stickerwindow' });
  });
});
