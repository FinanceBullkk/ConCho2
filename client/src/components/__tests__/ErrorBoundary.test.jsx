import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorBoundary from '../ErrorBoundary';

// Mock react-i18next so we can assert the exact translation keys used.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key, // identity — assertions check the key strings
  }),
}));

vi.mock('../../lib/sentry', () => ({
  Sentry: {
    withScope: vi.fn((cb) => cb({ setExtras: vi.fn() })),
    captureException: vi.fn(),
  },
}));

// A child that throws on render — used to force the boundary into hasError.
function Boom() {
  throw new Error('boom');
}

describe('ErrorBoundary — uses i18n keys (audit PR P / FE-009)', () => {
  // React logs caught errors to console.error; silence to keep test output clean.
  let consoleSpy;
  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('renders translation keys instead of hard-coded Vietnamese strings', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    // Our mocked t() returns the key — these assertions prove we are
    // looking up `errorBoundary.*` and not the original literals.
    expect(screen.getByText('errorBoundary.title')).toBeInTheDocument();
    expect(screen.getByText('errorBoundary.body')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'errorBoundary.reload' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'errorBoundary.retry' })).toBeInTheDocument();
  });

  it('does not contain the legacy hard-coded Vietnamese title', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.queryByText('Đã xảy ra lỗi')).not.toBeInTheDocument();
    expect(screen.queryByText('Tải lại trang')).not.toBeInTheDocument();
  });

  it('Try again button has type="button" so it cannot accidentally submit a parent form', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    const retry = screen.getByRole('button', { name: 'errorBoundary.retry' });
    const reload = screen.getByRole('button', { name: 'errorBoundary.reload' });
    expect(retry).toHaveAttribute('type', 'button');
    expect(reload).toHaveAttribute('type', 'button');
  });
});
