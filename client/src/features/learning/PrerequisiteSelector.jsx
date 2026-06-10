import { useTranslation } from 'react-i18next';

// Multi-select checkbox list for choosing prerequisite programs.
// Presentational: the parent owns `value` (array of program ids) and `onChange`.
// `options` is the list of selectable programs ({ _id, code, name }); the caller
// is responsible for excluding the program being edited (no self-prerequisite).
export default function PrerequisiteSelector({ options, value, onChange }) {
  const { t } = useTranslation();
  const selected = new Set(value);

  if (!options.length) {
    return <p className="text-xs text-subtle-foreground">{t('learning.fields.prerequisitesNone')}</p>;
  }

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  return (
    <div className="max-h-40 overflow-y-auto rounded-md border border-input divide-y divide-border">
      {options.map((p) => (
        <label key={p._id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50">
          <input
            type="checkbox"
            checked={selected.has(p._id)}
            onChange={() => toggle(p._id)}
            className="size-4 rounded border-input accent-primary"
          />
          <span className="text-sm text-foreground">{p.name}</span>
          <span className="ml-auto font-mono text-xs text-muted-foreground">{p.code}</span>
        </label>
      ))}
    </div>
  );
}
