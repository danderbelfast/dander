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
vi.mock('../../services/returnPath', () => ({ setReturnPath: vi.fn() }));

import { activateOffer } from '../../api/offers';
import { setReturnPath } from '../../services/returnPath';
let authState = { isAuth: true };
vi.mock('../../context/AuthContext', () => ({ useAuth: () => authState }));
import ActivateButton from './ActivateButton';

const renderBtn = (props) => render(<MemoryRouter><ActivateButton offerId={7} {...props} /></MemoryRouter>);

describe('ActivateButton', () => {
  beforeEach(() => { vi.clearAllMocks(); authState = { isAuth: true }; });

  it('authed: activates with channel web, shows Activated state', async () => {
    renderBtn();
    await userEvent.click(screen.getByRole('button', { name: /^activate$/i }));
    expect(activateOffer).toHaveBeenCalledWith(7, { channel: 'web' });
    expect(await screen.findByRole('button', { name: /activated/i })).toBeInTheDocument();
  });

  it('anon: activates with anon_id, toasts, and offers a "Sign in to save" link', async () => {
    authState = { isAuth: false };
    renderBtn();
    await userEvent.click(screen.getByRole('button', { name: /^activate$/i }));
    expect(activateOffer).toHaveBeenCalledWith(7, { channel: 'web', anonId: 'anon-test' });
    expect(toastMock).toHaveBeenCalled();
    const signin = await screen.findByRole('button', { name: /sign in to save/i });
    await userEvent.click(signin);
    expect(setReturnPath).toHaveBeenCalledWith('/my-offers');
    expect(navigateMock).toHaveBeenCalledWith('/login');
  });
});
