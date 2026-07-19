import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronsUpDown, Check, Settings, GraduationCap, Languages } from 'lucide-react';
import { usePersona } from '../../context/PersonaContext';
import { cn } from '@/lib/utils';

// Persona = a client-side workspace mode (admin ↔ learner). Surfaced as a
// prominent card at the top of the sidebar (north-star shell). Participants are
// locked to 'learner' (canSwitch=false) → the card renders, but not interactive.
const PERSONAS = {
  admin: { icon: Settings, hue: 250, labelKey: 'nav.workspace.admin', subKey: 'nav.persona.adminSub', home: '/home' },
  english: { icon: Languages, hue: 205, labelKey: 'nav.workspace.english', subKey: 'nav.persona.englishSub', home: '/english-operations?tab=overview' },
  learner: { icon: GraduationCap, hue: 155, labelKey: 'nav.workspace.learner', subKey: 'nav.persona.learnerSub', home: '/me/programs' },
};

export default function PersonaSwitch({ onNavigate }) {
  const { persona, setPersona, canSwitch, availablePersonas = Object.keys(PERSONAS) } = usePersona();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const cur = PERSONAS[persona] || PERSONAS.admin;
  const CurIcon = cur.icon;

  const pick = (key) => {
    setOpen(false);
    if (key === persona) return;
    setPersona(key);
    navigate(PERSONAS[key].home);
    onNavigate?.();
  };

  return (
    <div className="relative mx-3 mb-1.5 mt-2.5" ref={ref}>
      <button
        type="button"
        onClick={() => canSwitch && setOpen((o) => !o)}
        aria-haspopup={canSwitch ? 'menu' : undefined}
        aria-expanded={canSwitch ? open : undefined}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-lg border border-border bg-card px-2.5 py-2 text-left transition-colors',
          canSwitch ? 'hover:border-input hover:bg-accent' : 'cursor-default',
        )}
      >
        <span
          className="grid size-7 shrink-0 place-items-center rounded-[7px]"
          style={{ background: `oklch(0.3 0.08 ${cur.hue})`, color: `oklch(0.82 0.14 ${cur.hue})` }}
          aria-hidden="true"
        >
          <CurIcon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-semibold leading-tight text-foreground">{t(cur.labelKey)}</span>
          <span className="block truncate text-[10.5px] text-subtle-foreground">{t(cur.subKey)}</span>
        </span>
        {canSwitch && <ChevronsUpDown className="size-3.5 shrink-0 text-subtle-foreground" aria-hidden="true" />}
      </button>

      {open && canSwitch && (
        <div role="menu" className="absolute inset-x-0 top-[calc(100%+6px)] z-50 rounded-lg border border-border bg-popover p-1.5 shadow-lg">
          <div className="px-2 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wider text-subtle-foreground">
            {t('nav.switchWorkspace')}
          </div>
          {Object.entries(PERSONAS).filter(([key]) => availablePersonas.includes(key)).map(([key, v]) => {
            const VIcon = v.icon;
            return (
              <button
                key={key}
                type="button"
                role="menuitemradio"
                aria-checked={persona === key}
                onClick={() => pick(key)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors',
                  persona === key ? 'bg-primary/15' : 'hover:bg-accent',
                )}
              >
                <span
                  className="grid size-6 shrink-0 place-items-center rounded-md"
                  style={{ background: `oklch(0.3 0.08 ${v.hue})`, color: `oklch(0.82 0.14 ${v.hue})` }}
                  aria-hidden="true"
                >
                  <VIcon className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-foreground">{t(v.labelKey)}</span>
                  <span className="block truncate text-[10.5px] text-subtle-foreground">{t(v.subKey)}</span>
                </span>
                {persona === key && <Check className="size-3.5 shrink-0 text-primary" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
