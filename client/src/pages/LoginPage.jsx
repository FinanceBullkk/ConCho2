import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const [empCode, setEmpCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(empCode, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-purple-600 text-white text-2xl font-bold mb-4 shadow-lg shadow-primary-500/25">
            T
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            TMS <span className="text-primary-400">v2</span>
          </h1>
          <p className="text-slate-400 mt-1">Training Management System</p>
        </div>

        {/* Form Card */}
        <form onSubmit={handleSubmit} className="glass rounded-2xl p-8 glow-primary">
          <h2 className="text-xl font-semibold text-white mb-6">Sign In</h2>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-accent-red/10 border border-accent-red/20 text-accent-red text-sm animate-fade-in">
              {error}
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label htmlFor="empCode" className="block text-sm font-medium text-slate-300 mb-1.5">
                Employee Code
              </label>
              <input
                id="empCode"
                type="text"
                value={empCode}
                onChange={(e) => setEmpCode(e.target.value)}
                placeholder="e.g. 000001"
                className="w-full px-4 py-3 rounded-xl bg-surface-lighter/60 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 transition-all"
                required
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl bg-surface-lighter/60 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 transition-all"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 px-4 py-3 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 text-white font-semibold hover:from-primary-500 hover:to-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary-500/20"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Signing in...
              </span>
            ) : (
              'Sign In'
            )}
          </button>

          {/* Quick login hints */}
          <div className="mt-6 pt-5 border-t border-white/5">
            <p className="text-xs text-slate-500 mb-2">Test accounts:</p>
            <div className="flex flex-wrap gap-2">
              {[
                { code: '000001', pw: 'admin12345', label: 'Admin' },
                { code: '000002', pw: 'teacher123', label: 'Teacher' },
                { code: '000004', pw: 'participant123', label: 'Participant' },
              ].map((acc) => (
                <button
                  key={acc.code}
                  type="button"
                  onClick={() => { setEmpCode(acc.code); setPassword(acc.pw); }}
                  className="px-2.5 py-1 rounded-lg bg-white/5 text-xs text-slate-400 hover:bg-white/10 hover:text-white transition-all"
                >
                  {acc.label}
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
