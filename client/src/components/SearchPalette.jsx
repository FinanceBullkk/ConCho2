import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search, X, Users, GraduationCap, BookOpen, ArrowRight } from 'lucide-react';
import { useGlobalSearch } from '../hooks/useSearch';

// ──────────────────────────────────────────────────────────
// SearchPalette — Cmd/Ctrl+K command palette
// ──────────────────────────────────────────────────────────
// A keyboard-driven cross-entity search overlay. Opens on Cmd/Ctrl+K
// or via the navbar trigger. Results stream from /api/search and are
// grouped by entity (Users / Teams / Classes).
//
// Keyboard:
//   Esc          — close
//   ↑ / ↓        — move selection
//   Enter        — open the selected result
//   Cmd/Ctrl+K   — open / close (handled by the Navbar host)
// ──────────────────────────────────────────────────────────

const ROUTE_FOR = {
  users:   (u) => `/users?search=${encodeURIComponent(u.empCode)}`,
  teams:   (t) => `/teams?search=${encodeURIComponent(t.name)}`,
  classes: (c) => `/classes?q=${encodeURIComponent(c.classCode)}`,
};

const ICON_FOR = {
  users: Users,
  teams: GraduationCap,
  classes: BookOpen,
};

const LABEL_FOR = {
  users: 'Users',
  teams: 'Teams',
  classes: 'Classes',
};

// Flatten the grouped result into a navigable list of items so arrow
// keys can move across groups.
function flatten(data) {
  if (!data) return [];
  const out = [];
  for (const kind of ['users', 'teams', 'classes']) {
    for (const item of data[kind] || []) {
      out.push({ kind, item });
    }
  }
  return out;
}

function ResultRow({ kind, item, active, onHover, onOpen }) {
  const Icon = ICON_FOR[kind];

  // Render shape per entity
  let title, subtitle;
  if (kind === 'users') {
    title = item.name;
    subtitle = `${item.empCode}${item.department ? ` · ${item.department}` : ''} · ${item.role}`;
  } else if (kind === 'teams') {
    title = item.name;
    subtitle = item.classId
      ? `${item.classId.classCode} — ${item.classId.courseName}`
      : 'No class';
  } else {
    title = `${item.classCode}`;
    subtitle = `${item.courseName}${item.status ? ` · ${item.status}` : ''}`;
  }

  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      // BUG #6 fix: previously both onClick and onMouseEnter called
      // setActive — so clicking a row only highlighted it, never opened.
      // Split the concerns: hover updates selection, click opens.
      onClick={onOpen}
      onMouseEnter={onHover}
      data-active={active ? 'true' : undefined}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
        active ? 'bg-primary/15 text-white' : 'text-slate-300 hover:bg-white/5'
      }`}
    >
      <Icon className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{title}</div>
        <div className="text-xs text-slate-500 truncate">{subtitle}</div>
      </div>
      {active && <ArrowRight className="size-4 text-primary" aria-hidden="true" />}
    </button>
  );
}

export default function SearchPalette({ open, onClose }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  const { data, isFetching, isError } = useGlobalSearch(query, { limit: 5 });
  // Memoize the flat list so `choose`'s identity is stable across renders
  // and Enter cannot land on a different result than the highlighted one
  // due to a debounce-induced reshuffle between keydown and handler.
  const flat = useMemo(() => flatten(data), [data]);

  // Reset when the palette opens
  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      // Focus the input on next frame so the portal has mounted
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Clamp active index when results change
  useEffect(() => {
    setActive((a) => (flat.length === 0 ? 0 : Math.min(a, flat.length - 1)));
  }, [flat.length]);

  const choose = useCallback(
    (idx) => {
      const target = flat[idx];
      if (!target) return;
      const router = ROUTE_FOR[target.kind];
      const route = router(target.item);
      onClose();
      navigate(route);
    },
    [flat, navigate, onClose],
  );

  // Local keyboard handling
  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(0, flat.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(active);
    }
  };

  if (!open) return null;

  // Render grouped: walk flat list but inject group headers when kind changes.
  let prevKind = null;
  let runningIdx = 0;
  const rendered = flat.map(({ kind, item }) => {
    const isNewGroup = kind !== prevKind;
    prevKind = kind;
    const idx = runningIdx;
    runningIdx += 1;
    return (
      <div key={`${kind}-${item._id || idx}`}>
        {isNewGroup && (
          <div className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {LABEL_FOR[kind]}
          </div>
        )}
        <ResultRow
          kind={kind}
          item={item}
          active={idx === active}
          onHover={() => setActive(idx)}
          onOpen={() => choose(idx)}
        />
      </div>
    );
  });

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Global search"
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 backdrop-blur-sm pt-[10vh] px-4 "
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        className="w-full max-w-2xl rounded-2xl bg-slate-900/95 border border-white/10 shadow-2xl overflow-hidden"
      >
        {/* Input */}
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <Search className="size-4 text-slate-400" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search users, teams, classes…"
            aria-label="Search query"
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
          />
          {isFetching && (
            <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" aria-hidden="true" />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        {/* Results */}
        <div role="listbox" aria-label="Search results" className="max-h-[60vh] overflow-y-auto py-1">
          {query.trim().length < 2 && (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              Type at least 2 characters to search.
            </p>
          )}
          {query.trim().length >= 2 && !isFetching && flat.length === 0 && !isError && (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              No matches for &quot;{query}&quot;.
            </p>
          )}
          {isError && (
            <p className="px-4 py-8 text-center text-sm text-red-400">
              Search failed. Please try again.
            </p>
          )}
          {rendered}
        </div>

        {/* Footer help */}
        <div className="border-t border-white/10 px-4 py-2 text-[11px] text-slate-500 flex justify-between">
          <span>
            <kbd className="rounded bg-white/5 px-1.5 py-0.5">↑</kbd>{' '}
            <kbd className="rounded bg-white/5 px-1.5 py-0.5">↓</kbd> Navigate
          </span>
          <span>
            <kbd className="rounded bg-white/5 px-1.5 py-0.5">↵</kbd> Open ·{' '}
            <kbd className="rounded bg-white/5 px-1.5 py-0.5">Esc</kbd> Close
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
