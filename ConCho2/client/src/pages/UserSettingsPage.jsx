import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Shield, ShieldCheck, KeyRound, Copy, Check, AlertTriangle, Lock } from 'lucide-react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../api/api';
import { changePasswordSchema } from '../lib/validations';
import { Button } from '@/components/ui/button';
import { FormField, FormLabel, FormInput, FormError, FormDescription } from '@/components/ui/form';
import { PasswordStrength, scorePassword } from '@/components/PasswordStrength';
import { StatusBadge } from '@/components/StatusBadge';

// ──────────────────────────────────────────────────────────
// User Settings — change password, manage MFA
// ──────────────────────────────────────────────────────────
// Available to every authenticated user (any role) for their own
// account. Admin-on-other-user actions live elsewhere (UsersPage).
// ──────────────────────────────────────────────────────────

function ChangePasswordSection() {
  const { t } = useTranslation();
  const methods = useForm({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { current: '', next: '', confirm: '' },
  });
  const { handleSubmit, reset, setError, watch, formState: { errors, isSubmitting } } = methods;
  const nextValue = watch('next');
  const meetsStrength = scorePassword(nextValue) >= 2;

  const submit = handleSubmit(async ({ current, next }) => {
    try {
      await authAPI.changePassword(current, next);
      toast.success(t('userSettings.changePwd.successToast'));
      reset();
    } catch (err) {
      setError('root', { message: err.response?.data?.message || t('userSettings.changePwd.errFallback') });
    }
  });

  return (
    <FormProvider {...methods}>
      <form onSubmit={submit} className="bg-card border border-border rounded-lg p-6 space-y-4" noValidate>
        <div className="flex items-center gap-2">
          <KeyRound className="size-5 text-primary" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-foreground">{t('userSettings.changePwd.title')}</h2>
        </div>

        {errors.root && (
          <div role="alert" className="px-3 py-2 rounded-lg bg-destructive-tint border border-destructive/20 text-destructive text-sm">
            {errors.root.message}
          </div>
        )}

        <FormField name="current">
          <FormLabel>{t('userSettings.changePwd.currentPwd')}</FormLabel>
          <FormInput type="password" autoComplete="current-password" className="h-11" />
          <FormError />
        </FormField>

        <FormField name="next">
          <FormLabel>{t('userSettings.changePwd.newPwd')}</FormLabel>
          <FormInput type="password" autoComplete="new-password" className="h-11" />
          <FormError />
          <FormDescription>{t('userSettings.changePwd.newPwdHint')}</FormDescription>
          <PasswordStrength value={nextValue} labels={t('passwordStrength', { returnObjects: true })} className="mt-1" />
        </FormField>

        <FormField name="confirm">
          <FormLabel>{t('userSettings.changePwd.confirmPwd')}</FormLabel>
          <FormInput type="password" autoComplete="new-password" className="h-11" />
          <FormError />
        </FormField>

        <Button
          type="submit"
          disabled={isSubmitting || !meetsStrength}
          className="w-full"
          title={!meetsStrength ? t('userSettings.changePwd.weakTooltip') : undefined}
        >
          {isSubmitting ? t('userSettings.changePwd.submitting') : t('userSettings.changePwd.submit')}
        </Button>
      </form>
    </FormProvider>
  );
}

