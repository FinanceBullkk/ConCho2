import { Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Spinner } from './Spinner';

export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Audit PR O (FE-006): only show the loading spinner when there is NO
  // cached user. AuthContext seeds `user` from localStorage on boot, so
  // a returning user can render the protected page optimistically while
  // /auth/me is still in-flight. If /auth/me later fails the response
  // interceptor (api.js) dispatches `auth-expired` and the user is
  // booted to /login — same result as before, just without the FOUC.
  if (loading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size={32} />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // MFA enrollment lockdown: when the server flagged this session as
  // enrollment-required (admin role with MFA enforcement on, no enrollment
  // yet), redirect every protected route to the settings page until the
  // user completes enrollment. The settings page renders a special
  // lockdown variant when ?force=mfa is present.
  if (user.mfaEnrollmentRequired && location.pathname !== '/me/settings') {
    return <Navigate to="/me/settings?force=mfa" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-card border border-border rounded-lg p-8 text-center max-w-md">
          <h2 className="text-h3 text-foreground mb-2">Access Denied</h2>
          <p className="text-muted-foreground text-body">Your role ({user.role}) does not have access to this page.</p>
          <Link to="/dashboard" className="inline-block mt-5 px-5 py-2.5 rounded-md bg-primary/15 text-primary text-sm font-medium hover:bg-primary/25 transition-colors">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return children;
}
