import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../api/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export function AuthProvider({ children }) {
  // User profile is still cached in localStorage for fast hydration
  // (role, name, etc. — no sensitive data). The actual auth token
  // is in an HttpOnly cookie, invisible to JavaScript.
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('tms_user');
      return stored ? JSON.parse(stored) : null;
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
        setUser(res.data.data);
        localStorage.setItem('tms_user', JSON.stringify(res.data.data));
      })
      .catch(() => {
        // Cookie invalid/expired — clear local user data
        localStorage.removeItem('tms_user');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // login() returns one of three shapes:
  //   { mfaRequired: true, mfaPendingToken }      — collect TOTP, call verifyMfa()
  //   { mfaEnrollmentRequired: true, user }       — role enforces MFA, user must enroll
  //                                                 before accessing anything else
  //   { mfaRequired: false, user }                — session fully established
  const login = async (empCode, password) => {
    const res = await authAPI.login(empCode, password);
    const data = res.data.data;

    if (data.mfaRequired) {
      // Don't set user — user is not authenticated until MFA verified.
      return { mfaRequired: true, mfaPendingToken: data.mfaPendingToken };
    }

    if (data.mfaEnrollmentRequired) {
      // The session cookie is already set (enrollment-required token).
      // Record the user with the flag so ProtectedRoute redirects to setup.
      const userData = { ...data.user, mfaEnrollmentRequired: true };
      localStorage.setItem('tms_user', JSON.stringify(userData));
      setUser(userData);
      return { mfaEnrollmentRequired: true, user: userData };
    }

    const userData = data.user;
    localStorage.setItem('tms_user', JSON.stringify(userData));
    setUser(userData);
    return { mfaRequired: false, user: userData };
  };

  // Second leg of MFA-protected login.
  const verifyMfa = async (mfaPendingToken, code) => {
    const res = await authAPI.mfaVerifyLogin(mfaPendingToken, code);
    const userData = res.data.data.user;
    localStorage.setItem('tms_user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  };

  // Refresh the cached user (after MFA enroll/disable, etc).
  const refreshUser = async () => {
    try {
      const res = await authAPI.getMe();
      const userData = res.data.data;
      localStorage.setItem('tms_user', JSON.stringify(userData));
      setUser(userData);
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
    localStorage.removeItem('tms_user');
    setUser(null);
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
