import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('./client', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
import client from './client';
import { activateOffer, deactivateOffer, getMyOffers, stitchActivations } from './offers';

describe('offer activation api', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('activateOffer posts channel (+ anon_id when given)', async () => {
    client.post.mockResolvedValue({ data: { success: true } });
    await activateOffer(7, { channel: 'web' });
    expect(client.post).toHaveBeenCalledWith('/api/offers/7/activate', { channel: 'web' });
    await activateOffer(7, { channel: 'sticker', anonId: 'a1' });
    expect(client.post).toHaveBeenLastCalledWith('/api/offers/7/activate', { channel: 'sticker', anon_id: 'a1' });
  });

  it('deactivateOffer deletes (anon_id in body when given)', async () => {
    client.delete.mockResolvedValue({ data: { success: true } });
    await deactivateOffer(7, { anonId: 'a1' });
    expect(client.delete).toHaveBeenCalledWith('/api/offers/7/activate', { data: { anon_id: 'a1' } });
  });

  it('getMyOffers GETs /activated', async () => {
    client.get.mockResolvedValue({ data: { success: true, offers: [] } });
    await getMyOffers();
    expect(client.get).toHaveBeenCalledWith('/api/offers/activated');
  });

  it('stitchActivations posts anon_id', async () => {
    client.post.mockResolvedValue({ data: { success: true, stitched: 2 } });
    const r = await stitchActivations('a1');
    expect(client.post).toHaveBeenCalledWith('/api/offers/activations/stitch', { anon_id: 'a1' });
    expect(r.stitched).toBe(2);
  });
});
