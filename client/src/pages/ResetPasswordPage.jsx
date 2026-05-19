import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle } from 'lucide-react';
import { resetPasswordSchema } from '../lib/validations';
import api from '../api/api';

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

  const inputCls = 'w-full px-4 py-3 rounded-xl bg-muted/60 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all';

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-card border border-border rounded-2xl p-8 max-w-md w-full text-center space-y-4">
          <XCircle className="size-12 text-red-400 mx-auto" aria-hidden="true" />
          <h2 className="text-xl font-semibold text-white">Invalid reset link</h2>
          <p className="text-slate-400 text-sm">This link is missing a reset token. Please request a new one.</p>
          <Link to="/forgot-password" className="inline-block mt-2 px-4 py-2 rounded-xl bg-primary text-white text-sm hover:bg-primary transition-all">
            Request reset link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md ">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-purple-600 text-white text-2xl font-bold mb-4 shadow-lg shadow-primary/25">
            T
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">TMS <span className="text-primary">v2</span></h1>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 ">
          {done ? (
            <div className="text-center space-y-4">
              <CheckCircle className="size-12 text-emerald-400 mx-auto" aria-hidden="true" />
              <h2 className="text-xl font-semibold text-white">Password updated!</h2>
              <p className="text-sm text-slate-400">Redirecting you to sign in…</p>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-white mb-2">Set new password</h2>
              <p className="text-sm text-slate-400 mb-6">Choose a strong password (at least 10 characters).</p>

              {errors.root && (
                <div role="alert" className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {errors.root.message}
                </div>
              )}

              <form onSubmit={onSubmit} noValidate className="space-y-4">
                {[
                  { name: 'password', label: 'New password' },
                  { name: 'confirm', label: 'Confirm password' },
                ].map(({ name, label }) => (
                  <div key={name}>
                    <label htmlFor={name} className="block text-sm font-medium text-slate-300 mb-1.5">{label}</label>
                    <input
                      id={name}
                      type="password"
                      placeholder="••••••••••"
                      aria-invalid={!!errors[name]}
                      aria-describedby={errors[name] ? `${name}-error` : undefined}
                      className={`${inputCls} ${errors[name] ? 'border-red-500/50' : ''}`}
                      {...register(name)}
                    />
                    {errors[name] && (
                      <p id={`${name}-error`} role="alert" className="mt-1 text-xs text-red-400">
                        {errors[name].message}
                      </p>
                    )}
                  </div>
                ))}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full mt-2 px-4 py-3 rounded-xl bg-gradient-to-r from-primary to-primary text-white font-semibold hover:from-primary hover:to-primary focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                      Updating…
                    </span>
                  ) : (
                    'Reset password'
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
