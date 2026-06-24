import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setAuthPrompt, clearAuthPrompt } from '../../services/authPrompt';
import AuthPromptBanner from './AuthPromptBanner';

describe('AuthPromptBanner', () => {
  beforeEach(() => { clearAuthPrompt(); });

  it('renders nothing when no prompt', () => {
    const { container } = render(<AuthPromptBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('shows a value-framed message with the offer title', () => {
    setAuthPrompt({ offerTitle: '20% off pastries' });
    render(<AuthPromptBanner />);
    expect(screen.getByText(/20% off pastries/)).toBeInTheDocument();
    expect(screen.getByText(/redeem it in store/i)).toBeInTheDocument();
  });

  it('shows a generic message when no title', () => {
    setAuthPrompt({});
    render(<AuthPromptBanner />);
    expect(screen.getByText(/save your offer and redeem it in store/i)).toBeInTheDocument();
  });
});
