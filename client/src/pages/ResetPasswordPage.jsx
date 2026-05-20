import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle } from 'lucide-react';
import { resetPasswordSchema } from '../lib/validations';
import api from '../api/api';
import { Button } from '@/components/ui/button';
import { FormField, FormLabel, FormInput, FormError } from '@/components/ui/form';
import { PasswordStrength, scorePassword } from '@/components/PasswordStrength';
import { Spinner } from '../components/Spinner';

// Wordmark used across all 3 public-auth surfaces (LoginPage, Forgot, Reset).
// Kept inline rather than a shared component — only 3 callers, intentional copy.
function AuthWordmark() {
  return (
    <div className="text-center mb-8">
      <h1 className="text-[2.5rem] font-bold tracking-tight text-foreground leading-none">
        TMS<span className="text-primary">.</span>
      </h1>
      <p className="text-muted-foreground mt-2">Training Management System</p>
    </div>
  );
}

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
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
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => navigate('/login', { replace: true }), 3000);
    } catch (err) {
      setError('root', {
        message: err.response?.data?.message || 'Reset failed. The link may have expired.',
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
            <h2 className="text-h3 text-foreground">Invalid reset link</h2>
            <p className="text-body text-muted-foreground">
              This link is missing a reset token. Please request a new one.
            </p>
            <Button asChild className="mt-2">
              <Link to="/forgot-password">Request reset link</Link>
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
              <h2 className="text-h3 text-foreground">Password updated!</h2>
              <p className="text-body text-muted-foreground">Redirecting you to sign in…</p>
            </div>
          ) : (
            <>
              <h2 className="text-h3 text-foreground mb-2">Set new password</h2>
              <p className="text-body text-muted-foreground mb-6">
                Choose a strong password (at least 10 characters).
              </p>

              {errors.root && (
                <div role="alert" className="mb-4 px-3 py-2.5 rounded-md bg-destructive-tint border border-destructive/30 text-destructive text-sm">
                  {errors.root.message}
                </div>
              )}

              <FormProvider {...methods}>
                <form onSubmit={onSubmit} noValidate className="space-y-4">
                  <FormField name="password">
                    <FormLabel>New password</FormLabel>
                    <FormInput
                      type="password"
                      placeholder="••••••••••"
                      autoComplete="new-password"
                      className="h-12"
                    />
                    <FormError />
                    <PasswordStrength value={passwordValue} className="mt-1" />
                  </FormField>

                  <FormField name="confirm">
                    <FormLabel>Confirm password</FormLabel>
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
                    title={!meetsStrength ? 'Password too weak — needs at least 2 strength criteria' : undefined}
                  >
                    {isSubmitting ? (
                      <><Spinner size={16} />Resetting…</>
                    ) : 'Reset password'}
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
