import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageHeader } from '../PageHeader';

describe('PageHeader', () => {
  it('renders the title as an h1 by default with its description', () => {
    render(<PageHeader title="Users" description="Manage your people" />);
    const heading = screen.getByRole('heading', { level: 1, name: 'Users' });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText('Manage your people')).toBeInTheDocument();
  });

  it('demotes the title to an h2 and hides the description in compact mode', () => {
    render(<PageHeader title="Users" description="Hidden in compact" compact />);
    expect(screen.getByRole('heading', { level: 2, name: 'Users' })).toBeInTheDocument();
    expect(screen.queryByText('Hidden in compact')).toBeNull();
  });

  it('renders the optional breadcrumb, actions and filters slots', () => {
    render(
      <PageHeader
        title="Users"
        breadcrumb={<span>crumb</span>}
        actions={<button type="button">+ New</button>}
        filters={<div>filter-row</div>}
      />,
    );
    expect(screen.getByText('crumb')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ New' })).toBeInTheDocument();
    expect(screen.getByText('filter-row')).toBeInTheDocument();
  });

  it('omits optional slots when not provided', () => {
    render(<PageHeader title="Bare" />);
    expect(screen.getByRole('heading', { name: 'Bare' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
