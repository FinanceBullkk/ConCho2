import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState title="No data" description="Nothing here yet" />);
    expect(screen.getByRole('heading', { name: 'No data' })).toBeInTheDocument();
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });

  it('renders primary + secondary action nodes', () => {
    render(
      <EmptyState
        title="X"
        action={<button>Add</button>}
        secondaryAction={<button>Reset</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
  });

  it('renders the success-variant icon', () => {
    const { container } = render(<EmptyState variant="success" title="Done" />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('falls back to the firstTime variant for an unknown variant', () => {
    const { container } = render(<EmptyState variant="bogus" title="Fallback" />);
    expect(screen.getByRole('heading', { name: 'Fallback' })).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
