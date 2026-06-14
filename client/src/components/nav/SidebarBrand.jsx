import { Link } from 'react-router-dom';

// Sidebar header — gradient logo mark + wordmark, links home. Sits at the top of
// the full-height sidebar (north-star shell), 52px tall to align with the topbar.
export default function SidebarBrand({ onNavigate }) {
  return (
    <Link
      to="/home"
      onClick={onNavigate}
      className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-border px-3.5"
    >
      <span className="grid size-[26px] place-items-center rounded-[7px] bg-gradient-to-br from-primary to-primary/70 text-[13px] font-bold text-primary-foreground shadow-sm">
        T
      </span>
      <span className="text-sm font-semibold tracking-tight text-foreground">
        TMS<span className="text-primary">v2</span>
      </span>
    </Link>
  );
}