function BackupCodesPanel({ codes, onClose }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const text = codes.join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — user can still copy manually.
    }
  };

  return (
    <div className="rounded-md border border-warning/30 bg-warning/5 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="size-5 text-warning shrink-0 mt-0.5" />
        <div className="text-sm text-warning">
          <strong>{t('userSettings.backupCodes.warning')}</strong> {t('userSettings.backupCodes.warningBody')}
        </div>
      </div>

      <div className="font-mono text-sm bg-muted border border-success/20 rounded-lg p-3 space-y-1 tabular-nums">
        {codes.map((c) => (
          <div key={c} className="text-success">{c}</div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={copy} className="flex-1 flex items-center justify-center gap-2">
          {copied
            ? <><Check className="size-4" /> {t('userSettings.backupCodes.copied')}</>
            : <><Copy className="size-4" /> {t('userSettings.backupCodes.copyAll')}</>}
        </Button>
        <Button type="button" onClick={onClose} className="flex-1">
          {t('userSettings.backupCodes.saved')}
        </Button>
      </div>
    </div>
  );
}

function MfaSection({ user, onMfaChange, forceEnroll = false, onEnrollComplete }) {
  const { t } = useTranslation();
  const enabled = !!user?.mfaEnabled;
  const [stage, setStage] = useState('idle'); // 'idle' | 'setup' | 'verify' | 'backup' | 'disable'
  const [setup, setSetup] = useState(null);   // { qrCodeDataUrl, secretBase32 }
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const startSetup = async () => {
    setError(''); setBusy(true);
    try {
      const res = await authAPI.mfaSetup();
      setSetup(res.data.data);
      setStage('verify');
    } catch (err) {
      setError(err.response?.data?.message || t('userSettings.mfa.errSetupFallback'));
    } finally {
      setBusy(false);
    }
  };

  const verifySetup = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const res = await authAPI.mfaVerifySetup(code.trim());
      setBackupCodes(res.data.data.backupCodes);
      setStage('backup');
      setCode('');
      // In forceEnroll (lockdown) mode, defer the user-state refresh until
      // after they've dismissed the backup codes panel. Refreshing now
      // would flip user.mfaEnrollmentRequired to false, which causes the
      // parent to exit lockdown immediately and unmount this component
      // mid-flow — losing the backup codes the user hasn't saved yet.
      if (!forceEnroll) onMfaChange();
    } catch (err) {
      setError(err.response?.data?.message || t('userSettings.mfa.errCodeFallback'));
    } finally {
      setBusy(false);
    }
  };

  const disable = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await authAPI.mfaDisable(code.trim());
      setCode('');
      setStage('idle');
      onMfaChange();
    } catch (err) {
      setError(err.response?.data?.message || t('userSettings.mfa.errCodeFallback'));
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    setStage('idle');
    setSetup(null);
    setBackupCodes(null);
    setCode('');
    setError('');
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {enabled ? (
            <ShieldCheck className="size-5 text-success" />
          ) : (
            <Shield className="size-5 text-muted-foreground" />
          )}
          <h2 className="text-lg font-semibold text-foreground">{t('userSettings.mfa.title')}</h2>
        </div>
        <StatusBadge tone={enabled ? 'success' : 'upcoming'} size="sm">
          {enabled ? t('userSettings.mfa.statusOn') : t('userSettings.mfa.statusOff')}
        </StatusBadge>
      </div>

      <p className="text-sm text-muted-foreground">{t('userSettings.mfa.description')}</p>

      {error && <div className="px-3 py-2 rounded-lg bg-destructive-tint border border-destructive/20 text-destructive text-sm">{error}</div>}

      {/* ── Disabled state — show Setup CTA ─────────────────── */}
      {!enabled && stage === 'idle' && (
        <Button onClick={startSetup} disabled={busy} className="w-full">
          {busy ? t('userSettings.mfa.enableBusy') : t('userSettings.mfa.enableBtn')}
        </Button>
      )}

      {/* ── Setup verify — show QR + code input ─────────────── */}
      {stage === 'verify' && setup && (
        <div className="space-y-4">
          <div className="rounded-md border border-border bg-muted p-4 space-y-3">
            <p className="text-sm text-muted-foreground">{t('userSettings.mfa.step1')}</p>
            <img src={setup.qrCodeDataUrl} alt={t('userSettings.mfa.qrAlt')} className="mx-auto h-48 w-48 rounded-lg bg-white p-2" />
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground">{t('userSettings.mfa.manualEntry')}</summary>
              <div className="mt-2 font-mono text-success break-all bg-muted border border-border p-2 rounded">{setup.secretBase32}</div>
            </details>
          </div>

          <form onSubmit={verifySetup} className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('userSettings.mfa.step2')}</p>
            {/* eslint-disable jsx-a11y/no-autofocus */}
            <input type="text" inputMode="numeric" autoComplete="one-time-code" value={code}
              onChange={(e) => setCode(e.target.value)} placeholder="123456" required minLength={6} maxLength={10}
              className="w-full px-4 py-3 rounded-md bg-background border border-input text-foreground placeholder:text-subtle-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all font-mono tracking-widest text-center text-lg" autoFocus />
            {/* eslint-enable jsx-a11y/no-autofocus */}

            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={cancel} className="flex-1">
                {t('userSettings.mfa.cancel')}
              </Button>
              <Button type="submit" disabled={busy || code.length < 6} className="flex-1">
                {busy ? t('userSettings.mfa.verifyBusy') : t('userSettings.mfa.verifySubmit')}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* ── Backup codes after successful setup ─────────────── */}
      {stage === 'backup' && backupCodes && (
        <BackupCodesPanel
          codes={backupCodes}
          onClose={() => {
            setBackupCodes(null);
            setStage('idle');
            // In lockdown mode, the user is fully enrolled now — tell the
            // parent so it can refresh /me (clears the enrollment flag) and
            // drop out of lockdown into the regular settings page.
            if (forceEnroll && onEnrollComplete) onEnrollComplete();
          }}
        />
      )}

      {/* ── Enabled — Disable flow ──────────────────────────── */}
      {enabled && stage === 'idle' && (
        <Button variant="outline" onClick={() => setStage('disable')} className="w-full border-destructive/30 bg-destructive-tint text-destructive font-semibold hover:bg-destructive/20">
          {t('userSettings.mfa.disableBtn')}
        </Button>
      )}

      {stage === 'disable' && (
        <form onSubmit={disable} className="space-y-3">
          <p className="text-sm text-muted-foreground">{t('userSettings.mfa.disableInstruction')}</p>
          {/* eslint-disable jsx-a11y/no-autofocus */}
          <input type="text" inputMode="text" autoComplete="one-time-code" value={code}
            onChange={(e) => setCode(e.target.value)} placeholder={t('auth.mfa.codePlaceholder')} required minLength={6} maxLength={20}
            className="w-full px-4 py-3 rounded-md bg-background border border-input text-foreground placeholder:text-subtle-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all font-mono tracking-widest text-center text-lg" autoFocus />
          {/* eslint-enable jsx-a11y/no-autofocus */}

          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={cancel} className="flex-1">
              {t('userSettings.mfa.keepEnabled')}
            </Button>
            <Button type="submit" disabled={busy || code.length < 6} className="flex-1 bg-destructive-tint text-destructive hover:bg-destructive/20">
              {busy ? t('userSettings.mfa.disableBusy') : t('userSettings.mfa.disableSubmit')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function UserSettingsPage() {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const [searchParams] = useSearchParams();
  // Lockdown is captured ONCE at mount based on the URL flag and the
  // server-authoritative user.mfaEnrollmentRequired. We deliberately do NOT
  // re-derive it from the user object — the user's flag flips to false
  // mid-enrollment (when refreshUser fires after verify-setup) which would
  // unmount the MfaSection while the backup-codes panel is still showing.
  // Instead we keep lockdown as state and clear it explicitly via
  // onEnrollComplete after the user dismisses the backup codes.
  const [lockdownActive, setLockdownActive] = useState(
    () => searchParams.get('force') === 'mfa' && !!user?.mfaEnrollmentRequired
  );

  useEffect(() => { document.title = t('userSettings.docTitle'); }, [t]);
  // Refresh once on mount so we see fresh mfaEnabled state if it changed elsewhere.
  // Skip in lockdown mode — refreshing here would clear the flag prematurely
  // before the user finishes enrollment.
  useEffect(() => {
    if (!lockdownActive) refreshUser?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null;

  const handleEnrollComplete = async () => {
    await refreshUser?.();
    setLockdownActive(false);
  };

  // Lockdown variant — the user's role requires MFA but they haven't enrolled.
  // Hide profile, password change, and everything else; render only the MFA
  // enrollment flow with a prominent banner explaining why.
  if (lockdownActive) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div className="rounded-lg p-6 border border-warning/30 bg-warning/10">
          <div className="flex items-start gap-3">
            <Lock className="size-6 text-warning shrink-0 mt-0.5" />
            <div>
              <h1 className="text-lg font-bold text-foreground">{t('userSettings.lockdown.title')}</h1>
              <p className="text-sm text-warning/90 mt-1">
                {t('userSettings.lockdown.description', { role: user.role })}
              </p>
            </div>
          </div>
        </div>
        <MfaSection
          user={user}
          onMfaChange={refreshUser}
          forceEnroll
          onEnrollComplete={handleEnrollComplete}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-h1 text-foreground">{t('userSettings.pageTitle')}</h1>
        <p className="text-muted-foreground mt-1">{user.name} · {user.empCode}</p>
      </div>

      {/* Read-only profile card */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">{t('userSettings.profile.title')}</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-subtle-foreground text-xs uppercase tracking-wider">{t('userSettings.profile.empCode')}</dt>
            <dd className="text-foreground font-mono mt-1">{user.empCode}</dd>
          </div>
          <div>
            <dt className="text-subtle-foreground text-xs uppercase tracking-wider">{t('userSettings.profile.role')}</dt>
            <dd className="text-foreground mt-1">{user.role}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-subtle-foreground text-xs uppercase tracking-wider">{t('userSettings.profile.email')}</dt>
            <dd className={`mt-1 ${user.email ? 'text-foreground' : 'text-warning italic'}`}>
              {user.email || t('userSettings.profile.emailNotSet')}
            </dd>
          </div>
          <div>
            <dt className="text-subtle-foreground text-xs uppercase tracking-wider">{t('userSettings.profile.department')}</dt>
            <dd className="text-foreground mt-1">{user.department || '—'}</dd>
          </div>
          <div>
            <dt className="text-subtle-foreground text-xs uppercase tracking-wider">{t('userSettings.profile.status')}</dt>
            <dd className="text-foreground mt-1">{user.status}</dd>
          </div>
        </dl>
      </div>

      <ChangePasswordSection />
      <MfaSection user={user} onMfaChange={refreshUser} />
    </div>
  );
}
