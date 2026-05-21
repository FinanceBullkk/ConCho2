import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { loginSchema, mfaSchema } from '../lib/validations';
import { Button } from '@/components/ui/button';
import { Spinner } from '../components/Spinner';
import { cn } from '@/lib/utils';

export default function LoginPage() {
  const { t } = useTranslation();
  const [step, setStep] = useState('credentials'); // 'credentials' | 'mfa'
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
        setStep('mfa');
      } else {
        navigate('/home', { replace: true });
      }
    } catch (err) {
      credForm.setError('root', {
        message: err.response?.data?.message || t('auth.login.errFallback'),
      });
    }
  });

  const handleMfaSubmit = mfaForm.handleSubmit(async ({ mfaCode }) => {
    try {
      await verifyMfa(mfaCode.trim());
      navigate('/home', { replace: true });
    } catch (err) {
      const msg = err.response?.data?.message || t('auth.mfa.errFallback');
      mfaForm.setError('root', { message: msg });
      if (msg.toLowerCase().includes('expired')) {
        setStep('credentials');
        mfaForm.reset();
      }
    }
  });

  const handleBackToCreds = () => {
    setStep('credentials');
    mfaForm.reset();
    credForm.clearErrors();
  };

  const INPUT_CLS =
    'w-full px-4 h-12 rounded-md bg-background border border-input text-foreground placeholder:text-subtle-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors';
  const ERR_CLS = 'mt-1 text-xs text-destructive';

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-md">
        {/* Wordmark */}
        <div className="text-center mb-8">
          <h1 className="text-[2.5rem] font-bold tracking-tight text-foreground leading-none">
            TMS<span className="text-primary">.</span>
          </h1>
          <p className="text-muted-foreground mt-2">{t('auth.login.subtitle')}</p>
        </div>

        {/* ── Credentials step ─────────────────────────────── */}
        {step === 'credentials' ? (
          <form onSubmit={handleCredSubmit} className="bg-card border border-border rounded-lg p-8" noValidate>
            <h2 className="text-h3 text-foreground mb-6">{t('auth.login.title')}</h2>

            {credForm.formState.errors.root && (
              <div role="alert" className="mb-4 px-3 py-2.5 rounded-md bg-destructive-tint border border-destructive/30 text-destructive text-sm">
                {credForm.formState.errors.root.message}
              </div>
            )}

            <div className="space-y-5">
              <div>
                <label htmlFor="empCode" className="block text-small font-medium text-muted-foreground mb-1.5">
                  {t('auth.login.empCode')}
                </label>
                <input
                  id="empCode"
                  type="text"
                  placeholder={t('auth.login.empCodePlaceholder')}
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
                  {t('auth.login.password')}
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
                {t('auth.login.forgotPassword')}
              </Link>
            </div>

            <Button
              type="submit"
              className="w-full mt-4 h-12"
              disabled={credForm.formState.isSubmitting}
            >
              {credForm.formState.isSubmitting ? (
                <><Spinner size={16} />{t('auth.login.submitting')}</>
              ) : t('auth.login.submit')}
            </Button>

            {import.meta.env.DEV && (
              <div className="mt-6 pt-5 border-t border-border">
                <p className="text-overline text-subtle-foreground mb-2">{t('auth.login.devAccounts')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { code: '000001', pw: 'admin12345',    labelKey: 'auth.login.roleAdmin' },
                    { code: '000004', pw: 'participant123', labelKey: 'auth.login.roleParticipant' },
                  ].map((acc) => (
                    <button
                      key={acc.code}
                      type="button"
                      onClick={() => {
                        credForm.setValue('empCode', acc.code);
                        credForm.setValue('password', acc.pw);
                      }}
                      className="px-2 py-0.5 rounded font-mono text-[11px] bg-muted text-subtle-foreground hover:bg-accent hover:text-foreground transition-colors"
                    >
                      {t(acc.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </form>
        ) : (
          /* ── MFA step ────────────────────────────────────── */
          <form onSubmit={handleMfaSubmit} className="bg-card border border-border rounded-lg p-8" noValidate>
            <div className="flex items-center justify-center size-10 mx-auto rounded-md bg-primary-tint mb-3">
              <KeyRound className="size-5 text-primary" aria-hidden="true" />
            </div>
            <h2 className="text-h3 text-foreground text-center mb-2">{t('auth.mfa.title')}</h2>
            <p className="text-body text-muted-foreground text-center mb-6">
              {t('auth.mfa.description')}
            </p>

            {mfaForm.formState.errors.root && (
              <div role="alert" className="mb-4 px-3 py-2.5 rounded-md bg-destructive-tint border border-destructive/30 text-destructive text-sm">
                {mfaForm.formState.errors.root.message}
              </div>
            )}

            <div>
              <label htmlFor="mfaCode" className="block text-small font-medium text-muted-foreground mb-1.5">
                {t('auth.mfa.codeLabel')}
              </label>
              <input
                id="mfaCode"
                type="text"
                inputMode="text"
                autoComplete="one-time-code"
                placeholder={t('auth.mfa.codePlaceholder')}
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
                <><Spinner size={16} />{t('auth.mfa.submitting')}</>
              ) : t('auth.mfa.submit')}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full mt-3"
              onClick={handleBackToCreds}
            >
              {t('auth.mfa.backToLogin')}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
