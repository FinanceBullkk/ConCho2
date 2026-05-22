import * as React from "react"

import { cn } from "@/lib/utils"

/* ─────────────────────────────────────────────────────────────────
 * Phase 0 — Input refactor
 *
 * Changes from current:
 *   1. Height 36 → 30px (matches --control-h, aligns with Button).
 *   2. Padding-x: 10px (was 12).
 *   3. Font size: 13px (was 16 on mobile / 14 on desktop — too large
 *      for dense forms).
 *   4. Border: `border-input` already aliased to a subtle alpha (var
 *      bumped via tokens). No more `dark:bg-input/30` quirk —
 *      single bg-card surface in both modes.
 *   5. Drop `shadow-xs` — Phase 0 forbids it.
 *   6. Focus ring: 2px of primary (was 3px ring-ring/50). Tighter +
 *      doesn't push layout.
 *
 * Public API unchanged.
 *
 * NEW: `size="lg"` prop for form fields in modals (38px), useful when
 * paired with larger labels.
 * ───────────────────────────────────────────────────────────────── */

function Input({
  className,
  type,
  size = "default",
  ...props
}) {
  return (
    <input
      type={type}
      data-slot="input"
      data-size={size}
      className={cn(
        // base
        "w-full min-w-0 rounded-md border border-border-strong bg-card",
        "text-foreground placeholder:text-subtle-foreground",
        "transition-colors duration-(--dur-fast)",
        "outline-none",
        "selection:bg-primary selection:text-primary-foreground",
        // file input styling
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-[12px] file:font-medium file:text-foreground",
        // focus / invalid
        "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20",
        "aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
        // disabled
        "disabled:cursor-not-allowed disabled:opacity-50",
        // sizes
        size === "sm" && "h-[26px] px-2 text-[12px]",
        size === "default" && "h-[30px] px-2.5 text-[13px]",
        size === "lg" && "h-[38px] px-3 text-[14px]",
        className
      )}
      {...props}
    />
  );
}

export { Input }
