import { useUsers } from '../../hooks/useUsers';

// A single custom-field control, driven by a CustomFieldDefinition. Kept
// self-contained (no learning imports) so it can be reused by both the Custom
// fields manager preview AND the Program builder without a cross-feature cycle.
// TMS.update gap #6 — renders all 7 types (text/number/select/multiselect/
// date/toggle/user). Because the builder + cohort forms consume this shared
// renderer, new types light up everywhere at once.

const controlClass =
  'w-full px-3 h-[--control-h] rounded-md bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors';

function UserSelect({ id, value, onChange }) {
  // Only fires when a `user` field is actually rendered (enabled-gated). First
  // page of users — a typeahead picker is a future enhancement.
  const { data } = useUsers({ limit: 200 }, { enabled: true });
  const users = data?.data || [];
  return (
    <select id={id} className={controlClass} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      <option value="" className="bg-popover">—</option>
      {users.map((u) => (
        <option key={u._id} value={u._id} className="bg-popover">{u.name}{u.empCode ? ` (${u.empCode})` : ''}</option>
      ))}
    </select>
  );
}

export function CustomFieldInput({ def, value, onChange }) {
  const id = `cf-${def.key}`;
  const label = (
    <label htmlFor={id} className="mb-1 block text-small text-muted-foreground">
      {def.label}
      {def.required && <span className="text-destructive"> *</span>}
    </label>
  );

  // `toggle` puts the checkbox inline with the label (no separate label row).
  if (def.type === 'toggle') {
    return (
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input id={id} type="checkbox" className="size-4 accent-primary" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        {def.label}{def.required && <span className="text-destructive"> *</span>}
      </label>
    );
  }

  let control;
  switch (def.type) {
    case 'number':
      control = <input id={id} type="number" className={controlClass} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
      break;
    case 'date':
      control = <input id={id} type="date" className={controlClass} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
      break;
    case 'select':
      control = (
        <select id={id} className={controlClass} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="" className="bg-popover">—</option>
          {(def.options || []).map((o) => <option key={o} value={o} className="bg-popover">{o}</option>)}
        </select>
      );
      break;
    case 'multiselect': {
      const arr = Array.isArray(value) ? value : [];
      const toggle = (opt) => onChange(arr.includes(opt) ? arr.filter((x) => x !== opt) : [...arr, opt]);
      control = (
        <div className="flex flex-wrap gap-2">
          {(def.options || []).map((o) => (
            <label key={o} className="flex items-center gap-1.5 rounded-md border border-input px-2 py-1 text-sm text-foreground">
              <input type="checkbox" className="size-3.5 accent-primary" checked={arr.includes(o)} onChange={() => toggle(o)} />
              {o}
            </label>
          ))}
        </div>
      );
      break;
    }
    case 'user':
      control = <UserSelect id={id} value={value} onChange={onChange} />;
      break;
    default: // text
      control = <input id={id} className={controlClass} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }

  return <div>{label}{control}</div>;
}
