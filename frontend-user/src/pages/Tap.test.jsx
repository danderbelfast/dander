import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig();
  return { ...actual, useNavigate: () => navigateMock };
});

let authState = { isAuth: false, loading: false };
vi.mock('../context/AuthContext', () => ({ useAuth: () => authState }));

const triggerMock = vi.fn();
const setOfferMock = vi.fn();
vi.mock('../context/CheckInOverlayProvider', () => ({
  useCheckInOverlay: () => ({ trigger: triggerMock, setOffer: setOfferMock }),
}));

vi.mock('../api/proximity', () => ({ nfcCheckin: vi.fn() }));
vi.mock('../api/public', () => ({ getStrangerDisplay: vi.fn(), fireStrangerVisit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../services/tapContext', () => ({ setPendingTap: vi.fn(), clearPendingTap: vi.fn() }));

import { nfcCheckin } from '../api/proximity';
import { getStrangerDisplay } from '../api/public';
import { clearPendingTap } from '../services/tapContext';
import Tap from './Tap';

function renderTap(search) {
  return render(
    <MemoryRouter initialEntries={[`/tap${search}`]}>
      <Routes><Route path="/tap" element={<Tap />} /></Routes>
    </MemoryRouter>
  );
}

describe('Tap page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState = { isAuth: false, loading: false };
  });

  it('redirects to / when params are missing', async () => {
    renderTap('');
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }));
  });

  it('authed: checks in, triggers the overlay, clears the tap, navigates home', async () => {
    authState = { isAuth: true, loading: false };
    nfcCheckin.mockResolvedValue({ success: true, points_awarded: 50, business_name: 'Joe' });
    getStrangerDisplay.mockResolvedValue({ todays_offer: { id: 9 } });
    renderTap('?node=node-abc&business=42');

    await waitFor(() => expect(nfcCheckin).toHaveBeenCalledWith({ node: 'node-abc', business: 42 }));
    await waitFor(() => expect(triggerMock).toHaveBeenCalledWith({ success: true, points_awarded: 50, business_name: 'Joe' }));
    await waitFor(() => expect(setOfferMock).toHaveBeenCalledWith({ id: 9 }));
    expect(clearPendingTap).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith('/home', { replace: true });
  });

  it('not authed: renders the landing (no check-in call)', async () => {
    getStrangerDisplay.mockResolvedValue({ success: true, business_name: 'Joe Coffee', todays_offer: null });
    renderTap('?node=node-abc&business=42');
    expect(await screen.findByText(/Joe Coffee/)).toBeInTheDocument();
    expect(nfcCheckin).not.toHaveBeenCalled();
  });

  it('waits for auth loading before deciding', () => {
    authState = { isAuth: false, loading: true };
    renderTap('?node=node-abc&business=42');
    expect(nfcCheckin).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('error path: shows retry, and Retry re-attempts the check-in', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    authState = { isAuth: true, loading: false };
    nfcCheckin.mockRejectedValueOnce(new Error('boom'));
    renderTap('?node=node-abc&business=42');

    // error UI appears after the failed check-in
    expect(await screen.findByText(/couldn't collect your points/i)).toBeInTheDocument();
    expect(nfcCheckin).toHaveBeenCalledTimes(1);

    // second attempt succeeds
    nfcCheckin.mockResolvedValueOnce({ success: true, points_awarded: 10, business_name: 'Joe' });
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => expect(nfcCheckin).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(triggerMock).toHaveBeenCalledWith({ success: true, points_awarded: 10, business_name: 'Joe' }));
  });
});
