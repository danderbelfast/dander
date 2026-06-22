import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => navigateMock }));

const authLoginMock = vi.fn();
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ login: authLoginMock }) }));

vi.mock('../api/auth', () => ({
  login: vi.fn().mockResolvedValue({
    accessToken: 'eyJ.' + btoa(JSON.stringify({ sub: 1, email: 'a@b.com', role: 'user' })) + '.sig',
    refreshToken: 'r', user: { firstName: 'A' },
  }),
  verifyLogin2FA: vi.fn(), forgotPassword: vi.fn(), resetPassword: vi.fn(), resendOtp: vi.fn(),
}));

import { setPendingTap } from '../services/tapContext';
import Login from './Login';

function renderLogin() {
  return render(<MemoryRouter><Login /></MemoryRouter>);
}

describe('Login replay', () => {
  beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); });

  it('navigates to /home when no tap is pending', async () => {
    renderLogin();
    await userEvent.type(screen.getByPlaceholderText(/you@example.com/i), 'a@b.com');
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'Password1');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(navigateMock).toHaveBeenCalledWith('/home', { replace: true });
  });

  it('replays the tap when one is pending', async () => {
    setPendingTap({ node: 'node-abc', business: 42 });
    renderLogin();
    await userEvent.type(screen.getByPlaceholderText(/you@example.com/i), 'a@b.com');
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'Password1');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(navigateMock).toHaveBeenCalledWith('/tap?node=node-abc&business=42', { replace: true });
  });
});
