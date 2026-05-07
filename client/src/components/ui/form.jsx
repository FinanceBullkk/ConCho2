// ──────────────────────────────────────────────────────────
// Form primitives — thin wrappers that wire react-hook-form
// context to styled label/input/error components.
// ──────────────────────────────────────────────────────────
import { createContext, useContext } from 'react';
import { useFormContext } from 'react-hook-form';

// ── Context ───────────────────────────────────────────────
const FormFieldContext = createContext(null);

export function FormField({ name, children }) {
  return (
    <FormFieldContext.Provider value={{ name }}>
      <div>{children}</div>
    </FormFieldContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFormField() {
  const ctx = useContext(FormFieldContext);
  const { formState, getFieldState } = useFormContext();
  if (!ctx) throw new Error('useFormField must be used inside <FormField>');
  const { error } = getFieldState(ctx.name, formState);
  return { name: ctx.name, error };
}

// ── Label ─────────────────────────────────────────────────
export function FormLabel({ children, required, className = '' }) {
  const { name, error } = useFormField();
  return (
    <label
      htmlFor={name}
      className={`block text-sm mb-1 transition-colors ${
        error ? 'text-red-400' : 'text-slate-300'
      } ${className}`}
    >
      {children}
      {required && <span className="text-red-400 ml-0.5" aria-hidden="true">*</span>}
    </label>
  );
}

// ── Error message ─────────────────────────────────────────
export function FormError({ className = '' }) {
  const { error, name } = useFormField();
  if (!error) return null;
  return (
    <p
      id={`${name}-error`}
      role="alert"
      aria-live="polite"
      className={`mt-1 text-xs text-red-400 ${className}`}
    >
      {error.message}
    </p>
  );
}

// ── Description ───────────────────────────────────────────
export function FormDescription({ children, className = '' }) {
  const { name } = useFormField();
  return (
    <p id={`${name}-desc`} className={`mt-1 text-[11px] text-slate-500 ${className}`}>
      {children}
    </p>
  );
}

// ── Input (controlled via register) ───────────────────────
// Thin wrapper that forwards react-hook-form register props +
// auto-wires id, aria-describedby, aria-invalid.
export function FormInput({ type = 'text', placeholder, disabled, className = '', ...registerProps }) {
  const { name, error } = useFormField();
  return (
    <input
      id={name}
      type={type}
      placeholder={placeholder}
      disabled={disabled}
      aria-invalid={!!error}
      aria-describedby={error ? `${name}-error` : undefined}
      className={`w-full px-4 py-2.5 rounded-xl bg-white/5 border text-white placeholder-slate-500
        focus:outline-none focus:ring-2 focus:ring-primary-500/50 disabled:opacity-40 transition-all
        ${error ? 'border-red-500/50 focus:ring-red-500/30' : 'border-white/10'}
        ${className}`}
      {...registerProps}
    />
  );
}
