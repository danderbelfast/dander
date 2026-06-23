import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setReturnPath, getReturnPath, clearReturnPath, RETURN_PATH_TTL_MS } from './returnPath';

describe('returnPath', () => {
  beforeEach(() => { sessionStorage.clear(); vi.useRealTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns null when nothing is stashed', () => {
    expect(getReturnPath()).toBeNull();
  });

  it('stashes and reads back a safe internal path', () => {
    setReturnPath('/offer/3');
    expect(getReturnPath()).toBe('/offer/3');
  });

  it('clears on demand', () => {
    setReturnPath('/offer/3');
    clearReturnPath();
    expect(getReturnPath()).toBeNull();
  });

  it('rejects unsafe paths (absolute URL or protocol-relative)', () => {
    setReturnPath('https://evil.com');
    expect(getReturnPath()).toBeNull();
    setReturnPath('//evil.com');
    expect(getReturnPath()).toBeNull();
    setReturnPath('not-a-path');
    expect(getReturnPath()).toBeNull();
  });

  it('expires after the TTL and self-clears', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-23T10:00:00Z'));
    setReturnPath('/offer/3');
    vi.setSystemTime(new Date('2026-06-23T10:00:00Z').getTime() + RETURN_PATH_TTL_MS + 1);
    expect(getReturnPath()).toBeNull();
    expect(sessionStorage.getItem('tapprove_return_path')).toBeNull();
  });
});
