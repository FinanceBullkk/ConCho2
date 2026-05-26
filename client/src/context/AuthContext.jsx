import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../api/api';
import { queryClient } from '../queryClient';
import { Sentry } from '../lib/sentry';

const AuthContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

// AUDIT PR 8 (FE-003): Sentry.setUser is called after every authenticated
// state change so server-side stack traces gain user context. Email is
// intentionally NOT included — see SEC-008 redaction policy.
const setSentryUser = (user) => {
  try {
    if (user) {
      Sentry.setUser({
        id: String(user._id || ''),
        username: user.empCode,
        role: user.role,
      });
    } else {
      Sentry.setUser(null);
    }
  } catch {
    // Sentry not initialised (no DSN in dev) → noop.
  }
};

// AUDIT PR 8 (FE-003): drop email + department + position from the
// localStorage payload. PII on shared workstations is a leak surface and
// every protected route re-fetches the full user via /auth/me anyway.
const PERSIST_KEYS = [
  '_id', 'empCode', 'name', 'role', 'status',
  'mfaEnabled', 'mfaEnrollmentRequired', 'mustChangePassword',
];
const persistableUser = (user) => {
  if (!user) return null;
  const out = {};
  for (const k of PERSIST_KEYS) if (k in user) out[k] = user[k];
  return out;
};

export function AuthProvider({ children }) {
  // User profile is still cached in localStorage for fast hydration
  // (role, name, etc. — no sensitive data). The actual auth token
  // is in an HttpOnly cookie, invisible to JavaScript.
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('tms_user');
      const parsed = stored ? JSON.parse(stored) : null;
      setSentryUser(parsed);
      return parsed;
    } catch {
      localStorage.removeItem('tms_user');
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  // Verify session on mount by calling /auth/me.
  // The HttpOnly cookie is sent automatically by the browser.
  useEffect(() => {
    authAPI.getMe()
      .then((res) => {
        const fresh = res.data.data;
        setUser(fresh);
        localStorage.setItem('tms_user', JSON.stringify(persistableUser(fresh)));
        setSentryUser(fresh);
      })
      .catch(() => {
        // Cookie invalid/expired — clear local user data
        localStorage.removeItem('tms_user');
        setUser(null);
        setSentryUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // AUDIT PR 8 (FE-003): multi-tab sync.
  // If another tab calls logout() (or some other path clears tms_user from
  // localStorage), THIS tab must also drop its in-memory user + cache so
  // PII is not left visible on a shared workstation.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== 'tms_user') return;
      if (e.newValue === null) {
        // Removed in another tab → log out here too.
        setUser(null);
        setSentryUser(null);
        try { queryClient.clear(); } catch { /* noop */ }
        // Surface the auth-expired modal so the user knows why their data vanished.
        window.dispatchEvent(new Event('auth-expired'));
        return;
      }
      try {
        const fresh = JSON.parse(e.newValue);
        if (fresh && fresh._id !== user?._id) {
          // Cross-account swap in another tab — invalidate caches that
          // were keyed on the previous user.
          try { queryClient.clear(); } catch { /* noop */ }
        }
        setUser(fresh);
        setSentryUser(fresh);
      } catch {
        /* malformed payload — ignore */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [user?._id]);

  // login() returns one of three shapes:
  //   { mfaRequired: true }                       — collect TOTP, call verifyMfa()
  //                                                 mfaPendingToken is an HttpOnly cookie;
  //                                                 the client never sees or stores it.
  //   { mfaEnrollmentRequired: true, user }       — role enforces MFA, user must enroll
  //                                                 before accessing anything else
  //   { mfaRequired: false, user }                — session fully established
  const login = async (empCode, password) => {
    const res = await authAPI.login(empCode, password);
    const data = res.data.data;

    if (data.mfaRequired) {
      // Don't set user — user is not authenticated until MFA verified.
      return { mfaRequired: true };
    }

    if (data.mfaEnrollmentRequired) {
      // The session cookie is already set (enrollment-required token).
      // Record the user with the flag so ProtectedRoute redirects to setup.
      const userData = { ...data.user, mfaEnrollmentRequired: true };
      localStorage.setItem('tms_user', JSON.stringify(persistableUser(userData)));
      setUser(userData);
      setSentryUser(userData);
      return { mfaEnrollmentRequired: true, user: userData };
    }

    const userData = data.user;
    localStorage.setItem('tms_user', JSON.stringify(persistableUser(userData)));
    setUser(userData);
    setSentryUser(userData);
    return { mfaRequired: false, user: userData };
  };

  // Second leg of MFA-protected login.
  // mfaPendingToken is sent automatically as an HttpOnly cookie — caller
  // only needs to pass the TOTP/backup code.
  const verifyMfa = async (code) => {
    const res = await authAPI.mfaVerifyLogin(code);
    const userData = res.data.data.user;
    localStorage.setItem('tms_user', JSON.stringify(persistableUser(userData)));
    setUser(userData);
    setSentryUser(userData);
    return userData;
  };

  // Refresh the cached user (after MFA enroll/disable, etc).
  const refreshUser = async () => {
    try {
      const res = await authAPI.getMe();
      const userData = res.data.data;
      localStorage.setItem('tms_user', JSON.stringify(persistableUser(userData)));
      setUser(userData);
      setSentryUser(userData);
      return userData;
    } catch {
      return null;
    }
  };

  const logout = async () => {
    try {
      // Tell the server to clear the HttpOnly cookie
      await authAPI.logout();
    } catch {
      // If server is unreachable, still clear local state
    }
    // AUDIT PR 8 (FE-003): clear React Query cache so the next user (or
    // the now-signed-out previous user) cannot see cached PII / lists.
    try { queryClient.clear(); } catch { /* noop */ }
    localStorage.removeItem('tms_user');
    setUser(null);
    setSentryUser(null);
  };

  const isAdmin = user?.role === 'Admin';
  const isTeacher = user?.role === 'Teacher';
  const isParticipant = user?.role === 'Participant';

  return (
    <AuthContext.Provider value={{ user, login, verifyMfa, refreshUser, logout, loading, isAdmin, isTeacher, isParticipant }}>
      {children}
    </AuthContext.Provider>
  );
}
