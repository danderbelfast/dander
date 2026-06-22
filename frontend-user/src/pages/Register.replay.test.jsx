import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => navigateMock }));

const authLoginMock = vi.fn();
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ login: authLoginMock }) }));

// Build the token inline inside the factory so it is available after hoisting.
vi.mock('../api/auth', () => {
  const tok = 'eyJ.' + btoa(JSON.stringify({ sub: 7, email: 'n@b.com', role: 'user' })) + '.sig';
  return {
    register: vi.fn(),
    verifySetup2FA: vi.fn().mockResolvedValue({ verified: true, accessToken: tok, refreshToken: 'r', user: { firstName: 'N' } }),
    resendOtp: vi.fn(),
  };
});

import Register from './Register';

describe('Register replay', () => {
  beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); });

  it('auto-logs-in and replays the pending tap after OTP verify', async () => {
    // Seed the OTP step via the component's sessionStorage restore key + a pending tap.
    sessionStorage.setItem('tapprove_register_otp', JSON.stringify({ userId: 7, email: 'n@b.com' }));
    sessionStorage.setItem('tapprove_pending_tap', JSON.stringify({ node: 'node-abc', business: 42, ts: Date.now() }));

    render(<MemoryRouter><Register /></MemoryRouter>);
    await userEvent.type(screen.getByPlaceholderText('000000'), '123456');
    await userEvent.click(screen.getByRole('button', { name: /verify & activate account/i }));

    expect(authLoginMock).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith('/tap?node=node-abc&business=42', { replace: true });
  });
});
