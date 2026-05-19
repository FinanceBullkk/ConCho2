// ──────────────────────────────────────────────────────────
// FormField — Phase 1 §03
//
// Wraps react-hook-form + tokenized control. Single ergonomic API
// for the 80% case (Input). Falls back to composable slots when
// the consumer needs custom control rendering (Select, Combobox,
// Multiselect, DatePicker, …).
//
// Token bindings:
//   border default       --input
//   border focus         --ring
//   border error         --destructive
//   bg disabled          --muted
//   placeholder          --subtle-foreground
// ──────────────────────────────────────────────────────────
import { createContext, useContext, useId } from 'react';
import { useFormContext } from 'react-hook-form';
import { cn } from '@/lib/utils';

const FormFieldContext = createContext(null);

/**
 * Compose form field.
 *
 * Quick API (Input only):
 *   <FormField name="email" label="Email" required description="…" type="email" placeholder="…" />
 *
 * Slot API (any control):
 *   <FormField name="bu">
 *     <FormLabel>Business unit</FormLabel>
 *     <SomeCustomSelect {...register('bu')} />
 *     <FormError />
 *   </FormField>
 */
export function FormField({
  name,
  label,
  description,
  required,
  // Quick API — when `children` not provided
  type = 'text',
  placeholder,
  autoComplete,
  disabled,
  readOnly,
  className,
  children,
  ...rest
}) {
  const reactId = useId();
  const id = `${name}-${reactId}`;
  const ctx = { name, id };

  // If children provided → slot API
  if (children !== undefined) {
    return (
      <FormFieldContext.Provider value={ctx}>
        <div className={cn('space-y-1.5', className)}>{children}</div>
      </FormFieldContext.Provider>
    );
  }

  // Quick API — render label + input + description + error
  return (
    <FormFieldContext.Provider value={ctx}>
      <div className={cn('space-y-1.5', className)}>
        {label && <FormLabel required={required}>{label}</FormLabel>}
        <FormInput
          type={type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          readOnly={readOnly}
          {...rest}
        />
        {description && <FormDescription>{description}</FormDescription>}
        <FormError />
      </div>
    </FormFieldContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFormField() {
  const ctx = useContext(FormFieldContext);
  const formCtx = useFormContext();
  if (!ctx) throw new Error('useFormField must be used inside <FormField>');
  // RHF context is optional for slot API consumers that manage their own state
  const error = formCtx?.getFieldState(ctx.name, formCtx.formState)?.error;
  return { name: ctx.name, id: ctx.id, error };
}

export function FormLabel({ children, required, className }) {
  const { id, error } = useFormField();
  return (
    <label
      htmlFor={id}
      className={cn(
        'text-overline block',
        error ? 'text-destructive' : 'text-muted-foreground',
        className
      )}
    >
      {children}
      {required && (
        <span className="ml-0.5 text-destructive" aria-hidden="true">
          *
        </span>
      )}
    </label>
  );
}

export function FormError({ className }) {
  const { id, error } = useFormField();
  if (!error) return null;
  return (
    <p
      id={`${id}-error`}
      role="alert"
      aria-live="polite"
      className={cn('text-small text-destructive', className)}
    >
      {error.message}
    </p>
  );
}

export function FormDescription({ children, className }) {
  const { id } = useFormField();
  return (
    <p id={`${id}-desc`} className={cn('text-small text-muted-foreground', className)}>
      {children}
    </p>
  );
}

/**
 * Tokenized input. Auto-wires register, aria-* and error styling
 * by reading from RHF context + FormField context.
 */
export function FormInput({
  type = 'text',
  placeholder,
  disabled,
  readOnly,
  className,
  ...rest
}) {
  const { name, id, error } = useFormField();
  const formCtx = useFormContext();
  // Auto-register when consumer didn't pass register props (`onChange`, `ref`, …)
  const registerProps =
    formCtx && rest.onChange === undefined && rest.ref === undefined
      ? formCtx.register(name)
      : {};

  return (
    <input
      id={id}
      name={name}
      type={type}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      aria-invalid={!!error}
      aria-describedby={error ? `${id}-error` : undefined}
      className={cn(
        'text-body h-(--control-h) w-full rounded-md border bg-background px-3 text-foreground placeholder:text-subtle-foreground',
        'transition-colors duration-(--dur-fast) focus:outline-none',
        error
          ? 'border-destructive focus:ring-2 focus:ring-destructive/30'
          : 'border-input focus:ring-2 focus:ring-ring focus:border-ring',
        (disabled || readOnly) && 'cursor-not-allowed bg-muted opacity-70',
        className
      )}
      {...rest}
      {...registerProps}
    />
  );
}
