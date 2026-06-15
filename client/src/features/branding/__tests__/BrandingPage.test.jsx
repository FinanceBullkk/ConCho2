import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BrandingPage from '../BrandingPage';

// TMS.update gap #5 — the branding & certificate designer.

const h = vi.hoisted(() => ({
  state: { data: undefined, isLoading: false, isError: false },
  update: vi.fn(),
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k, d) => (typeof d === 'object' && d?.org ? `${d.org} Training System` : (typeof d === 'string' ? d : k)) }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../useBranding', () => ({
  useBranding: () => h.state,
  useUpdateBranding: () => ({ mutateAsync: h.update, isPending: false }),
}));

const config = { orgName: 'Northwind Group', accentColor: '#1f9a8a', logoUrl: '', certificateTitle: 'Certificate of Achievement', emailSignature: '' };

beforeEach(() => {
  h.state = { data: config, isLoading: false, isError: false };
  h.update.mockReset(); h.update.mockResolvedValue(config);
});

describe('BrandingPage', () => {
  it('hydrates the form + live certificate preview from the saved config', () => {
    render(<BrandingPage />);
    // org name shows in both the input and the certificate preview mark.
    expect(screen.getByLabelText('branding.orgName')).toHaveValue('Northwind Group');
    expect(screen.getByText('Northwind Group')).toBeInTheDocument();
    expect(screen.getByText('Certificate of Achievement')).toBeInTheDocument();
  });

  it('saves the edited branding via the mutation', async () => {
    const u = userEvent.setup();
    render(<BrandingPage />);
    await u.click(screen.getByText('branding.save'));
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update.mock.calls[0][0]).toMatchObject({ orgName: 'Northwind Group' });
  });

  it('shows a skeleton while loading', () => {
    h.state = { data: undefined, isLoading: true, isError: false };
    render(<BrandingPage />);
    expect(screen.getByTestId('branding-skeleton')).toBeInTheDocument();
  });
});
