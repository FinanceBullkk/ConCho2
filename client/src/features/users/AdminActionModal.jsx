import { ShieldAlert, LogOut } from 'lucide-react';
import Portal from '../../components/Portal';
import { Button } from '@/components/ui/button';
import { Spinner } from '../../components/Spinner';
import { INPUT_CLS } from './users-constants';

// ── Admin action confirmation (force-logout / disable-MFA) ────────────────
// Re-auth-gated: the acting admin types their own password to confirm. Only
// rendered when `action` is set, so it is always defined here.
export default function AdminActionModal({ action, password, error, loading, onPasswordChange, onConfirm, onCancel }) {
  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card border border-border rounded-lg p-6 max-w-sm mx-4 space-y-4">
        <div className="flex items-center justify-center size-10 mx-auto rounded-md bg-warning-tint">
          {action.type === 'force-logout'
            ? <LogOut className="size-5 text-warning" aria-hidden="true" />
            : <ShieldAlert className="size-5 text-warning" aria-hidden="true" />
          }
        </div>
        <h3 className="text-h3 text-foreground text-center">
          {action.type === 'force-logout' ? 'Force Logout' : 'Disable MFA'}
        </h3>
        <p className="text-body text-muted-foreground text-center">
          {action.type === 'force-logout'
            ? <>Invalidate all active sessions for <span className="text-foreground font-medium">{action.userName}</span>? They will need to log in again immediately.</>
            : <>Disable 2FA for <span className="text-foreground font-medium">{action.userName}</span>? They can log in without a code until they re-enroll.</>
          }
        </p>
        <div className="space-y-2">
          <label htmlFor="admin-action-password" className="block text-sm font-medium text-foreground">
            Your admin password
          </label>
          <input
            id="admin-action-password"
            type="password"
            autoComplete="current-password"
            className={INPUT_CLS}
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            disabled={loading}
          />
        </div>
        {error && (
          <div className="px-3 py-2 rounded-md bg-destructive-tint border border-destructive/30 text-destructive text-sm text-center">
            {error}
          </div>
        )}
        <div className="flex gap-3">
          <Button
            variant="outline" className="flex-1"
            onClick={onCancel}
            disabled={loading}
          >Cancel</Button>
          <Button
            variant="default" className="flex-1 bg-warning text-warning-foreground hover:bg-warning/90"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? <><Spinner size={14} />Processing…</> : 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
    </Portal>
  );
}
