import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorState } from '../ErrorState';

describe('ErrorState', () => {
  it('renders the network variant as the default, inside an alert region', () => {
    render(<ErrorState />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Connection lost' })).toBeInTheDocument();
  });

  it('uses the title for the chosen named variant', () => {
    render(<ErrorState variant="permissionDenied" />);
    expect(screen.getByRole('heading', { name: 'Permission denied' })).toBeInTheDocument();
  });

  it('falls back to the network variant for an unknown variant key', () => {
    render(<ErrorState variant="totally-unknown" />);
    expect(screen.getByRole('heading', { name: 'Connection lost' })).toBeInTheDocument();
  });

  it('prefers an explicit title/description over the variant defaults', () => {
    render(<ErrorState title="Custom title" description="Custom body" />);
    expect(screen.getByRole('heading', { name: 'Custom title' })).toBeInTheDocument();
    expect(screen.getByText('Custom body')).toBeInTheDocument();
  });

  it('extracts the API message from an axios-shaped error', () => {
    render(<ErrorState error={{ response: { data: { message: 'Server exploded' } } }} />);
    expect(screen.getByText('Server exploded')).toBeInTheDocument();
  });

  it('accepts a plain string or Error instance as the error', () => {
    const { rerender } = render(<ErrorState error="String failure" />);
    expect(screen.getByText('String failure')).toBeInTheDocument();
    rerender(<ErrorState error={new Error('Object failure')} />);
    expect(screen.getByText('Object failure')).toBeInTheDocument();
  });

  it('renders retry and secondary actions only when their handlers are passed', async () => {
    const onRetry = vi.fn();
    const onSecondary = vi.fn();
    const { rerender } = render(<ErrorState />);
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();

    rerender(
      <ErrorState onRetry={onRetry} onSecondary={onSecondary} secondaryLabel="Go home" />,
    );
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Go home' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });
});
