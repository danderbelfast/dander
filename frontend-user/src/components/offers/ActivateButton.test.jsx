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

import { activateOffer } from '../../api/offers';
import { setReturnIntent } from '../../services/postAuthIntent';
import { setAuthPrompt } from '../../services/authPrompt';
let authState = { isAuth: true };
vi.mock('../../context/AuthContext', () => ({ useAuth: () => authState }));
import ActivateButton from './ActivateButton';

const renderBtn = (props) => render(<MemoryRouter><ActivateButton offerId={7} {...props} /></MemoryRouter>);

describe('ActivateButton', () => {
  beforeEach(() => { vi.clearAllMocks(); authState = { isAuth: true }; });

  it('authed: activates, shows Activated, toasts saved, does NOT navigate', async () => {
    renderBtn({ offerTitle: '20% off pastries' });
    await userEvent.click(screen.getByRole('button', { name: /^activate$/i }));
    expect(activateOffer).toHaveBeenCalledWith(7, { channel: 'web' });
    expect(await screen.findByRole('button', { name: /activated/i })).toBeInTheDocument();
    expect(toastMock).toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
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
