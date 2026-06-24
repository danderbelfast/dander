import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (o) => ({ ...(await o()), useNavigate: () => navigateMock,
  useSearchParams: () => [new URLSearchParams('')] }));
const toastMock = vi.fn();
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ toast: toastMock }) }));
vi.mock('../../api/offers', () => ({ activateOffer: vi.fn().mockResolvedValue({ success: true }), deactivateOffer: vi.fn().mockResolvedValue({ success: true }) }));
vi.mock('../../services/anonId', () => ({ getAnonId: () => 'anon-test' }));
vi.mock('../../services/postAuthIntent', () => ({ setReturnIntent: vi.fn() }));
vi.mock('../../services/authPrompt', () => ({ setAuthPrompt: vi.fn() }));

// Activated-state store — controllable; the mark spies flip the shared state so
// the button re-renders to the persistent "Activated ✓" exactly as in the app.
let activatedState = false;
const markActivated = vi.fn(() => { activatedState = true; });
const markDeactivated = vi.fn(() => { activatedState = false; });
vi.mock('../../context/ActivatedOffersContext', () => ({
  useActivatedOffers: () => ({ isActivated: () => activatedState, markActivated, markDeactivated }),
}));

import { activateOffer, deactivateOffer } from '../../api/offers';
import { setReturnIntent } from '../../services/postAuthIntent';
import { setAuthPrompt } from '../../services/authPrompt';
let authState = { isAuth: true };
vi.mock('../../context/AuthContext', () => ({ useAuth: () => authState }));
import ActivateButton from './ActivateButton';

const renderBtn = (props) => render(<MemoryRouter><ActivateButton offerId={7} {...props} /></MemoryRouter>);

describe('ActivateButton', () => {
  beforeEach(() => { vi.clearAllMocks(); authState = { isAuth: true }; activatedState = false; });

  it('reflects the store: shows Activated ✓ when the offer is already activated', () => {
    activatedState = true;
    renderBtn();
    expect(screen.getByRole('button', { name: /activated/i })).toBeInTheDocument();
  });

  it('authed: activates, marks the store, toasts saved, does NOT navigate', async () => {
    renderBtn({ offerTitle: '20% off pastries' });
    await userEvent.click(screen.getByRole('button', { name: /^activate$/i }));
    expect(activateOffer).toHaveBeenCalledWith(7, { channel: 'web' });
    expect(markActivated).toHaveBeenCalledWith(7);
    expect(await screen.findByRole('button', { name: /activated/i })).toBeInTheDocument();
    expect(toastMock).toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('authed: deactivates an already-activated offer and unmarks the store', async () => {
    activatedState = true;
    renderBtn();
    await userEvent.click(screen.getByRole('button', { name: /activated/i }));
    expect(deactivateOffer).toHaveBeenCalledWith(7);
    expect(markDeactivated).toHaveBeenCalledWith(7);
    expect(await screen.findByRole('button', { name: /^activate$/i })).toBeInTheDocument();
  });

  it('anon: captures, stashes auth prompt + return intent to My Offers, routes to register', async () => {
    authState = { isAuth: false };
    renderBtn({ offerTitle: '20% off pastries' });
    await userEvent.click(screen.getByRole('button', { name: /^activate$/i }));
    expect(activateOffer).toHaveBeenCalledWith(7, { channel: 'web', anonId: 'anon-test' });
    expect(setAuthPrompt).toHaveBeenCalledWith({ offerTitle: '20% off pastries' });
    expect(setReturnIntent).toHaveBeenCalledWith('/my-offers');
    expect(navigateMock).toHaveBeenCalledWith('/register');
  });
});
