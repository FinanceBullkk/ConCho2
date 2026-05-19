import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle } from 'lucide-react';
import { resetPasswordSchema } from '../lib/validations';
import api from '../api/api';
import { Button } from '@/components/ui/button';
import { Spinner } from '../components/Spinner';
import { cn } from '@/lib/utils';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const [done, setDone] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting }, setError } = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  });

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

  const INPUT_CLS =
    'w-full px-4 h-12 rounded-md bg-background border border-input text-foreground placeholder:text-subtle-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors';
  const ERR_CLS = 'mt-1 text-xs text-destructive';

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-card border border-border rounded-lg p-8 max-w-md w-full text-center space-y-4">
          <XCircle className="size-12 text-destructive mx-auto" aria-hidden="true" />
          <h2 className="text-h3 text-foreground">Invalid reset link</h2>
          <p className="text-body text-muted-foreground">This link is missing a reset token. Please request a new one.</p>
          <Button asChild className="mt-2">
            <Link to="/forgot-password">Request reset link</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center size-16 rounded-lg bg-primary text-primary-foreground text-2xl font-bold mb-4">
            T
          </div>
          <h1 className="text-h1 text-foreground tracking-tight">TMS <span className="text-primary">v2</span></h1>
        </div>

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
              <p className="text-body text-muted-foreground mb-6">Choose a strong password (at least 10 characters).</p>

              {errors.root && (
                <div role="alert" className="mb-4 px-3 py-2.5 rounded-md bg-destructive-tint border border-destructive/30 text-destructive text-sm">
                  {errors.root.message}
                </div>
              )}

              <form onSubmit={onSubmit} noValidate className="space-y-4">
                {[
                  { name: 'password', label: 'New password' },
                  { name: 'confirm', label: 'Confirm password' },
                ].map(({ name, label }) => (
                  <div key={name}>
                    <label htmlFor={name} className="block text-small font-medium text-muted-foreground mb-1.5">{label}</label>
                    <input
                      id={name}
                      type="password"
                      placeholder="••••••••••"
                      aria-invalid={!!errors[name]}
                      aria-describedby={errors[name] ? `${name}-error` : undefined}
                      className={cn(INPUT_CLS, errors[name] && 'border-destructive')}
                      {...register(name)}
                    />
                    {errors[name] && (
                      <p id={`${name}-error`} role="alert" className={ERR_CLS}>
                        {errors[name].message}
                      </p>
                    )}
                  </div>
                ))}

                <Button type="submit" className="w-full h-12 mt-2" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <><Spinner size={16} />Updating…</>
                  ) : 'Reset password'}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
