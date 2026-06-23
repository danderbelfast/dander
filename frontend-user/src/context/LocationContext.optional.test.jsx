import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useOptionalLocation } from './LocationContext';

function Probe() {
  const loc = useOptionalLocation();
  return <span data-testid="v">{loc === null ? 'null' : 'ctx'}</span>;
}

describe('useOptionalLocation', () => {
  it('returns null when there is no LocationProvider (no throw)', () => {
    render(<Probe />);
    expect(screen.getByTestId('v').textContent).toBe('null');
  });
});
