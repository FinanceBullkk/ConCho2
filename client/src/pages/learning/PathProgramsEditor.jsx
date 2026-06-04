import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { controlClass } from './LearningField';

// Ordered program editor for a learning path. Presentational: the parent owns
// `value` (ordered array of program ids) + `onChange`. `options` is the full
// list of selectable programs ({ _id, name, code }); programs already in `value`
// are excluded from the add dropdown. Array order IS the curriculum sequence.
export default function PathProgramsEditor({ options, value, onChange }) {
  const { t } = useTranslation();
  const byId = new Map(options.map((p) => [p._id, p]));
  const available = options.filter((p) => !value.includes(p._id));

  const add = (id) => { if (id && !value.includes(id)) onChange([...value, id]); };
  const removeAt = (i) => onChange(value.filter((_, idx) => idx !== i));
  const move = (i, delta) => {
    const j = i + delta;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ol className="rounded-md border border-input divide-y divide-border">
          {value.map((id, i) => {
            const program = byId.get(id);
            return (
              <li key={id} className="flex items-center gap-2 px-3 py-2">
                <span className="text-xs text-muted-foreground w-5 tabular-nums">{i + 1}.</span>
                <span className="text-sm text-foreground flex-1 truncate">
                  {program ? program.name : id}
                  {program && <span className="ml-2 font-mono text-xs text-muted-foreground">{program.code}</span>}
                </span>
                <Button type="button" variant="ghost" size="icon" className="size-7"
                  aria-label={t('learning.paths.moveUp')} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="size-4" aria-hidden="true" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="size-7"
                  aria-label={t('learning.paths.moveDown')} disabled={i === value.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown className="size-4" aria-hidden="true" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="size-7 text-destructive"
                  aria-label={t('learning.actions.remove')} onClick={() => removeAt(i)}>
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </li>
            );
          })}
        </ol>
      )}

      <select
        value=""
        onChange={(e) => { add(e.target.value); e.target.value = ''; }}
        className={controlClass}
        disabled={!available.length}
        aria-label={t('learning.paths.addProgram')}
      >
        <option value="" className="bg-popover">
          {available.length ? t('learning.paths.addProgram') : t('learning.paths.allProgramsAdded')}
        </option>
        {available.map((p) => (
          <option key={p._id} value={p._id} className="bg-popover">
            {p.name} ({p.code})
          </option>
        ))}
      </select>
    </div>
  );
}
