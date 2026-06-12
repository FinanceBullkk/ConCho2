// Shared form primitives for the Learning CRUD modals. Matches the controlled
// input styling used across ClassesPage / TeamsPage (Tailwind tokens, no rhf).

import { Children, cloneElement, isValidElement, useId } from 'react';

export const controlClass =
  'w-full px-3 h-[--control-h] rounded-md bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors';

export const textareaClass =
  'w-full px-3 py-2 rounded-md bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors min-h-[72px]';

// Label + control wrapper with an optional hint line.
// UX-08 (WCAG 1.3.1/4.1.2): when the child is a single control, the label is
// programmatically associated with it — `useId()` + `htmlFor`, with the id
// injected via cloneElement (an explicit child id wins). Multi-element
// children keep the plain visual label (no single control to point at).
export function LearningField({ label, hint, children }) {
  const generatedId = useId();
  const single = Children.count(children) === 1 && isValidElement(children);
  const controlId = single ? (children.props.id ?? generatedId) : undefined;
  const control = single ? cloneElement(children, { id: controlId }) : children;
  return (
    <div>
      <label htmlFor={controlId} className="block text-small text-muted-foreground mb-1">{label}</label>
      {control}
      {hint && <p className="text-xs text-subtle-foreground mt-1">{hint}</p>}
    </div>
  );
}

// A <select> whose options are an array of enum values, each labelled via the
// provided translate fn (value → display string).
export function EnumSelect({ value, onChange, options, labelFor, ...rest }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={controlClass} {...rest}>
      {options.map((opt) => (
        <option key={opt} value={opt} className="bg-popover">{labelFor(opt)}</option>
      ))}
    </select>
  );
}
