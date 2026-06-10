import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PathProgressView from '../PathProgressView';

const progress = {
  steps: [
    { order: 1, status: 'completed', program: { _id: 'p1', name: 'English A', code: 'ENG_A' } },
    { order: 2, status: 'current', program: { _id: 'p2', name: 'English B', code: 'ENG_B' } },
    { order: 3, status: 'locked', program: { _id: 'p3', name: 'English C', code: 'ENG_C' } },
  ],
  summary: { total: 3, completed: 1, percentComplete: 33, complete: false },
};

describe('PathProgressView', () => {
  it('renders the path title, code, and the completed/total summary', () => {
    render(<PathProgressView title="Onboarding Journey" code="ONBOARD" progress={progress} />);
    expect(screen.getByText('Onboarding Journey')).toBeInTheDocument();
    expect(screen.getByText('ONBOARD')).toBeInTheDocument();
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });

  it('renders one row per step with its program name and status label', () => {
    render(<PathProgressView title="Path" code="P1" progress={progress} />);
    expect(screen.getByText('English A')).toBeInTheDocument();
    expect(screen.getByText('English B')).toBeInTheDocument();
    expect(screen.getByText('English C')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getByText('Locked')).toBeInTheDocument();
  });

  it('shows a loading message while progress is undefined', () => {
    render(<PathProgressView title="Path" code="P1" loading />);
    expect(screen.getByText('Loading progress…')).toBeInTheDocument();
  });

  it('shows an empty message when the path has no steps', () => {
    render(<PathProgressView title="Path" code="P1" progress={{ steps: [], summary: { total: 0, completed: 0, percentComplete: 0, complete: false } }} />);
    expect(screen.getByText('This path has no programs yet.')).toBeInTheDocument();
  });
});
