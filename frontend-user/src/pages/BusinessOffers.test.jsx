import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig();
  return { ...actual, useNavigate: () => navigateMock };
});
vi.mock('../api/public', () => ({ getBusinessOffers: vi.fn() }));
vi.mock('../utils/imageUrl', () => ({ resolveImageUrl: (u) => u }));

import { getBusinessOffers } from '../api/public';
import BusinessOffers from './BusinessOffers';

function renderAt(id = '4') {
  return render(
    <MemoryRouter initialEntries={[`/business/${id}/offers`]}>
      <Routes><Route path="/business/:id/offers" element={<BusinessOffers />} /></Routes>
    </MemoryRouter>
  );
}

describe('BusinessOffers', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the business name and its offers', async () => {
    getBusinessOffers.mockResolvedValue({
      success: true, business_name: 'Joe Coffee', business_logo_url: null,
      offers: [{ id: 7, title: '20% off pastries', description: 'All day', offer_price: null, discount_percent: 20 }],
    });
    renderAt();
    expect(await screen.findByText('Joe Coffee')).toBeInTheDocument();
    expect(screen.getByText('20% off pastries')).toBeInTheDocument();
  });

  it('shows the empty state with the business name when there are no offers', async () => {
    getBusinessOffers.mockResolvedValue({ success: true, business_name: 'Joe Coffee', offers: [] });
    renderAt();
    expect(await screen.findByText('No Offers Currently Available for Joe Coffee')).toBeInTheDocument();
  });

  it('navigates to the offer detail when an offer is clicked', async () => {
    getBusinessOffers.mockResolvedValue({
      success: true, business_name: 'Joe Coffee', offers: [{ id: 7, title: '20% off pastries' }],
    });
    renderAt();
    await userEvent.click(await screen.findByText('20% off pastries'));
    expect(navigateMock).toHaveBeenCalledWith('/offer/7');
  });

  it('shows an error state when the fetch fails', async () => {
    getBusinessOffers.mockRejectedValue(new Error('boom'));
    renderAt();
    expect(await screen.findByText(/couldn't load offers/i)).toBeInTheDocument();
  });

  it('activates an offer row via the keyboard (Enter)', async () => {
    getBusinessOffers.mockResolvedValue({
      success: true, business_name: 'Joe Coffee', offers: [{ id: 7, title: '20% off pastries' }],
    });
    renderAt();
    const row = (await screen.findByText('20% off pastries')).closest('.offer-card');
    row.focus();
    await userEvent.keyboard('{Enter}');
    expect(navigateMock).toHaveBeenCalledWith('/offer/7');
  });
});
