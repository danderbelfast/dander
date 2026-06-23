import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./client', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

import client from './client';
import { getBusinessOffers } from './public';

describe('getBusinessOffers', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('GETs the business offers endpoint and returns data', async () => {
    client.get.mockResolvedValue({ data: { success: true, business_name: 'Joe Coffee', offers: [{ id: 1 }] } });
    const res = await getBusinessOffers(4);
    expect(client.get).toHaveBeenCalledWith('/api/public/business/4/offers');
    expect(res.offers).toHaveLength(1);
    expect(res.business_name).toBe('Joe Coffee');
  });
});
