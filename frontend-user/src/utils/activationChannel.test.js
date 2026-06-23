import { describe, it, expect } from 'vitest';
import { resolveActivationChannel } from './activationChannel';

describe('resolveActivationChannel', () => {
  it('returns sticker when ?src=sticker', () => {
    expect(resolveActivationChannel(new URLSearchParams('src=sticker'))).toBe('sticker');
  });
  it('defaults to web otherwise', () => {
    expect(resolveActivationChannel(new URLSearchParams(''))).toBe('web');
    expect(resolveActivationChannel(new URLSearchParams('src=whatever'))).toBe('web');
  });
});
