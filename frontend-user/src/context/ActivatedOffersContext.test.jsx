import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

let authState = { isAuth: true };
vi.mock('./AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../api/offers', () => ({ getMyOffers: vi.fn() }));

import { getMyOffers } from '../api/offers';
import { ActivatedOffersProvider, useActivatedOffers } from './ActivatedOffersContext';

function Probe({ id }) {
  const { isActivated, markActivated, markDeactivated } = useActivatedOffers();
  return (
    <div>
      <span data-testid="state">{isActivated(id) ? 'yes' : 'no'}</span>
      <button onClick={() => markActivated(id)}>act</button>
      <button onClick={() => markDeactivated(id)}>deact</button>
    </div>
  );
}

describe('ActivatedOffersContext', () => {
  beforeEach(() => { vi.clearAllMocks(); authState = { isAuth: true }; });

  it('seeds activated ids from getMyOffers when authed', async () => {
    getMyOffers.mockResolvedValue({ offers: [{ id: 7 }, { id: 9 }] });
    render(<ActivatedOffersProvider><Probe id={7} /></ActivatedOffersProvider>);
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('yes'));
  });

  it('treats an offer not in the list as not activated', async () => {
    getMyOffers.mockResolvedValue({ offers: [{ id: 7 }] });
    render(<ActivatedOffersProvider><Probe id={3} /></ActivatedOffersProvider>);
    await waitFor(() => expect(getMyOffers).toHaveBeenCalled());
    expect(screen.getByTestId('state')).toHaveTextContent('no');
  });

  it('matches ids regardless of string/number type', async () => {
    getMyOffers.mockResolvedValue({ offers: [{ id: 7 }] });
    render(<ActivatedOffersProvider><Probe id={'7'} /></ActivatedOffersProvider>);
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('yes'));
  });

  it('markActivated / markDeactivated toggle the state', async () => {
    getMyOffers.mockResolvedValue({ offers: [] });
    render(<ActivatedOffersProvider><Probe id={5} /></ActivatedOffersProvider>);
    await waitFor(() => expect(getMyOffers).toHaveBeenCalled());
    expect(screen.getByTestId('state')).toHaveTextContent('no');
    await userEvent.click(screen.getByText('act'));
    expect(screen.getByTestId('state')).toHaveTextContent('yes');
    await userEvent.click(screen.getByText('deact'));
    expect(screen.getByTestId('state')).toHaveTextContent('no');
  });

  it('does not fetch when logged out and reports nothing activated', async () => {
    authState = { isAuth: false };
    render(<ActivatedOffersProvider><Probe id={7} /></ActivatedOffersProvider>);
    expect(getMyOffers).not.toHaveBeenCalled();
    expect(screen.getByTestId('state')).toHaveTextContent('no');
  });

  it('falls back to a no-op when used outside the provider', async () => {
    render(<Probe id={7} />);
    expect(screen.getByTestId('state')).toHaveTextContent('no');
    await userEvent.click(screen.getByText('act')); // must not throw
    expect(screen.getByTestId('state')).toHaveTextContent('no');
  });
});
