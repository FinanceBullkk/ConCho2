import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotificationsPage from '../NotificationsPage';

// S7 — notification center: feed + category filter + per-category delivery
// preferences (in-app/email) + daily digest.

const h = vi.hoisted(() => ({ markAll: vi.fn(), setPrefs: vi.fn() }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../useNotifications', () => ({
  useMyNotifications: () => ({ data: {
    unreadCount: 1,
    data: [
      { id: '1', type: 'assignment_overdue', title: 'Overdue item', body: 'past window', isRead: false, createdAt: '2026-06-15T00:00:00Z' },
      { id: '2', type: 'certificate_expiring', title: 'Cert expiring', body: 'in 6 days', isRead: true, createdAt: '2026-06-14T00:00:00Z' },
    ],
  } }),
  useMarkAllNotificationsRead: () => ({ mutate: h.markAll }),
  useNotificationPreferences: () => ({ data: {
    categories: {
      overdue: { inApp: true, email: true },
      certificates: { inApp: true, email: true },
      completions: { inApp: true, email: false },
      assignments: { inApp: true, email: true },
      system: { inApp: false, email: false },
    },
    digest: 'daily',
  } }),
  useSetNotificationPreferences: () => ({ mutate: h.setPrefs }),
}));

describe('NotificationsPage (S7)', () => {
  beforeEach(() => { h.markAll.mockReset(); h.setPrefs.mockReset(); });

  it('renders the feed and filters by category', async () => {
    const user = userEvent.setup();
    render(<NotificationsPage />);

    expect(screen.getByText('Overdue item')).toBeInTheDocument();
    expect(screen.getByText('Cert expiring')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Overdue' }));
    expect(screen.getByText('Overdue item')).toBeInTheDocument();
    expect(screen.queryByText('Cert expiring')).toBeNull();
  });

  it('toggles a category channel via the preferences endpoint', async () => {
    const user = userEvent.setup();
    render(<NotificationsPage />);

    // Turn OFF email for "Overdue & escalation" (currently true)
    await user.click(screen.getByRole('checkbox', { name: 'Overdue & escalation Email' }));
    expect(h.setPrefs).toHaveBeenCalledTimes(1);
    expect(h.setPrefs.mock.calls[0][0]).toEqual({ categories: { overdue: { inApp: true, email: false } } });
  });

  it('changes the daily-digest setting', async () => {
    const user = userEvent.setup();
    render(<NotificationsPage />);

    await user.click(screen.getByRole('button', { name: 'Weekly' }));
    expect(h.setPrefs.mock.calls[0][0]).toEqual({ digest: 'weekly' });
  });
});
