// Shared form primitives for the Learning CRUD modals. Matches the controlled
// input styling used across ClassesPage / TeamsPage (Tailwind tokens, no rhf).

export const controlClass =
  'w-full px-3 h-[--control-h] rounded-md bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors';

export const textareaClass =
  'w-full px-3 py-2 rounded-md bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors min-h-[72px]';

// Label + control wrapper with an optional hint line.
export function LearningField({ label, hint, children }) {
  return (
    <div>
      <label className="block text-small text-muted-foreground mb-1">{label}</label>
      {children}
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
