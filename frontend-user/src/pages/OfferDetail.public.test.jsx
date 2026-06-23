import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig();
  return { ...actual, useNavigate: () => navigateMock };
});

// Logged OUT
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ isAuth: false }) }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('../context/PwaInstallContext', () => ({ usePwa: () => ({ trackOfferView: vi.fn() }) }));
vi.mock('../api/offers', () => ({
  getOffer: vi.fn().mockResolvedValue({ offer: { id: 3, title: 'Free coffee', business_name: 'Joe', is_saved: false } }),
  recordView: vi.fn().mockResolvedValue({}),
  saveOffer: vi.fn(), unsaveOffer: vi.fn(), trackShare: vi.fn(),
}));

import OfferDetail from './OfferDetail';

function renderAt(id = '3') {
  return render(
    // NOTE: deliberately NO LocationProvider — proves public render works.
    <MemoryRouter initialEntries={[`/offer/${id}`]}>
      <Routes><Route path="/offer/:id" element={<OfferDetail />} /></Routes>
    </MemoryRouter>
  );
}

describe('OfferDetail (public, logged out)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders the offer without a LocationProvider (no throw)', async () => {
    renderAt();
    expect(await screen.findByText(/free coffee/i)).toBeInTheDocument();
  });

  it('shows redeem-at-the-till guidance, not a claim button', async () => {
    renderAt();
    // Honest redemption guidance referencing the business + till
    expect(await screen.findByText(/redeem in store/i)).toBeInTheDocument();
    expect(screen.getByText(/ask staff for this offer at the till/i)).toBeInTheDocument();
    // The removed claim flow must be gone
    expect(screen.queryByRole('button', { name: /sign in to claim/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /get coupon/i })).toBeNull();
  });
});
