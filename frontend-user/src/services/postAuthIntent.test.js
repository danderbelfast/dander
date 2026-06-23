import { describe, it, expect, beforeEach } from 'vitest';
import { setTapIntent, setReturnIntent } from './postAuthIntent';
import { getPendingTap, setPendingTap, clearPendingTap } from './tapContext';
import { getReturnPath, setReturnPath, clearReturnPath } from './returnPath';

describe('postAuthIntent (single active intent)', () => {
  beforeEach(() => { clearPendingTap(); clearReturnPath(); });

  it('setTapIntent sets the tap and clears any return path', () => {
    setReturnPath('/offer/3');
    setTapIntent({ node: 'node-abc', business: 42 });
    expect(getPendingTap()).toEqual({ node: 'node-abc', business: 42 });
    expect(getReturnPath()).toBeNull();
  });

  it('setReturnIntent sets the return path and clears any pending tap', () => {
    setPendingTap({ node: 'node-abc', business: 42 });
    setReturnIntent('/business/4/offers');
    expect(getReturnPath()).toBe('/business/4/offers');
    expect(getPendingTap()).toBeNull();
  });

  it('most-recent-intent wins (offer after tap → only return path)', () => {
    setTapIntent({ node: 'n', business: 1 });
    setReturnIntent('/offer/9');
    expect(getPendingTap()).toBeNull();
    expect(getReturnPath()).toBe('/offer/9');
  });
});
