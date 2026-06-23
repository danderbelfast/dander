import { describe, it, expect, beforeEach } from 'vitest';
import { getAnonId } from './anonId';

describe('anonId', () => {
  beforeEach(() => { localStorage.clear(); });

  it('creates and persists a stable id', () => {
    const a = getAnonId();
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThan(10);
    expect(getAnonId()).toBe(a);                 // stable across calls
    expect(localStorage.getItem('tapprove_anon_id')).toBe(a);  // persisted
  });
});
