import { describe, it, expect, beforeEach } from 'vitest';
import { postAuthDestination } from './postAuthDestination';
import { setPendingTap, clearPendingTap } from '../services/tapContext';
import { setReturnPath, clearReturnPath as clearRet } from '../services/returnPath';

describe('postAuthDestination', () => {
  beforeEach(() => { clearPendingTap(); clearRet(); });

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

  it('returns the stashed return path when no tap is pending', () => {
    setReturnPath('/offer/3');
    expect(postAuthDestination()).toBe('/offer/3');
  });

  it('consumes (clears) the return path after returning it', () => {
    setReturnPath('/offer/3');
    postAuthDestination();
    expect(postAuthDestination()).toBe('/home');
  });

  it('pending tap wins over a return path', () => {
    setPendingTap({ node: 'node-abc', business: 42 });
    setReturnPath('/offer/3');
    expect(postAuthDestination()).toBe('/tap?node=node-abc&business=42');
  });
});
