import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Users } from 'lucide-react';
import { KPICard } from '../KPICard';

describe('KPICard', () => {
  it('shows the value and label', () => {
    render(<KPICard label="Active Students" value={42} />);
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Active Students')).toBeInTheDocument();
  });

  it('falls back to an em dash when value is nullish', () => {
    render(<KPICard label="X" value={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders the optional sub line', () => {
    render(<KPICard label="X" value={1} sub="/ 230 total" />);
    expect(screen.getByText('/ 230 total')).toBeInTheDocument();
  });

  it('renders an icon chip when an icon is given', () => {
    const { container } = render(<KPICard label="X" value={1} icon={Users} tone="success" />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('renders a downward trend (negative delta)', () => {
    render(<KPICard label="X" value={1} trend={{ delta: -5 }} />);
    expect(screen.getByText('-5')).toBeInTheDocument();
  });

  it('renders an upward trend with its label', () => {
    render(<KPICard label="X" value={1} trend={{ delta: 12, label: 'vs last month' }} />);
    expect(screen.getByText('vs last month')).toBeInTheDocument();
  });

  it('wraps the card in a link when href is given', () => {
    const { container } = render(<KPICard label="X" value={1} href="/reports" />);
    expect(container.querySelector('a[href="/reports"]')).not.toBeNull();
  });

  it('hides the value behind a skeleton while loading', () => {
    render(<KPICard label="X" value={99} loading />);
    expect(screen.queryByText('99')).toBeNull();
  });
});
