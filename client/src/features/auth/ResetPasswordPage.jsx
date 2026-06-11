import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useSearchParams, useParams, Link, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { resetPasswordSchema } from '../../lib/validations';
import api from '../../api/api';
import { Button } from '@/components/ui/button';
import { FormField, FormLabel, FormInput, FormError } from '@/components/ui/form';
import { PasswordStrength, scorePassword } from '@/components/PasswordStrength';
import { Spinner } from '../../components/Spinner';

// Wordmark used across all 3 public-auth surfaces (LoginPage, Forgot, Reset).
// Kept inline rather than a shared component — only 3 callers, intentional copy.
function AuthWordmark() {
  const { t } = useTranslation();
  return (
    <div className="text-center mb-8">
      <h1 className="text-[2.5rem] font-bold tracking-tight text-foreground leading-none">
        TMS<span className="text-primary">.</span>
      </h1>
      <p className="text-muted-foreground mt-2">{t('auth.login.subtitle')}</p>
    </div>
  );
}

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  // SEC-005: prefer path-style /reset-password/:token. Fall back to
  // legacy ?token=... so emails sent before the path-style rolled out
  // (max 1h in flight) still work.
  const { token: pathToken } = useParams();
  const [searchParams] = useSearchParams();
  const token = pathToken || searchParams.get('token');
  const navigate = useNavigate();
  const [done, setDone] = useState(false);

  const methods = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  });
  const { handleSubmit, formState: { errors, isSubmitting }, setError, watch } = methods;
  const passwordValue = watch('password');
  const meetsStrength = scorePassword(passwordValue) >= 2;

  const onSubmit = handleSubmit(async ({ password }) => {
    try {
      // SEC-005: post to the path-style endpoint so the token never travels
      // in the request body. The body now carries only the new password.
      // Both server routes still accept body-token for legacy clients.
      await api.post(`/auth/reset-password/${encodeURIComponent(token)}`, { password });
      setDone(true);
      setTimeout(() => navigate('/login', { replace: true }), 3000);
    } catch (err) {
      setError('root', {
        message: err.response?.data?.message || t('auth.resetPassword.errFallback'),
      });
    }
  });

  // Invalid-token state — wears the same shell as the valid state per
  // Screen 7 Cleanup PR §2. Lands a borked link on a recognisable surface.
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-background">
        <div className="w-full max-w-md">
          <AuthWordmark />
          <div className="bg-card border border-border rounded-lg p-8 text-center space-y-4">
            <XCircle className="size-12 text-destructive mx-auto" aria-hidden="true" />
            <h2 className="text-h3 text-foreground">{t('auth.resetPassword.invalidTitle')}</h2>
            <p className="text-body text-muted-foreground">
              {t('auth.resetPassword.invalidBody')}
            </p>
            <Button asChild className="mt-2">
              <Link to="/forgot-password">{t('auth.resetPassword.invalidButton')}</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-md">
        <AuthWordmark />

        <div className="bg-card border border-border rounded-lg p-8">
          {done ? (
            <div className="text-center space-y-4">
              <CheckCircle className="size-12 text-success mx-auto" aria-hidden="true" />
              <h2 className="text-h3 text-foreground">{t('auth.resetPassword.successTitle')}</h2>
              <p className="text-body text-muted-foreground">{t('auth.resetPassword.successBody')}</p>
            </div>
          ) : (
            <>
              <h2 className="text-h3 text-foreground mb-2">{t('auth.resetPassword.title')}</h2>
              <p className="text-body text-muted-foreground mb-6">
                {t('auth.resetPassword.subtitle')}
              </p>

              {errors.root && (
                <div role="alert" className="mb-4 px-3 py-2.5 rounded-md bg-destructive-tint border border-destructive/30 text-destructive text-sm">
                  {errors.root.message}
                </div>
              )}

              <FormProvider {...methods}>
                <form onSubmit={onSubmit} noValidate className="space-y-4">
                  <FormField name="password">
                    <FormLabel>{t('auth.resetPassword.newPwd')}</FormLabel>
                    <FormInput
                      type="password"
                      placeholder="••••••••••"
                      autoComplete="new-password"
                      className="h-12"
                    />
                    <FormError />
                    <PasswordStrength value={passwordValue} labels={t('passwordStrength', { returnObjects: true })} className="mt-1" />
                  </FormField>

                  <FormField name="confirm">
                    <FormLabel>{t('auth.resetPassword.confirmPwd')}</FormLabel>
                    <FormInput
                      type="password"
                      placeholder="••••••••••"
                      autoComplete="new-password"
                      className="h-12"
                    />
                    <FormError />
                  </FormField>

                  <Button
                    type="submit"
                    className="w-full h-12 mt-2"
                    disabled={isSubmitting || !meetsStrength}
                    title={!meetsStrength ? t('auth.resetPassword.weakPasswordTooltip') : undefined}
                  >
                    {isSubmitting ? (
                      <><Spinner size={16} />{t('auth.resetPassword.submitting')}</>
                    ) : t('auth.resetPassword.submit')}
                  </Button>
                </form>
              </FormProvider>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
