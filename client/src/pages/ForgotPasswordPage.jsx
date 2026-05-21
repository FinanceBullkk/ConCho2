import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { forgotPasswordSchema } from '../lib/validations';
import api from '../api/api';
import { Button } from '@/components/ui/button';
import { FormField, FormLabel, FormInput, FormError } from '@/components/ui/form';
import { Spinner } from '../components/Spinner';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);

  const methods = useForm({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { empCode: '' },
  });
  const { handleSubmit, formState: { isSubmitting } } = methods;

  const onSubmit = handleSubmit(async ({ empCode }) => {
    try {
      await api.post('/auth/forgot-password', { empCode });
      setSent(true);
    } catch {
      // Always show success to avoid enumeration — errors handled silently
      setSent(true);
    }
  });

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-md">
        {/* Wordmark — matches LoginPage v2 / Phase 3 Screen 7 */}
        <div className="text-center mb-8">
          <h1 className="text-[2.5rem] font-bold tracking-tight text-foreground leading-none">
            TMS<span className="text-primary">.</span>
          </h1>
          <p className="text-muted-foreground mt-2">{t('auth.login.subtitle')}</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-8">
          {sent ? (
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center size-12 rounded-lg bg-success/10 border border-success/20 mb-2">
                <Mail className="size-6 text-success" aria-hidden="true" />
              </div>
              <h2 className="text-h3 text-foreground">{t('auth.forgotPassword.sentTitle')}</h2>
              <p className="text-body text-muted-foreground">
                {t('auth.forgotPassword.sentBody')}
              </p>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 mt-4 text-sm text-primary hover:text-primary/80 transition-colors"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                {t('auth.forgotPassword.backToLogin')}
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-h3 text-foreground mb-2">{t('auth.forgotPassword.title')}</h2>
              <p className="text-body text-muted-foreground mb-6">
                {t('auth.forgotPassword.subtitle')}
              </p>

              <FormProvider {...methods}>
                <form onSubmit={onSubmit} noValidate>
                  <FormField name="empCode" className="mb-5">
                    <FormLabel>{t('auth.login.empCode')}</FormLabel>
                    <FormInput
                      type="text"
                      placeholder={t('auth.login.empCodePlaceholder')}
                      autoFocus  // eslint-disable-line jsx-a11y/no-autofocus
                      className="h-12"
                    />
                    <FormError />
                  </FormField>

                  <Button type="submit" className="w-full h-12" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <><Spinner size={16} />{t('auth.forgotPassword.submitting')}</>
                    ) : t('auth.forgotPassword.submit')}
                  </Button>

                  <div className="mt-4 text-center">
                    <Link to="/login" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                      <ArrowLeft className="size-4" aria-hidden="true" />
                      {t('auth.forgotPassword.backToLogin')}
                    </Link>
                  </div>
                </form>
              </FormProvider>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
