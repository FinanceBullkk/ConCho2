import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AlertCircle } from 'lucide-react';
import { StatusBadge, STATUS_BADGE_TONES } from '../StatusBadge';

describe('StatusBadge', () => {
  it('maps a known user status to its label', () => {
    render(<StatusBadge status="Active" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('maps a lifecycle status to a friendly label', () => {
    render(<StatusBadge status="toMark" />);
    expect(screen.getByText('To mark')).toBeInTheDocument();
  });

  it('falls back to the raw status string for unknown values', () => {
    render(<StatusBadge status="Mystery" />);
    expect(screen.getByText('Mystery')).toBeInTheDocument();
  });

  it('lets children override the mapped label', () => {
    render(<StatusBadge status="Active">Custom label</StatusBadge>);
    expect(screen.getByText('Custom label')).toBeInTheDocument();
    expect(screen.queryByText('Active')).toBeNull();
  });

  it('renders an optional count suffix', () => {
    render(<StatusBadge status="toMark" count={3} />);
    expect(screen.getByText('· 3')).toBeInTheDocument();
  });

  it('renders an explicit tone with an icon', () => {
    const { container } = render(
      <StatusBadge tone="warning" icon={AlertCircle}>Heads up</StatusBadge>,
    );
    expect(screen.getByText('Heads up')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('exposes the tone enum for consumers', () => {
    expect(STATUS_BADGE_TONES).toEqual(
      expect.arrayContaining(['upcoming', 'warning', 'info', 'success', 'danger']),
    );
  });
});
