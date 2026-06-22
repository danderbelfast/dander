import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { CheckInOverlayProvider, useCheckInOverlay } from './CheckInOverlayProvider';

function Probe() {
  const { active, result, offer, trigger, setOffer, dismiss } = useCheckInOverlay();
  return (
    <div>
      <span data-testid="active">{String(active)}</span>
      <span data-testid="points">{result?.points_awarded ?? '-'}</span>
      <span data-testid="offer">{offer?.id ?? '-'}</span>
      <button onClick={() => trigger({ points_awarded: 50 })}>trigger</button>
      <button onClick={() => setOffer({ id: 9 })}>offer</button>
      <button onClick={dismiss}>dismiss</button>
    </div>
  );
}

function setup() {
  return render(
    <CheckInOverlayProvider>
      <Probe />
    </CheckInOverlayProvider>
  );
}

describe('CheckInOverlayProvider', () => {
  it('starts inactive', () => {
    setup();
    expect(screen.getByTestId('active').textContent).toBe('false');
  });

  it('activates and stores the result on trigger', () => {
    setup();
    act(() => screen.getByText('trigger').click());
    expect(screen.getByTestId('active').textContent).toBe('true');
    expect(screen.getByTestId('points').textContent).toBe('50');
  });

  it('attaches an offer and clears everything on dismiss', () => {
    setup();
    act(() => screen.getByText('trigger').click());
    act(() => screen.getByText('offer').click());
    expect(screen.getByTestId('offer').textContent).toBe('9');
    act(() => screen.getByText('dismiss').click());
    expect(screen.getByTestId('active').textContent).toBe('false');
    expect(screen.getByTestId('offer').textContent).toBe('-');
  });
});
