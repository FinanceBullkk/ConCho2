// Server-side pagination controls
// Props: page (1-based), totalPages, onPageChange, isLoading
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export default function Pagination({ page, totalPages, onPageChange, isLoading = false, className = '' }) {
  if (totalPages <= 1) return null;

  const btnCls = 'flex items-center justify-center w-9 h-9 rounded-xl border border-white/10 text-slate-400 hover:bg-white/10 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed';

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
      className={`flex items-center gap-1 ${isLoading ? 'opacity-60 pointer-events-none' : ''} ${className}`}
    >
      <button
        onClick={() => onPageChange(1)}
        disabled={page === 1}
        aria-label="First page"
        className={btnCls}
      >
        <ChevronsLeft className="size-4" />
      </button>
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        aria-label="Previous page"
        className={btnCls}
      >
        <ChevronLeft className="size-4" />
      </button>

      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`ellipsis-${i}`} className="w-9 text-center text-slate-500 text-sm">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            aria-current={p === page ? 'page' : undefined}
            aria-label={`Page ${p}`}
            className={`w-9 h-9 rounded-xl text-sm font-medium transition-all ${
              p === page
                ? 'bg-primary-600 text-white border border-primary-500'
                : btnCls
            }`}
          >
            {p}
          </button>
        )
      )}

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        aria-label="Next page"
        className={btnCls}
      >
        <ChevronRight className="size-4" />
      </button>
      <button
        onClick={() => onPageChange(totalPages)}
        disabled={page === totalPages}
        aria-label="Last page"
        className={btnCls}
      >
        <ChevronsRight className="size-4" />
      </button>
    </nav>
  );
}
