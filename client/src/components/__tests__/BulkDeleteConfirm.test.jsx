import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BulkDeleteConfirm } from '../BulkDeleteConfirm';

const setup = (props = {}) =>
  render(
    <BulkDeleteConfirm
      open
      count={3}
      entityName="user"
      onClose={() => {}}
      onConfirm={() => Promise.resolve()}
      {...props}
    />,
  );

describe('BulkDeleteConfirm', () => {
  it('renders nothing while closed', () => {
    const { container } = render(<BulkDeleteConfirm open={false} count={3} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('pluralises the entity in the heading by count', () => {
    setup({ count: 3, entityName: 'user' });
    expect(screen.getByRole('heading', { name: /delete 3 users\?/i })).toBeInTheDocument();
  });

  it('uses the singular noun for a count of one', () => {
    setup({ count: 1, entityName: 'team' });
    expect(screen.getByRole('heading', { name: /delete 1 team\?/i })).toBeInTheDocument();
  });

  it('keeps Delete disabled until the confirmation word is typed', async () => {
    setup({ count: 3 });
    const del = screen.getByRole('button', { name: /delete 3/i });
    expect(del).toBeDisabled();

    await userEvent.type(screen.getByRole('textbox'), 'delete');
    expect(del).toBeEnabled();
  });

  it('flags the input invalid for non-matching text and stays disabled', async () => {
    setup();
    await userEvent.type(screen.getByRole('textbox'), 'nope');
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: /delete 3/i })).toBeDisabled();
  });

  it('accepts the confirmation case-insensitively and calls onConfirm on submit', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    setup({ onConfirm });
    await userEvent.type(screen.getByRole('textbox'), '  DELETE  ');
    await userEvent.click(screen.getByRole('button', { name: /delete 3/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('invokes onClose from Cancel', async () => {
    const onClose = vi.fn();
    setup({ onClose });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a pending state and blocks the input while deleting', () => {
    setup({ isDeleting: true });
    expect(screen.getByText(/deleting…/i)).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeDisabled();
  });
});
