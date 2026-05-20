import { useState, useId, useRef, useEffect } from 'react';
import { TriangleAlert } from 'lucide-react';
import Portal from './Portal';
import { Button } from '@/components/ui/button';
import { Spinner } from './Spinner';
import { cn } from '@/lib/utils';

// ──────────────────────────────────────────────────────────
// BulkDeleteConfirm — Phase 3 Screen 5 §D rule 10
//
// "Bulk delete: type-confirmation modal for >5 rows · simple confirm for ≤5"
//
// For ≤5 rows the caller can just window.confirm; this component is the
// type-to-confirm escalation. Renders a portaled modal that requires the
// user to type "delete" before the Delete button is enabled.
//
// Props:
//   open        boolean
//   count       number               row count
//   entityName  string               singular noun ("user", "team", "class")
//   onClose     () => void
//   onConfirm   () => Promise<void>  resolves when delete finishes
//   isDeleting  boolean              optional caller-provided pending flag
//
// Usage:
//   <BulkDeleteConfirm
//     open={bulkDelete}
//     count={selected.size}
//     entityName="user"
//     onClose={() => setBulkDelete(false)}
//     onConfirm={handleBulkDelete}
//     isDeleting={isDeleting}
//   />
// ──────────────────────────────────────────────────────────

const REQUIRED = 'delete';

export function BulkDeleteConfirm({
  open,
  count = 0,
  entityName = 'row',
  onClose,
  onConfirm,
  isDeleting = false,
}) {
  // Mounting fresh on each open resets all internal state (input value, focus).
  if (!open) return null;
  return (
    <Form
      count={count}
      entityName={entityName}
      onClose={onClose}
      onConfirm={onConfirm}
      isDeleting={isDeleting}
    />
  );
}

function Form({ count, entityName, onClose, onConfirm, isDeleting }) {
  const [value, setValue] = useState('');
  const inputId = useId();
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const matches = value.trim().toLowerCase() === REQUIRED;
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!matches || isDeleting) return;
    try {
      await onConfirm();
      setValue('');
    } catch { /* parent shows toast */ }
  };

  const plural = `${entityName}${count !== 1 ? 's' : ''}`;

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !isDeleting) onClose();
        }}
      >
        <form
          onSubmit={handleSubmit}
          className="bg-card border border-border rounded-lg w-full max-w-md p-6 space-y-4"
          aria-labelledby={`${inputId}-title`}
        >
          <div className="flex items-center justify-center size-10 mx-auto rounded-md bg-destructive-tint">
            <TriangleAlert className="size-5 text-destructive" aria-hidden="true" />
          </div>

          <h3 id={`${inputId}-title`} className="text-h3 text-foreground text-center">
            Delete {count} {plural}?
          </h3>

          <p className="text-body text-muted-foreground text-center">
            This permanently removes <span className="text-foreground font-medium tabular-nums">{count}</span> {plural} and
            cannot be undone. Cascading effects may apply.
          </p>

          <div>
            <label htmlFor={inputId} className="block text-small text-muted-foreground mb-1.5">
              Type <code className="font-mono text-foreground bg-muted px-1 rounded">{REQUIRED}</code> to confirm
            </label>
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              autoComplete="off"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={isDeleting}
              aria-invalid={value.length > 0 && !matches}
              className={cn(
                'w-full px-3 h-(--control-h) rounded-md bg-background border text-foreground',
                'placeholder:text-subtle-foreground focus:outline-none focus:ring-2 focus:ring-ring',
                'transition-colors duration-(--dur-fast) disabled:opacity-40',
                matches ? 'border-destructive' : 'border-input',
              )}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              className="flex-1"
              disabled={!matches || isDeleting}
            >
              {isDeleting ? <><Spinner size={14} />Deleting…</> : `Delete ${count}`}
            </Button>
          </div>
        </form>
      </div>
    </Portal>
  );
}
