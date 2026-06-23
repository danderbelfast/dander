import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
vi.mock('react-router-dom', async (o) => ({ ...(await o()), useNavigate: () => vi.fn() }));
vi.mock('../api/offers', () => ({ getMyOffers: vi.fn() }));
vi.mock('../utils/imageUrl', () => ({ resolveImageUrl: (u) => u }));
import { getMyOffers } from '../api/offers';
import MyOffers from './MyOffers';

const renderPage = () => render(<MemoryRouter><MyOffers /></MemoryRouter>);

describe('MyOffers', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('lists activated offers', async () => {
    getMyOffers.mockResolvedValue({ success: true, offers: [{ id: 7, title: '20% off pastries', business_name: 'Joe' }] });
    renderPage();
    expect(await screen.findByText('20% off pastries')).toBeInTheDocument();
  });

  it('shows an empty state when none', async () => {
    getMyOffers.mockResolvedValue({ success: true, offers: [] });
    renderPage();
    expect(await screen.findByText(/no activated offers/i)).toBeInTheDocument();
  });
});
