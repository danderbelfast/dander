import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig()),
  useNavigate: () => navigateMock,
}));
vi.mock('../../api/public', () => ({
  getStrangerDisplay: vi.fn(),
  fireStrangerVisit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../services/tapContext', () => ({ setPendingTap: vi.fn() }));

import { getStrangerDisplay, fireStrangerVisit } from '../../api/public';
import { setPendingTap } from '../../services/tapContext';
import TapLanding from './TapLanding';

function renderLanding(props = {}) {
  return render(
    <MemoryRouter>
      <TapLanding node="node-abc" business={42} {...props} />
    </MemoryRouter>
  );
}

describe('TapLanding', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('loads and shows the business name + offer preview', async () => {
    getStrangerDisplay.mockResolvedValue({
      success: true, business_name: 'Joe Coffee',
      todays_offer: { id: 9, title: '20% off pastries' },
    });
    renderLanding();
    expect(await screen.findByText(/Joe Coffee/)).toBeInTheDocument();
    expect(screen.getByText(/20% off pastries/)).toBeInTheDocument();
  });

  it('fires the kiosk stranger display on mount', async () => {
    getStrangerDisplay.mockResolvedValue({ success: true, business_name: 'X', todays_offer: null });
    renderLanding();
    await waitFor(() => expect(fireStrangerVisit).toHaveBeenCalledWith({ node: 'node-abc', business: 42 }));
  });

  it('Sign in stashes the tap and routes to /login', async () => {
    getStrangerDisplay.mockResolvedValue({ success: true, business_name: 'X', todays_offer: null });
    renderLanding();
    await screen.findByText(/X/);
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(setPendingTap).toHaveBeenCalledWith({ node: 'node-abc', business: 42 });
    expect(navigateMock).toHaveBeenCalledWith('/login');
  });

  it('Create account stashes the tap and routes to /register', async () => {
    getStrangerDisplay.mockResolvedValue({ success: true, business_name: 'X', todays_offer: null });
    renderLanding();
    await screen.findByText(/X/);
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(setPendingTap).toHaveBeenCalledWith({ node: 'node-abc', business: 42 });
    expect(navigateMock).toHaveBeenCalledWith('/register');
  });
});
