// ──────────────────────────────────────────────────────────
// Pagination — server-side page controls
// Phase 1 §07 — tokenised (no more slate-*/white/* hardcodes)
//
// Props:
//   page         1-based current page
//   totalPages   total number of pages (renders nothing when ≤ 1)
//   onPageChange (page: number) => void
//   isLoading    dim + disable while fetching (default false)
//   className    optional extra class on <nav>
// ──────────────────────────────────────────────────────────
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const BTN_BASE =
  'flex items-center justify-center size-8 rounded-md border border-border ' +
  'text-muted-foreground text-sm ' +
  'hover:bg-accent hover:text-foreground ' +
  'transition-colors duration-(--dur-fast) ' +
  'disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none';

const BTN_ACTIVE =
  'bg-primary text-primary-foreground border-primary ' +
  'hover:bg-primary hover:text-primary-foreground ' +
  'font-medium';

export default function Pagination({ page, totalPages, onPageChange, isLoading = false, className }) {
  if (totalPages <= 1) return null;

  // Build visible page range: always show first, last, current ±2
  const pages = [];
  const delta = 2;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }

  return (
    <nav
      role="navigation"
      aria-label="Pagination"
      className={cn(
        'flex items-center gap-1',
        isLoading && 'opacity-60 pointer-events-none',
        className,
      )}
    >
      <button
        onClick={() => onPageChange(1)}
        disabled={page === 1}
        aria-label="First page"
        className={BTN_BASE}
      >
        <ChevronsLeft className="size-3.5" />
      </button>
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        aria-label="Previous page"
        className={BTN_BASE}
      >
        <ChevronLeft className="size-3.5" />
      </button>

      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`ell-${i}`} className="size-8 flex items-center justify-center text-subtle-foreground text-sm">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            aria-current={p === page ? 'page' : undefined}
            aria-label={`Page ${p}`}
            className={cn(BTN_BASE, p === page && BTN_ACTIVE)}
          >
            {p}
          </button>
        ),
      )}

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        aria-label="Next page"
        className={BTN_BASE}
      >
        <ChevronRight className="size-3.5" />
      </button>
      <button
        onClick={() => onPageChange(totalPages)}
        disabled={page === totalPages}
        aria-label="Last page"
        className={BTN_BASE}
      >
        <ChevronsRight className="size-3.5" />
      </button>
    </nav>
  );
}
