import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Spinner } from '../../components/Spinner';
import { useCreateUser, useUpdateUser } from '../../hooks/useUsers';
import { useAuth } from '../../context/AuthContext';
import { createUserSchema, editUserSchema } from '../../lib/validations';
import { useCustomFields } from '../custom-fields/useCustomFields';
import { CustomFieldInput } from '../custom-fields/custom-field-input';
import { ROLES, STATUSES, INPUT_CLS } from './users-constants';

// ── UserModal ─────────────────────────────────────────────
export default function UserModal({ user, onClose, onSaved }) {
  const isEdit = !!user?._id;
  const { user: currentUser } = useAuth();
  const isSelf = isEdit && user?._id === currentUser?._id;
  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const saving = createMutation.isPending || updateMutation.isPending;

  // Admin-defined User custom fields (shown on the form surface).
  const { data: cfDefs = [] } = useCustomFields({ entity: 'User' });
  const formFields = cfDefs.filter((f) => (f.showIn || ['form']).includes('form'));
  const [cfValues, setCfValues] = useState(() => user?.customFields || {});

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(isEdit ? editUserSchema : createUserSchema),
    defaultValues: {
      empCode:         user?.empCode || '',
      name:            user?.name || '',
      email:           user?.email || '',
      role:            user?.role || 'Participant',
      department:      user?.department || '',
      position:        user?.position || '',
      status:          user?.status || 'Active',
      dropReason:      user?.dropReason || '',
      password:        '',
      currentPassword: '',
    },
  });

  const watchedPassword = watch('password');
  const watchedRole     = watch('role');
  const currentStatus   = watch('status');

  const needsReauth = isEdit && !isSelf && (
    !!watchedPassword || watchedRole !== (user?.role || 'Participant')
  );

  const onSubmit = handleSubmit(async (data) => {
    try {
      const payload = { ...data };
      if (isEdit && !payload.password)        delete payload.password;
      if (!payload.email)                     delete payload.email;
      if (!payload.currentPassword)           delete payload.currentPassword;
      if (formFields.length)                  payload.customFields = cfValues;
      if (isEdit) await updateMutation.mutateAsync({ id: user._id, data: payload });
      else        await createMutation.mutateAsync(payload);
      onSaved();
    } catch (err) {
      const serverMsg = err.response?.data?.message || 'Save failed';
      if (err.response?.data?.requiresReauth) {
        setError('currentPassword', { message: 'Enter your admin password to confirm this change' });
      } else {
        setError('root', { message: serverMsg });
      }
    }
  });

  const SELECT_CLS =
    'w-full px-3 h-(--control-h) rounded-md bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors duration-(--dur-fast)';

  // Audit PR N (FE-010): hand-rolled overlay replaced with Radix Dialog.
  // Radix handles focus-trap, ESC-to-close, click-outside-to-close, ARIA
  // labelling and aria-modal natively. Open state is controlled — closing
  // the dialog calls back to the parent's setEditing(null) via onClose.
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="max-w-md max-h-[92vh] grid-rows-[auto_minmax(0,1fr)_auto] p-0 gap-0"
        aria-label={isEdit ? 'Edit user' : 'Create user'}
        onOpenAutoFocus={(e) => {
          // First field is empCode (disabled on edit). Let Radix default-focus
          // the first focusable element. Prevent autofocus jump on edit so
          // the dialog opens neutral instead of grabbing the name field.
          if (isEdit) e.preventDefault();
        }}
      >
        <form onSubmit={onSubmit} noValidate className="flex flex-col min-h-0">
        {/* ── Sticky header ── */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <DialogTitle className="text-h3 text-foreground">{isEdit ? 'Edit User' : 'Create User'}</DialogTitle>
        </DialogHeader>

        {/* ── Scrollable body ── */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {errors.root && (
            <div role="alert" className="px-3 py-2 rounded-md bg-destructive-tint border border-destructive/30 text-destructive text-sm">
              {errors.root.message}
            </div>
          )}

          {[
            { name: 'empCode',  label: 'Employee Code',                           type: 'text',     placeholder: 'e.g. 000123',           disabled: isEdit },
            { name: 'name',     label: 'Full Name',                                type: 'text',     placeholder: 'Full name' },
            { name: 'email',    label: 'Email (Workspace)',                        type: 'email',    placeholder: 'name@yourdomain.com',   help: 'Required for Google Calendar invites' },
            { name: 'department', label: 'BU / Department',                       type: 'text',     placeholder: 'e.g. Sales, HR' },
            { name: 'position', label: 'Position',                                 type: 'text',     placeholder: 'e.g. DEV, QC, Designer' },
            { name: 'password', label: isEdit ? 'New Password (leave blank to keep)' : 'Password', type: 'password', placeholder: '••••••••' },
          ].map(({ name, label, type, placeholder, disabled, help }) => (
            <div key={name}>
              <label htmlFor={name} className="block text-small text-muted-foreground mb-1.5">{label}</label>
              <input
                id={name}
                type={type}
                placeholder={placeholder}
                disabled={disabled}
                aria-invalid={!!errors[name]}
                aria-describedby={errors[name] ? `${name}-error` : undefined}
                className={cn(INPUT_CLS, errors[name] ? 'border-destructive' : 'border-input')}
                {...register(name)}
              />
              {errors[name] && (
                <p id={`${name}-error`} role="alert" className="mt-1 text-xs text-destructive">{errors[name].message}</p>
              )}
              {help && !errors[name] && <p className="text-[11px] text-subtle-foreground mt-1">{help}</p>}
            </div>
          ))}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="role" className="block text-small text-muted-foreground mb-1.5">Role</label>
              <select id="role" className={SELECT_CLS} {...register('role')}>
                {ROLES.map((r) => <option key={r} value={r} className="bg-popover">{r}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="status" className="block text-small text-muted-foreground mb-1.5">Status</label>
              <select id="status" className={SELECT_CLS} {...register('status')}>
                {STATUSES.map((s) => <option key={s} value={s} className="bg-popover">{s}</option>)}
              </select>
            </div>
          </div>

          {/* Admin-defined custom fields (CustomFieldDefinition entity='User') */}
          {formFields.length > 0 && (
            <div className="space-y-3 border-t border-border pt-4">
              {formFields.map((f) => (
                <CustomFieldInput
                  key={f._id}
                  def={f}
                  value={cfValues[f.key]}
                  onChange={(v) => setCfValues((prev) => ({ ...prev, [f.key]: v }))}
                />
              ))}
            </div>
          )}

          {/* Re-auth confirmation */}
          {needsReauth && (
            <div className="rounded-md border border-warning/30 bg-warning-tint p-3 space-y-2">
              <p className="text-xs text-warning flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
                </svg>
                Confirm your identity to change another user&apos;s password or role
              </p>
              <div>
                <label htmlFor="currentPassword" className="block text-small text-muted-foreground mb-1.5">Your admin password</label>
                <input
                  id="currentPassword"
                  type="password"
                  placeholder="Enter your own password"
                  aria-invalid={!!errors.currentPassword}
                  className={cn(INPUT_CLS, errors.currentPassword ? 'border-warning' : 'border-warning/40')}
                  {...register('currentPassword')}
                />
                {errors.currentPassword && (
                  <p role="alert" className="mt-1 text-xs text-warning">{errors.currentPassword.message}</p>
                )}
              </div>
            </div>
          )}

          {/* Drop Reason */}
          {['Dropped', 'Inactive', 'Transferred'].includes(currentStatus) && (
            <div>
              <label htmlFor="dropReason" className="block text-small text-muted-foreground mb-1.5">Drop / Leave Reason</label>
              <input
                id="dropReason"
                type="text"
                placeholder="e.g. High workload, Learning goal achieved"
                className={cn(INPUT_CLS, 'border-input')}
                {...register('dropReason')}
              />
            </div>
          )}
        </div>

        {/* ── Sticky footer ── */}
        <DialogFooter className="px-6 pb-6 pt-4 border-t border-border shrink-0 flex flex-row gap-3 sm:justify-stretch">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="flex-1" disabled={saving}>
            {saving ? <><Spinner size={14} />Saving…</> : isEdit ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
