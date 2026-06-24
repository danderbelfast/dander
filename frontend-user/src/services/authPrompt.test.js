import { describe, it, expect, beforeEach } from 'vitest';
import { setAuthPrompt, getAuthPrompt, clearAuthPrompt } from './authPrompt';

describe('authPrompt', () => {
  beforeEach(() => { sessionStorage.clear(); });

  it('returns null when unset', () => { expect(getAuthPrompt()).toBeNull(); });

  it('stores and reads back an offer-context prompt', () => {
    setAuthPrompt({ offerTitle: '20% off pastries' });
    expect(getAuthPrompt()).toEqual({ offerTitle: '20% off pastries' });
  });

  it('tolerates a missing title (generic prompt)', () => {
    setAuthPrompt({});
    expect(getAuthPrompt()).toEqual({ offerTitle: null });
  });

  it('clears', () => {
    setAuthPrompt({ offerTitle: 'x' });
    clearAuthPrompt();
    expect(getAuthPrompt()).toBeNull();
  });
});
