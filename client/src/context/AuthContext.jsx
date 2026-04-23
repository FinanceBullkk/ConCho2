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

  const login = async (empCode, password) => {
    const res = await authAPI.login(empCode, password);
    const { user: userData } = res.data.data;
    // Only store the user profile — NOT the token.
    // Token is now in an HttpOnly cookie set by the server.
    localStorage.setItem('tms_user', JSON.stringify(userData));
    setUser(userData);
    return userData;
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
    <AuthContext.Provider value={{ user, login, logout, loading, isAdmin, isTeacher, isParticipant }}>
      {children}
    </AuthContext.Provider>
  );
}
