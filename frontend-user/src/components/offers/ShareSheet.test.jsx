import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../api/offers', () => ({ trackShare: vi.fn().mockResolvedValue({}) }));
const toastMock = vi.fn();
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ toast: toastMock }) }));
import { trackShare } from '../../api/offers';
import { PUBLIC_APP_URL } from '../../config';
import ShareSheet from './ShareSheet';

const props = { offerId: 7, title: '20% off', text: 'Check out this deal', onClose: vi.fn() };

describe('ShareSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.open = vi.fn();
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue() } });
  });

  it('renders the priority platforms + copy', () => {
    render(<ShareSheet {...props} open />);
    ['Facebook', 'WhatsApp', 'Instagram', 'X', 'Telegram', 'TikTok', 'Copy link']
      .forEach((l) => expect(screen.getByRole('button', { name: l })).toBeInTheDocument());
  });

  it('Facebook opens an intent URL tagged social_facebook', async () => {
    render(<ShareSheet {...props} open />);
    await userEvent.click(screen.getByRole('button', { name: 'Facebook' }));
    expect(trackShare).toHaveBeenCalledWith(7);
    const url = window.open.mock.calls[0][0];
    expect(url).toContain('facebook.com/sharer');
    expect(url).toContain(encodeURIComponent(`${PUBLIC_APP_URL}/o/7?src=social_facebook`));
  });

  it('Instagram copies the social_instagram-tagged link', async () => {
    render(<ShareSheet {...props} open />);
    await userEvent.click(screen.getByRole('button', { name: 'Instagram' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${PUBLIC_APP_URL}/o/7?src=social_instagram`);
  });

  it('Copy link copies the clean canonical (untagged) link', async () => {
    render(<ShareSheet {...props} open />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${PUBLIC_APP_URL}/o/7`);
  });

  it('renders nothing when closed', () => {
    const { container } = render(<ShareSheet {...props} open={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
