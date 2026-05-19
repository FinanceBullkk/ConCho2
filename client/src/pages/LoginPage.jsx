import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loginSchema, mfaSchema } from '../lib/validations';

export default function LoginPage() {
  const [step, setStep] = useState('credentials'); // 'credentials' | 'mfa'
  const [mfaPendingToken, setMfaPendingToken] = useState('');
  const { login, verifyMfa } = useAuth();
  const navigate = useNavigate();

  // ── Credentials form ──────────────────────────────────
  const credForm = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { empCode: '', password: '' },
  });

  // ── MFA form ──────────────────────────────────────────
  const mfaForm = useForm({
    resolver: zodResolver(mfaSchema),
    defaultValues: { mfaCode: '' },
  });

  const handleCredSubmit = credForm.handleSubmit(async ({ empCode, password }) => {
    try {
      const result = await login(empCode, password);
      if (result.mfaRequired) {
        setMfaPendingToken(result.mfaPendingToken);
        setStep('mfa');
      } else {
        navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      credForm.setError('root', {
        message: err.response?.data?.message || 'Login failed',
      });
    }
  });

  const handleMfaSubmit = mfaForm.handleSubmit(async ({ mfaCode }) => {
    try {
      await verifyMfa(mfaPendingToken, mfaCode.trim());
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const msg = err.response?.data?.message || 'MFA verification failed';
      mfaForm.setError('root', { message: msg });
      if (msg.toLowerCase().includes('expired')) {
        setStep('credentials');
        setMfaPendingToken('');
        mfaForm.reset();
      }
    }
  });

  const handleBackToCreds = () => {
    setStep('credentials');
    setMfaPendingToken('');
    mfaForm.reset();
    credForm.clearErrors();
  };

  const inputCls =
    'w-full px-4 py-3 rounded-xl bg-muted/60 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all';
  const errCls = 'mt-1 text-xs text-red-400';

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md ">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-purple-600 text-white text-2xl font-bold mb-4 shadow-lg shadow-primary/25">
            T
          </div>
          <h1 className="text-h1 text-foreground tracking-tight">
            TMS <span className="text-primary">v2</span>
          </h1>
          <p className="text-slate-400 mt-1">Training Management System</p>
        </div>

        {/* ── Credentials step ─────────────────────────────── */}
        {step === 'credentials' ? (
          <form onSubmit={handleCredSubmit} className="bg-card border border-border rounded-2xl p-8 " noValidate>
            <h2 className="text-xl font-semibold text-white mb-6">Sign In</h2>

            {credForm.formState.errors.root && (
              <div role="alert" className="mb-4 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm ">
                {credForm.formState.errors.root.message}
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
                  placeholder="e.g. 000001"
                  autoFocus // eslint-disable-line jsx-a11y/no-autofocus
                  aria-invalid={!!credForm.formState.errors.empCode}
                  aria-describedby={credForm.formState.errors.empCode ? 'empCode-error' : undefined}
                  className={`${inputCls} ${credForm.formState.errors.empCode ? 'border-red-500/50' : ''}`}
                  {...credForm.register('empCode')}
                />
                {credForm.formState.errors.empCode && (
                  <p id="empCode-error" role="alert" className={errCls}>
                    {credForm.formState.errors.empCode.message}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1.5">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  aria-invalid={!!credForm.formState.errors.password}
                  aria-describedby={credForm.formState.errors.password ? 'password-error' : undefined}
                  className={`${inputCls} ${credForm.formState.errors.password ? 'border-red-500/50' : ''}`}
                  {...credForm.register('password')}
                />
                {credForm.formState.errors.password && (
                  <p id="password-error" role="alert" className={errCls}>
                    {credForm.formState.errors.password.message}
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end mb-1">
              <Link to="/forgot-password" className="text-xs text-primary hover:text-primary transition-colors">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={credForm.formState.isSubmitting}
              className="w-full mt-6 px-4 py-3 rounded-xl bg-gradient-to-r from-primary to-primary text-white font-semibold hover:from-primary hover:to-primary focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
            >
              {credForm.formState.isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>

            {import.meta.env.DEV && (
              <div className="mt-6 pt-5 border-t border-white/5">
                <p className="text-xs text-slate-500 mb-2">Test accounts:</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { code: '000001', pw: 'admin12345', label: 'Admin' },
                    { code: '000004', pw: 'participant123', label: 'Participant' },
                  ].map((acc) => (
                    <button
                      key={acc.code}
                      type="button"
                      onClick={() => {
                        credForm.setValue('empCode', acc.code);
                        credForm.setValue('password', acc.pw);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white/5 text-xs text-slate-400 hover:bg-white/10 hover:text-white transition-all"
                    >
                      {acc.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </form>
        ) : (
          /* ── MFA step ────────────────────────────────────── */
          <form onSubmit={handleMfaSubmit} className="bg-card border border-border rounded-2xl p-8 " noValidate>
            <h2 className="text-xl font-semibold text-white mb-2">Two-Factor Authentication</h2>
            <p className="text-sm text-slate-400 mb-6">
              Enter the 6-digit code from your authenticator app, or a backup code (XXXXX-XXXXX).
            </p>

            {mfaForm.formState.errors.root && (
              <div role="alert" className="mb-4 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm ">
                {mfaForm.formState.errors.root.message}
              </div>
            )}

            <div>
              <label htmlFor="mfaCode" className="block text-sm font-medium text-slate-300 mb-1.5">
                Verification code
              </label>
              <input
                id="mfaCode"
                type="text"
                inputMode="text"
                autoComplete="one-time-code"
                placeholder="123456 or XXXXX-XXXXX"
                autoFocus // eslint-disable-line jsx-a11y/no-autofocus
                aria-invalid={!!mfaForm.formState.errors.mfaCode}
                aria-describedby={mfaForm.formState.errors.mfaCode ? 'mfaCode-error' : undefined}
                className={`${inputCls} font-mono tracking-widest text-center text-lg ${mfaForm.formState.errors.mfaCode ? 'border-red-500/50' : ''}`}
                {...mfaForm.register('mfaCode')}
              />
              {mfaForm.formState.errors.mfaCode && (
                <p id="mfaCode-error" role="alert" className={errCls}>
                  {mfaForm.formState.errors.mfaCode.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={mfaForm.formState.isSubmitting}
              className="w-full mt-6 px-4 py-3 rounded-xl bg-gradient-to-r from-primary to-primary text-white font-semibold hover:from-primary hover:to-primary focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
            >
              {mfaForm.formState.isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                  Verifying...
                </span>
              ) : (
                'Verify & Sign In'
              )}
            </button>

            <button
              type="button"
              onClick={handleBackToCreds}
              className="w-full mt-3 px-4 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 transition-all text-sm"
            >
              ← Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
