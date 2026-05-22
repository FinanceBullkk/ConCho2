import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Inline spinner. Replaces 30+ hand-rolled CSS-only spinners that previously
 * lived inline in pages (`border-2 ... border-t-transparent rounded-full
 * animate-spin`). Use `<Spinner size={...} />` everywhere now.
 *
 * Sizes (Phase 1 §02 binding):
 *   16 — inline next to text, default
 *   24 — small page sections
 *   32 — page-level loading
 *
 * Color follows `currentColor` (parent decides tone via text-* utility).
 * Respects `prefers-reduced-motion`: animation stops, icon stays static.
 */
export function Spinner({ size = 16, className, label = 'Loading', ...rest }) {
  return (
    <Loader2
      role="status"
      aria-label={label}
      style={{ width: size, height: size }}
      strokeWidth={2}
      className={cn('animate-spin motion-reduce:animate-none', className)}
      {...rest}
    />
  );
}
