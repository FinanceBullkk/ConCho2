import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Breadcrumbs } from '../Breadcrumbs';

const renderTrail = (items) =>
  render(
    <MemoryRouter>
      <Breadcrumbs items={items} />
    </MemoryRouter>,
  );

describe('Breadcrumbs', () => {
  it('renders nothing for empty or missing items', () => {
    const { container, rerender } = renderTrail([]);
    expect(container).toBeEmptyDOMElement();
    rerender(
      <MemoryRouter>
        <Breadcrumbs />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('links every intermediate item that has a `to`', () => {
    renderTrail([
      { label: 'Home', to: '/' },
      { label: 'Academy', to: '/academy' },
      { label: 'CLS-001' },
    ]);
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Academy' })).toHaveAttribute('href', '/academy');
  });

  it('renders the last item as plain text even when it has a `to`', () => {
    renderTrail([
      { label: 'Home', to: '/' },
      { label: 'Current', to: '/current' },
    ]);
    // "Current" is last → not a link
    expect(screen.queryByRole('link', { name: 'Current' })).toBeNull();
    expect(screen.getByText('Current')).toBeInTheDocument();
  });

  it('exposes a labelled breadcrumb navigation landmark', () => {
    renderTrail([{ label: 'Only' }]);
    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument();
  });
});
