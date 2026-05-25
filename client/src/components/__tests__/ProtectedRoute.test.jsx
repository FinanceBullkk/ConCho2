import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../ProtectedRoute';

// Mock AuthContext so each test can paint a different (user, loading) state.
const mockUseAuth = vi.fn();
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

const renderProtected = (initialPath = '/') =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <div data-testid="page">Secret content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div data-testid="login">Login screen</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('ProtectedRoute — optimistic render (audit PR O / FE-006)', () => {
  it('renders cached user content immediately while /auth/me is in flight', () => {
    // The classic FOUC case: AuthContext seeded from localStorage so `user`
    // is non-null, but the background /auth/me request is still loading.
    mockUseAuth.mockReturnValue({
      user: { _id: 'u1', role: 'Admin' },
      loading: true,
    });
    renderProtected();
    expect(screen.getByTestId('page')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the spinner only when no cached user AND still loading', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    const { container } = renderProtected();
    // Spinner renders a status-role indicator (size=32 span); just assert
    // the protected content is NOT rendered yet and we are still loading.
    expect(screen.queryByTestId('page')).not.toBeInTheDocument();
    expect(container.querySelector('.min-h-screen')).toBeInTheDocument();
  });

  it('redirects to /login after loading completes with no user', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    renderProtected();
    expect(screen.getByTestId('login')).toBeInTheDocument();
  });
});
