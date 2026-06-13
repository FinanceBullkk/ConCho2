import { describe, expect, it, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import NotificationBell from '../NotificationBell';

// Cohesion P5 — in-app notification bell. The feed/mark-read state comes from
// useNotifications (mocked here); these cover the unread badge, the open feed
// list, and the click-to-read-and-navigate behavior.

const h = vi.hoisted(() => ({
  feed: { data: { data: [], unreadCount: 0 } },
  markRead: vi.fn(),
  markAll: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('../useNotifications', () => ({
  useMyNotifications: () => h.feed,
  useMarkNotificationRead: () => ({ mutate: h.markRead }),
  useMarkAllNotificationsRead: () => ({ mutate: h.markAll }),
}));

vi.mock('react-router-dom', async (orig) => ({
  ...(await orig()),
  useNavigate: () => h.navigate,
}));

// Radix needs these jsdom shims to open the dropdown.
beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

const renderBell = () =>
  render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>,
  );

describe('NotificationBell (Cohesion P5)', () => {
  it('shows an unread badge + count in the aria-label', () => {
    h.feed = { data: { data: [], unreadCount: 3 } };
    renderBell();
    expect(screen.getByRole('button', { name: /3 unread/i })).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders no badge when nothing is unread', () => {
    h.feed = { data: { data: [], unreadCount: 0 } };
    renderBell();
    const btn = screen.getByRole('button', { name: /^notifications$/i });
    expect(btn).toBeInTheDocument();
    expect(btn).not.toHaveTextContent(/\d/);
  });

  it('opens the feed and marks-read + navigates on item click', async () => {
    const user = userEvent.setup();
    h.markRead.mockClear();
    h.navigate.mockClear();
    h.feed = { data: { data: [
      { id: 'n1', type: 'assignment_due_soon', title: 'Assignment due soon', body: 'Compliance 101', link: '/home', createdAt: new Date().toISOString(), isRead: false },
    ], unreadCount: 1 } };
    renderBell();

    await user.click(screen.getByRole('button', { name: /1 unread/i }));
    const item = await screen.findByText('Assignment due soon');
    await user.click(item);

    expect(h.markRead).toHaveBeenCalledWith('n1');
    expect(h.navigate).toHaveBeenCalledWith('/home');
  });
});
