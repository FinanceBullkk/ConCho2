import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../api/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('tms_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(true);

  // Verify token on mount
  useEffect(() => {
    const token = localStorage.getItem('tms_token');
    if (!token) {
      setLoading(false);
      return;
    }
    authAPI.getMe()
      .then((res) => {
        setUser(res.data.data);
        localStorage.setItem('tms_user', JSON.stringify(res.data.data));
      })
      .catch(() => {
        localStorage.removeItem('tms_token');
        localStorage.removeItem('tms_user');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (empCode, password) => {
    const res = await authAPI.login(empCode, password);
    const { token, user: userData } = res.data.data;
    localStorage.setItem('tms_token', token);
    localStorage.setItem('tms_user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  };

  const logout = () => {
    localStorage.removeItem('tms_token');
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
