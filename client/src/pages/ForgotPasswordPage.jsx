import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft } from 'lucide-react';
import { forgotPasswordSchema } from '../lib/validations';
import api from '../api/api';

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

  const inputCls = 'w-full px-4 py-3 rounded-xl bg-surface-lighter/60 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all';

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-purple-600 text-white text-2xl font-bold mb-4 shadow-lg shadow-primary-500/25">
            T
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            TMS <span className="text-primary-400">v2</span>
          </h1>
        </div>

        <div className="glass rounded-2xl p-8 glow-primary">
          {sent ? (
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-2">
                <Mail className="size-6 text-emerald-400" aria-hidden="true" />
              </div>
              <h2 className="text-xl font-semibold text-white">Check your email</h2>
              <p className="text-sm text-slate-400">
                If that employee code exists and has an email on file, a reset link has been sent. Check your inbox (and spam folder).
              </p>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 mt-4 text-sm text-primary-400 hover:text-primary-300 transition-colors"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-white mb-2">Forgot password?</h2>
              <p className="text-sm text-slate-400 mb-6">
                Enter your employee code and we'll send a reset link to your registered email.
              </p>

              <form onSubmit={onSubmit} noValidate>
                <div className="mb-5">
                  <label htmlFor="empCode" className="block text-sm font-medium text-slate-300 mb-1.5">
                    Employee Code
                  </label>
                  <input
                    id="empCode"
                    type="text"
                    placeholder="e.g. 000001"
                    autoFocus
                    aria-invalid={!!errors.empCode}
                    aria-describedby={errors.empCode ? 'empCode-error' : undefined}
                    className={`${inputCls} ${errors.empCode ? 'border-red-500/50' : ''}`}
                    {...register('empCode')}
                  />
                  {errors.empCode && (
                    <p id="empCode-error" role="alert" className="mt-1 text-xs text-red-400">
                      {errors.empCode.message}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 text-white font-semibold hover:from-primary-500 hover:to-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary-500/20"
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                      Sending…
                    </span>
                  ) : (
                    'Send reset link'
                  )}
                </button>

                <div className="mt-4 text-center">
                  <Link to="/login" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
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
