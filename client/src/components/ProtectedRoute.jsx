import { Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
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
        <div className="bg-card border border-border rounded-2xl p-8 text-center max-w-md">
          <div className="text-4xl mb-4">🚫</div>
          <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-slate-400">Your role ({user.role}) does not have access to this page.</p>
          <Link to="/dashboard" className="inline-block mt-5 px-5 py-2.5 rounded-xl bg-primary/20 text-primary text-sm font-medium hover:bg-primary/30 transition-all">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return children;
}
