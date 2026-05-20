import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft } from 'lucide-react';
import { forgotPasswordSchema } from '../lib/validations';
import api from '../api/api';
import { Button } from '@/components/ui/button';
import { FormField, FormLabel, FormInput, FormError } from '@/components/ui/form';
import { Spinner } from '../components/Spinner';

export default function ForgotPasswordPage() {
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
          <p className="text-muted-foreground mt-2">Training Management System</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-8">
          {sent ? (
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center size-12 rounded-lg bg-success/10 border border-success/20 mb-2">
                <Mail className="size-6 text-success" aria-hidden="true" />
              </div>
              <h2 className="text-h3 text-foreground">Check your email</h2>
              <p className="text-body text-muted-foreground">
                If that employee code exists and has an email on file, a reset link has been sent. Check your inbox (and spam folder).
              </p>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 mt-4 text-sm text-primary hover:text-primary/80 transition-colors"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-h3 text-foreground mb-2">Forgot password?</h2>
              <p className="text-body text-muted-foreground mb-6">
                Enter your employee code and we&apos;ll send a reset link to your registered email.
              </p>

              <FormProvider {...methods}>
                <form onSubmit={onSubmit} noValidate>
                  <FormField name="empCode" className="mb-5">
                    <FormLabel>Employee Code</FormLabel>
                    <FormInput
                      type="text"
                      placeholder="e.g. 000001"
                      autoFocus  // eslint-disable-line jsx-a11y/no-autofocus
                      className="h-12"
                    />
                    <FormError />
                  </FormField>

                  <Button type="submit" className="w-full h-12" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <><Spinner size={16} />Sending…</>
                    ) : 'Send reset link'}
                  </Button>

                  <div className="mt-4 text-center">
                    <Link to="/login" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                      <ArrowLeft className="size-4" aria-hidden="true" />
                      Back to sign in
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
