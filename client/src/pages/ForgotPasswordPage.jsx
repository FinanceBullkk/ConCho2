import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft } from 'lucide-react';
import { forgotPasswordSchema } from '../lib/validations';
import api from '../api/api';
import { Button } from '@/components/ui/button';
import { Spinner } from '../components/Spinner';
import { cn } from '@/lib/utils';

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { empCode: '' },
  });

  const onSubmit = handleSubmit(async ({ empCode }) => {
    try {
      await api.post('/auth/forgot-password', { empCode });
      setSent(true);
    } catch {
      // Always show success to avoid enumeration — errors handled silently
      setSent(true);
    }
  });

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
                Enter your employee code and we'll send a reset link to your registered email.
              </p>

              <form onSubmit={onSubmit} noValidate>
                <div className="mb-5">
                  <label htmlFor="empCode" className="block text-small font-medium text-muted-foreground mb-1.5">
                    Employee Code
                  </label>
                  <input
                    id="empCode"
                    type="text"
                    placeholder="e.g. 000001"
                    autoFocus // eslint-disable-line jsx-a11y/no-autofocus
                    aria-invalid={!!errors.empCode}
                    aria-describedby={errors.empCode ? 'empCode-error' : undefined}
                    className={cn(INPUT_CLS, errors.empCode && 'border-destructive')}
                    {...register('empCode')}
                  />
                  {errors.empCode && (
                    <p id="empCode-error" role="alert" className={ERR_CLS}>
                      {errors.empCode.message}
                    </p>
                  )}
                </div>

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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
