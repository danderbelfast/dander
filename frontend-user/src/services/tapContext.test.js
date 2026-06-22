import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setPendingTap, getPendingTap, clearPendingTap, PENDING_TAP_TTL_MS } from './tapContext';

describe('tapContext', () => {
  beforeEach(() => { sessionStorage.clear(); vi.useRealTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns null when nothing is stashed', () => {
    expect(getPendingTap()).toBeNull();
  });

  it('stashes and reads back node + business', () => {
    setPendingTap({ node: 'node-abc', business: 42 });
    expect(getPendingTap()).toEqual({ node: 'node-abc', business: 42 });
  });

  it('coerces business to a number', () => {
    setPendingTap({ node: 'node-abc', business: '42' });
    expect(getPendingTap()).toEqual({ node: 'node-abc', business: 42 });
  });

  it('clears on demand', () => {
    setPendingTap({ node: 'node-abc', business: 42 });
    clearPendingTap();
    expect(getPendingTap()).toBeNull();
  });

  it('expires after the TTL and self-clears', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-22T10:00:00Z'));
    setPendingTap({ node: 'node-abc', business: 42 });

    vi.setSystemTime(new Date('2026-06-22T10:00:00Z').getTime() + PENDING_TAP_TTL_MS + 1);
    expect(getPendingTap()).toBeNull();
    expect(sessionStorage.getItem('tapprove_pending_tap')).toBeNull();
  });

  it('ignores a tap missing node or business', () => {
    setPendingTap({ node: '', business: 42 });
    expect(getPendingTap()).toBeNull();
    setPendingTap({ node: 'node-abc', business: NaN });
    expect(getPendingTap()).toBeNull();
  });
});
