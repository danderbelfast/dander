import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./client', () => ({
  default: { post: vi.fn(), get: vi.fn() },
}));

import client from './client';
import { nfcCheckin } from './proximity';
import { getStrangerDisplay, fireStrangerVisit } from './public';

describe('proximity api', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('nfcCheckin posts node_device_id + business_id and returns data', async () => {
    client.post.mockResolvedValue({ data: { success: true, points_awarded: 50 } });
    const res = await nfcCheckin({ node: 'node-abc', business: 42 });
    expect(client.post).toHaveBeenCalledWith('/api/proximity/nfc-checkin', {
      node_device_id: 'node-abc',
      business_id: 42,
    });
    expect(res).toEqual({ success: true, points_awarded: 50 });
  });
});

describe('public api', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('getStrangerDisplay GETs the business stranger-display and returns data', async () => {
    client.get.mockResolvedValue({ data: { success: true, business_name: 'Joe Coffee', todays_offer: null } });
    const res = await getStrangerDisplay(42);
    expect(client.get).toHaveBeenCalledWith('/api/public/business/42/stranger-display');
    expect(res.business_name).toBe('Joe Coffee');
  });

  it('fireStrangerVisit posts node + business and swallows errors', async () => {
    client.post.mockRejectedValue(new Error('network'));
    await expect(fireStrangerVisit({ node: 'node-abc', business: 42 })).resolves.toBeUndefined();
    expect(client.post).toHaveBeenCalledWith('/api/public/nfc-stranger', {
      node_device_id: 'node-abc',
      business_id: 42,
    });
  });
});
