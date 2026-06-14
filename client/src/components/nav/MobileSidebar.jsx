import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import Sidebar from './Sidebar';
import PersonaSwitch from './PersonaSwitch';
import SidebarFooter from './SidebarFooter';

// ──────────────────────────────────────────────────────────
// MobileSidebar — left slide-over drawer for < md (IA rework 2026-06-13).
// Renders the same Sidebar; closes on backdrop click, Escape, or any nav click
// (Sidebar's onNavigate). Lightweight overlay (the app has no Sheet primitive);
// locks body scroll and labels itself as a dialog for assistive tech.
// ──────────────────────────────────────────────────────────
export default function MobileSidebar({ open, onClose }) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label={t('nav.primary')}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="absolute left-0 top-0 flex h-full w-72 max-w-[80%] flex-col border-r border-border bg-card shadow-lg">
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-border px-4">
          <span className="text-lg font-bold tracking-tight text-foreground">
            TMS<span className="text-primary">v2</span>
          </span>
          <button
            onClick={onClose}
            aria-label={t('nav.closeMenu')}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-(--dur)"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <PersonaSwitch onNavigate={onClose} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Sidebar onNavigate={onClose} />
        </div>
        <SidebarFooter />
      </div>
    </div>
  );
}
