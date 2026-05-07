import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Shield, ShieldCheck, KeyRound, Copy, Check, AlertTriangle, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../api/api';

// ──────────────────────────────────────────────────────────
// User Settings — change password, manage MFA
// ──────────────────────────────────────────────────────────
// Available to every authenticated user (any role) for their own
// account. Admin-on-other-user actions live elsewhere (UsersPage).
// ──────────────────────────────────────────────────────────

function ChangePasswordSection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setOk('');
    if (next !== confirm) { setError('New password and confirmation do not match'); return; }
    if (next.length < 10) { setError('New password must be at least 10 characters'); return; }
    setBusy(true);
    try {
      await authAPI.changePassword(current, next);
      setOk('Password updated.');
      setCurrent(''); setNext(''); setConfirm('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to change password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="glass rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="size-5 text-primary-400" />
        <h2 className="text-lg font-semibold text-white">Change password</h2>
      </div>

      {error && <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
      {ok && <div className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">{ok}</div>}

      <div>
        <label className="block text-sm text-slate-300 mb-1">Current password</label>
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required
          className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all" />
      </div>
      <div>
        <label className="block text-sm text-slate-300 mb-1">New password</label>
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={10}
          className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all" />
        <p className="text-xs text-slate-500 mt-1">Min 10 characters.</p>
      </div>
      <div>
        <label className="block text-sm text-slate-300 mb-1">Confirm new password</label>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={10}
          className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all" />
      </div>

      <button type="submit" disabled={busy}
        className="w-full py-2.5 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 text-white font-semibold hover:from-primary-500 hover:to-primary-400 transition-all disabled:opacity-50">
        {busy ? 'Updating…' : 'Update password'}
      </button>
    </form>
  );
}

function BackupCodesPanel({ codes, onClose }) {
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
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="size-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-200">
          <strong>Save these backup codes now.</strong> Each works once. They will not be shown again. Use them if you lose access to your authenticator app.
        </div>
      </div>

      <div className="font-mono text-sm bg-black/30 rounded-lg p-3 space-y-1">
        {codes.map((c) => (
          <div key={c} className="text-emerald-300">{c}</div>
        ))}
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={copy}
          className="flex-1 py-2 rounded-lg bg-white/10 text-white text-sm hover:bg-white/15 transition-all flex items-center justify-center gap-2">
          {copied ? <><Check className="size-4" /> Copied</> : <><Copy className="size-4" /> Copy all</>}
        </button>
        <button type="button" onClick={onClose}
          className="flex-1 py-2 rounded-lg bg-emerald-500/20 text-emerald-300 text-sm hover:bg-emerald-500/30 transition-all">
          I've saved them
        </button>
      </div>
    </div>
  );
}

function MfaSection({ user, onMfaChange, forceEnroll = false, onEnrollComplete }) {
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
      setError(err.response?.data?.message || 'Failed to start MFA setup');
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
      setError(err.response?.data?.message || 'Invalid code');
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
      setError(err.response?.data?.message || 'Invalid code');
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
    <div className="glass rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {enabled ? (
            <ShieldCheck className="size-5 text-emerald-400" />
          ) : (
            <Shield className="size-5 text-slate-400" />
          )}
          <h2 className="text-lg font-semibold text-white">Two-factor authentication</h2>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
          enabled
            ? 'bg-emerald-500/20 text-emerald-300'
            : 'bg-slate-500/20 text-slate-400'
        }`}>
          {enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      <p className="text-sm text-slate-400">
        Add a second factor with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, etc.). Your password alone will no longer be enough to sign in.
      </p>

      {error && <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

      {/* ── Disabled state — show Setup CTA ─────────────────── */}
      {!enabled && stage === 'idle' && (
        <button onClick={startSetup} disabled={busy}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 text-white font-semibold hover:from-primary-500 hover:to-primary-400 transition-all disabled:opacity-50">
          {busy ? 'Preparing…' : 'Enable two-factor authentication'}
        </button>
      )}

      {/* ── Setup verify — show QR + code input ─────────────── */}
      {stage === 'verify' && setup && (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
            <p className="text-sm text-slate-300">1. Scan this QR code with your authenticator app:</p>
            <img src={setup.qrCodeDataUrl} alt="MFA QR code" className="mx-auto h-48 w-48 rounded-lg bg-white p-2" />
            <details className="text-xs text-slate-400">
              <summary className="cursor-pointer hover:text-slate-200">Can't scan? Enter the secret manually</summary>
              <div className="mt-2 font-mono text-emerald-300 break-all bg-black/30 p-2 rounded">{setup.secretBase32}</div>
            </details>
          </div>

          <form onSubmit={verifySetup} className="space-y-3">
            <p className="text-sm text-slate-300">2. Enter the 6-digit code shown in your app:</p>
            <input type="text" inputMode="numeric" autoComplete="one-time-code" value={code}
              onChange={(e) => setCode(e.target.value)} placeholder="123456" required minLength={6} maxLength={10}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all font-mono tracking-widest text-center text-lg" autoFocus />

            <div className="flex gap-3">
              <button type="button" onClick={cancel}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 transition-all">
                Cancel
              </button>
              <button type="submit" disabled={busy || code.length < 6}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 text-white font-semibold hover:from-primary-500 hover:to-primary-400 transition-all disabled:opacity-50">
                {busy ? 'Verifying…' : 'Verify & enable'}
              </button>
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
        <button onClick={() => setStage('disable')}
          className="w-full py-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 font-semibold hover:bg-rose-500/20 transition-all">
          Disable two-factor authentication
        </button>
      )}

      {stage === 'disable' && (
        <form onSubmit={disable} className="space-y-3">
          <p className="text-sm text-slate-300">Enter a current 6-digit code or a backup code to confirm:</p>
          <input type="text" inputMode="text" autoComplete="one-time-code" value={code}
            onChange={(e) => setCode(e.target.value)} placeholder="123456 or XXXXX-XXXXX" required minLength={6} maxLength={20}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all font-mono tracking-widest text-center text-lg" autoFocus />

          <div className="flex gap-3">
            <button type="button" onClick={cancel}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 transition-all">
              Keep enabled
            </button>
            <button type="submit" disabled={busy || code.length < 6}
              className="flex-1 py-2.5 rounded-xl bg-rose-500/20 text-rose-300 font-semibold hover:bg-rose-500/30 transition-all disabled:opacity-50">
              {busy ? 'Disabling…' : 'Disable MFA'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function UserSettingsPage() {
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

  useEffect(() => { document.title = 'TMS — Account Settings'; }, []);
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
      <div className="space-y-6 animate-fade-in max-w-2xl">
        <div className="rounded-2xl p-6 border border-amber-500/30 bg-amber-500/10">
          <div className="flex items-start gap-3">
            <Lock className="size-6 text-amber-300 shrink-0 mt-0.5" />
            <div>
              <h1 className="text-lg font-bold text-white">Two-factor authentication required</h1>
              <p className="text-sm text-amber-200/90 mt-1">
                Your role ({user.role}) requires 2FA before you can access the system.
                Set it up below — it takes about a minute. After enrollment you'll be
                returned to the app and won't see this screen again.
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
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Account settings</h1>
        <p className="text-slate-400 mt-1">{user.name} · {user.empCode}</p>
      </div>

      {/* Read-only profile card */}
      <div className="glass rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Profile</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-slate-500 text-xs uppercase tracking-wider">Employee code</dt>
            <dd className="text-white font-mono mt-1">{user.empCode}</dd>
          </div>
          <div>
            <dt className="text-slate-500 text-xs uppercase tracking-wider">Role</dt>
            <dd className="text-white mt-1">{user.role}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-slate-500 text-xs uppercase tracking-wider">Email</dt>
            <dd className={`mt-1 ${user.email ? 'text-white' : 'text-amber-400 italic'}`}>
              {user.email || 'Not set — ask admin to add one for Google Calendar invites'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500 text-xs uppercase tracking-wider">Department</dt>
            <dd className="text-white mt-1">{user.department || '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500 text-xs uppercase tracking-wider">Status</dt>
            <dd className="text-white mt-1">{user.status}</dd>
          </div>
        </dl>
      </div>

      <ChangePasswordSection />
      <MfaSection user={user} onMfaChange={refreshUser} />
    </div>
  );
}
