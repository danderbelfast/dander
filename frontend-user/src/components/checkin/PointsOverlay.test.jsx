import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CheckInOverlayContext } from '../../context/CheckInOverlayProvider';
import PointsOverlay from './PointsOverlay';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig()),
  useNavigate: () => navigateMock,
}));
vi.mock('../../services/hapticService', () => ({ custom: vi.fn() }));
vi.mock('../../services/soundService', () => ({ couponClaimed: vi.fn(), couponRedeemed: vi.fn() }));

function renderOverlay(ctx) {
  const value = {
    active: ctx.result != null, result: ctx.result ?? null, offersBusinessId: ctx.offersBusinessId ?? null,
    trigger: vi.fn(), setOffersBusinessId: vi.fn(), dismiss: ctx.dismiss ?? vi.fn(),
  };
  return render(
    <MemoryRouter>
      <CheckInOverlayContext.Provider value={value}>
        <PointsOverlay />
      </CheckInOverlayContext.Provider>
    </MemoryRouter>
  );
}

describe('PointsOverlay', () => {
  beforeEach(() => { navigateMock.mockClear(); });

  it('renders nothing when inactive', () => {
    const { container } = renderOverlay({ result: null });
    expect(container.firstChild).toBeNull();
  });

  it('shows points and business name when active', () => {
    renderOverlay({ result: { points_awarded: 50, business_name: 'Joe Coffee', tier: 'silver' } });
    expect(screen.getByText(/50/)).toBeInTheDocument();
    expect(screen.getByText(/Joe Coffee/)).toBeInTheDocument();
  });

  it('shows the tier-upgrade badge only when tier_upgraded is true', () => {
    renderOverlay({ result: { points_awarded: 50, business_name: 'X', tier: 'gold', tier_upgraded: true } });
    expect(screen.getByText(/gold/i)).toBeInTheDocument();
  });

  it('shows the offers button only when an offers business id is set', async () => {
    renderOverlay({ result: { points_awarded: 10, business_name: 'X' } });
    expect(screen.queryByRole('button', { name: /see our latest offers/i })).toBeNull();

    renderOverlay({ result: { points_awarded: 10, business_name: 'X' }, offersBusinessId: 42 });
    const btn = screen.getByRole('button', { name: /see our latest offers/i });
    await userEvent.click(btn);
    expect(navigateMock).toHaveBeenCalledWith('/business/42/offers');
  });

  it('dismiss button navigates home', async () => {
    const dismiss = vi.fn();
    renderOverlay({ result: { points_awarded: 10, business_name: 'X' }, dismiss });
    await userEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(dismiss).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith('/home');
  });

  it('shows a friendly already-checked-in message when points_awarded is 0', () => {
    renderOverlay({ result: { points_awarded: 0, business_name: 'Joe Coffee' } });
    expect(screen.getByText(/already checked in today/i)).toBeInTheDocument();
    expect(screen.getByText(/Joe Coffee/)).toBeInTheDocument();
    // no celebratory "+0"
    expect(screen.queryByText('+0')).toBeNull();
  });

  it('still allows Done from the already-checked-in state', async () => {
    const dismiss = vi.fn();
    renderOverlay({ result: { points_awarded: 0, business_name: 'X' }, dismiss });
    await userEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(dismiss).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith('/home');
  });
});
