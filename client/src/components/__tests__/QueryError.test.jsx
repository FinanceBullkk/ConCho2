import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QueryError from '../QueryError';

describe('QueryError', () => {
  it('renders default message when no error prop', () => {
    render(<QueryError />);
    expect(screen.getByText(/failed to load data/i)).toBeInTheDocument();
  });

  it('renders server error message from response', () => {
    const error = { response: { data: { message: 'Unauthorized access' } } };
    render(<QueryError error={error} />);
    expect(screen.getByText('Unauthorized access')).toBeInTheDocument();
  });

  it('renders retry button when onRetry provided', () => {
    render(<QueryError onRetry={vi.fn()} />);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('calls onRetry when button clicked', async () => {
    const onRetry = vi.fn();
    render(<QueryError onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not render retry button without onRetry', () => {
    render(<QueryError />);
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });
});
