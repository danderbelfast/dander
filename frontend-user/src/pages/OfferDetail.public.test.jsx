import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig();
  return { ...actual, useNavigate: () => navigateMock };
});

// Logged OUT
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ isAuth: false }) }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('../context/PwaInstallContext', () => ({ usePwa: () => ({ trackOfferView: vi.fn(), trackCouponClaim: vi.fn() }) }));
vi.mock('../services/alertService', () => ({ couponClaimed: vi.fn() }));
vi.mock('../api/coupons', () => ({ generateCoupon: vi.fn() }));
vi.mock('../api/offers', () => ({
  getOffer: vi.fn().mockResolvedValue({ offer: { id: 3, title: 'Free coffee', business_name: 'Joe', is_saved: false } }),
  recordView: vi.fn().mockResolvedValue({}),
  saveOffer: vi.fn(), unsaveOffer: vi.fn(), trackShare: vi.fn(),
}));
const setReturnPathMock = vi.fn();
vi.mock('../services/returnPath', () => ({ setReturnPath: (...a) => setReturnPathMock(...a) }));

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

  it('claim CTA says "Sign in to claim", stashes return path, goes to /login', async () => {
    renderAt();
    const btn = await screen.findByRole('button', { name: /sign in to claim/i });
    await userEvent.click(btn);
    expect(setReturnPathMock).toHaveBeenCalledWith('/offer/3');
    expect(navigateMock).toHaveBeenCalledWith('/login');
  });
});
