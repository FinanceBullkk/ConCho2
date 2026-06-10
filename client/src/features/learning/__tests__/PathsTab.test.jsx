import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PathsTab from '../PathsTab';

const paths = [
  {
    _id: 'lp1',
    code: 'ONBOARD',
    title: 'Onboarding Journey',
    status: 'active',
    programs: [{ _id: 'p1' }, { _id: 'p2' }],
  },
];

const state = { paths };

vi.mock('../../../hooks/useLearning', () => ({
  useLearningPaths: () => ({ data: { data: state.paths }, isLoading: false }),
}));

vi.mock('../../../hooks/useRole', () => ({
  useRole: () => ({ can: (permission) => permission === 'manage:path' }),
}));

describe('PathsTab', () => {
  it('renders a row per path with title, code, and step count', () => {
    state.paths = paths;
    render(<PathsTab />);
    expect(screen.getByText('Onboarding Journey')).toBeInTheDocument();
    expect(screen.getByText('ONBOARD')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // 2 programs
  });

  it('shows the New Path action for managers', () => {
    state.paths = paths;
    render(<PathsTab />);
    expect(screen.getByText('New Path')).toBeInTheDocument();
  });

  it('shows an empty state when there are no paths', () => {
    state.paths = [];
    render(<PathsTab />);
    expect(screen.getByText('No learning paths')).toBeInTheDocument();
  });
});
