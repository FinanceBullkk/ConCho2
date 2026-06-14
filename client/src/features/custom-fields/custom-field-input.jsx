// A single custom-field control, driven by a CustomFieldDefinition. Kept
// self-contained (no learning imports) so it can be reused by both the Custom
// fields manager preview AND the Program builder without a cross-feature cycle.

const controlClass =
  'w-full px-3 h-[--control-h] rounded-md bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors';

export function CustomFieldInput({ def, value, onChange }) {
  const id = `cf-${def.key}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-small text-muted-foreground">
        {def.label}
        {def.required && <span className="text-destructive"> *</span>}
      </label>
      {def.type === 'select' ? (
        <select id={id} className={controlClass} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="" className="bg-popover">—</option>
          {(def.options || []).map((o) => (
            <option key={o} value={o} className="bg-popover">{o}</option>
          ))}
        </select>
      ) : (
        <input id={id} className={controlClass} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}
