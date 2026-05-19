import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loginSchema, mfaSchema } from '../lib/validations';
import { Button } from '@/components/ui/button';
import { Spinner } from '../components/Spinner';
import { cn } from '@/lib/utils';

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

  const INPUT_CLS =
    'w-full px-4 h-12 rounded-md bg-background border border-input text-foreground placeholder:text-subtle-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors';
  const ERR_CLS = 'mt-1 text-xs text-destructive';

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center size-16 rounded-lg bg-primary text-primary-foreground text-2xl font-bold mb-4">
            T
          </div>
          <h1 className="text-h1 text-foreground tracking-tight">
            TMS <span className="text-primary">v2</span>
          </h1>
          <p className="text-muted-foreground mt-1">Training Management System</p>
        </div>

        {/* ── Credentials step ─────────────────────────────── */}
        {step === 'credentials' ? (
          <form onSubmit={handleCredSubmit} className="bg-card border border-border rounded-lg p-8" noValidate>
            <h2 className="text-h3 text-foreground mb-6">Sign In</h2>

            {credForm.formState.errors.root && (
              <div role="alert" className="mb-4 px-3 py-2.5 rounded-md bg-destructive-tint border border-destructive/30 text-destructive text-sm">
                {credForm.formState.errors.root.message}
              </div>
            )}

            <div className="space-y-5">
              <div>
                <label htmlFor="empCode" className="block text-small font-medium text-muted-foreground mb-1.5">
                  Employee Code
                </label>
                <input
                  id="empCode"
                  type="text"
                  placeholder="e.g. 000001"
                  autoFocus // eslint-disable-line jsx-a11y/no-autofocus
                  aria-invalid={!!credForm.formState.errors.empCode}
                  aria-describedby={credForm.formState.errors.empCode ? 'empCode-error' : undefined}
                  className={cn(INPUT_CLS, credForm.formState.errors.empCode && 'border-destructive')}
                  {...credForm.register('empCode')}
                />
                {credForm.formState.errors.empCode && (
                  <p id="empCode-error" role="alert" className={ERR_CLS}>
                    {credForm.formState.errors.empCode.message}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="password" className="block text-small font-medium text-muted-foreground mb-1.5">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  aria-invalid={!!credForm.formState.errors.password}
                  aria-describedby={credForm.formState.errors.password ? 'password-error' : undefined}
                  className={cn(INPUT_CLS, credForm.formState.errors.password && 'border-destructive')}
                  {...credForm.register('password')}
                />
                {credForm.formState.errors.password && (
                  <p id="password-error" role="alert" className={ERR_CLS}>
                    {credForm.formState.errors.password.message}
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end mt-2 mb-1">
              <Link to="/forgot-password" className="text-xs text-primary hover:text-primary/80 transition-colors">
                Forgot password?
              </Link>
            </div>

            <Button
              type="submit"
              className="w-full mt-4 h-12"
              disabled={credForm.formState.isSubmitting}
            >
              {credForm.formState.isSubmitting ? (
                <><Spinner size={16} />Signing in…</>
              ) : 'Sign In'}
            </Button>

            {import.meta.env.DEV && (
              <div className="mt-6 pt-5 border-t border-border">
                <p className="text-xs text-subtle-foreground mb-2">Test accounts:</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { code: '000001', pw: 'admin12345',    label: 'Admin' },
                    { code: '000004', pw: 'participant123', label: 'Participant' },
                  ].map((acc) => (
                    <button
                      key={acc.code}
                      type="button"
                      onClick={() => {
                        credForm.setValue('empCode', acc.code);
                        credForm.setValue('password', acc.pw);
                      }}
                      className="px-2.5 py-1 rounded-md bg-muted text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
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
          <form onSubmit={handleMfaSubmit} className="bg-card border border-border rounded-lg p-8" noValidate>
            <h2 className="text-h3 text-foreground mb-2">Two-Factor Authentication</h2>
            <p className="text-body text-muted-foreground mb-6">
              Enter the 6-digit code from your authenticator app, or a backup code (XXXXX-XXXXX).
            </p>

            {mfaForm.formState.errors.root && (
              <div role="alert" className="mb-4 px-3 py-2.5 rounded-md bg-destructive-tint border border-destructive/30 text-destructive text-sm">
                {mfaForm.formState.errors.root.message}
              </div>
            )}

            <div>
              <label htmlFor="mfaCode" className="block text-small font-medium text-muted-foreground mb-1.5">
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
                className={cn(INPUT_CLS, 'font-mono tracking-widest text-center text-lg', mfaForm.formState.errors.mfaCode && 'border-destructive')}
                {...mfaForm.register('mfaCode')}
              />
              {mfaForm.formState.errors.mfaCode && (
                <p id="mfaCode-error" role="alert" className={ERR_CLS}>
                  {mfaForm.formState.errors.mfaCode.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full mt-6 h-12"
              disabled={mfaForm.formState.isSubmitting}
            >
              {mfaForm.formState.isSubmitting ? (
                <><Spinner size={16} />Verifying…</>
              ) : 'Verify & Sign In'}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full mt-3"
              onClick={handleBackToCreds}
            >
              ← Back to sign in
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
