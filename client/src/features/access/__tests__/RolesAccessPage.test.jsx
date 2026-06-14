import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RolesAccessPage from '../RolesAccessPage';

const h = vi.hoisted(() => ({ state: { data: undefined, isLoading: false, isError: false } }));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }));
vi.mock('../useAccess', () => ({ useCapabilityMatrix: () => h.state }));

const sample = {
  roles: ['Admin', 'Coordinator', 'Teacher', 'Participant'],
  capabilities: ['program.manage', 'session.book'],
  grants: {
    Admin: ['program.manage', 'session.book'],
    Coordinator: ['program.manage'],
    Teacher: [],
    Participant: ['session.book'],
  },
};

const renderPage = () => render(<MemoryRouter><RolesAccessPage /></MemoryRouter>);

beforeEach(() => { h.state = { data: undefined, isLoading: false, isError: false }; });

describe('RolesAccessPage — capability matrix', () => {
  it('renders a skeleton while loading', () => {
    h.state = { data: undefined, isLoading: true, isError: false };
    renderPage();
    expect(screen.getByTestId('access-skeleton')).toBeInTheDocument();
  });

  it('renders the role columns, grouped capabilities, and grant cells', () => {
    h.state = { data: sample, isLoading: false, isError: false };
    renderPage();

    // Role columns
    ['Admin', 'Coordinator', 'Teacher', 'Participant'].forEach((r) =>
      expect(screen.getByText(r)).toBeInTheDocument());

    // Resource group headers (titleized prefix) + capability ids + humanized action
    expect(screen.getByText('Program')).toBeInTheDocument();
    expect(screen.getByText('Session')).toBeInTheDocument();
    expect(screen.getByText('program.manage')).toBeInTheDocument();
    expect(screen.getByText('session.book')).toBeInTheDocument();

    // Both granted and not-granted cells are present (Teacher holds nothing here).
    expect(screen.getAllByLabelText('granted').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('not granted').length).toBeGreaterThan(0);
  });

  it('shows an error state when the matrix fails to load', () => {
    h.state = { data: undefined, isLoading: false, isError: true };
    renderPage();
    expect(screen.getByText('access.loadError')).toBeInTheDocument();
  });
});
