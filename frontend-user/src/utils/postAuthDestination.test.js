import { describe, it, expect, beforeEach } from 'vitest';
import { postAuthDestination } from './postAuthDestination';
import { setPendingTap, clearPendingTap } from '../services/tapContext';

describe('postAuthDestination', () => {
  beforeEach(() => { clearPendingTap(); });

  it('returns /home when no tap is pending', () => {
    expect(postAuthDestination()).toBe('/home');
  });

  it('returns the /tap replay URL when a tap is pending', () => {
    setPendingTap({ node: 'node-abc', business: 42 });
    expect(postAuthDestination()).toBe('/tap?node=node-abc&business=42');
  });

  it('url-encodes the node id', () => {
    setPendingTap({ node: 'node-a/b c', business: 7 });
    expect(postAuthDestination()).toBe('/tap?node=node-a%2Fb%20c&business=7');
  });
});
