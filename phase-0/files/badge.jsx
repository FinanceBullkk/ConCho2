import * as React from "react"
import { cva } from "class-variance-authority";
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/* ─────────────────────────────────────────────────────────────────
 * Phase 0 — Badge / Chip refactor
 *
 * Used for two distinct UI roles:
 *   (1) Inline status indicators next to text   ("Active", "Pending")
 *   (2) Tag-style filters and labels            ("Admin", "Teacher")
 *
 * Changes from current:
 *   1. New SEMANTIC variants: `success`, `warning`, `info`, `danger`.
 *      Each renders with a tint background + matching colored text +
 *      thin matching-color border. Replaces ad-hoc `bg-success/10` usages.
 *   2. New `dot` prop — prepends a 6px round indicator dot. Cleaner than
 *      using a separate <span/> wrapper. Composable with any variant.
 *   3. Sizes added: `sm` (18px) for tight contexts (table cells, session
 *      cards), `default` (22px), `lg` (26px) for inline-with-h2.
 *   4. Existing variants (default/secondary/destructive/outline/ghost/link)
 *      preserved — no consumer breaks.
 *   5. Border-radius: pill (999px) — already correct.
 *
 * Migration tip:
 *   <Badge variant="outline" className="text-success border-success/30 bg-success/10">
 *     ✅ Active
 *   </Badge>
 *
 * Becomes:
 *   <Badge variant="success" dot>Active</Badge>
 * ───────────────────────────────────────────────────────────────── */

const badgeVariants = cva(
  [
    "inline-flex w-fit shrink-0 items-center justify-center gap-1.5",
    "rounded-full border whitespace-nowrap",
    "font-medium",
    "transition-colors duration-(--dur-fast)",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "[&>svg]:pointer-events-none [&>svg]:size-3 [&>svg]:stroke-[1.75]",
  ].join(" "),
  {
    variants: {
      variant: {
        // ── Legacy variants (kept for backwards compat) ──
        default: "bg-primary text-primary-foreground border-transparent",
        secondary: "bg-secondary text-secondary-foreground border-transparent",
        destructive: "bg-destructive text-destructive-foreground border-transparent",
        outline: "border-border-strong text-foreground",
        ghost: "border-transparent text-muted-foreground",
        link: "border-transparent text-primary underline-offset-4 hover:underline",

        // ── Semantic chip variants (NEW — Phase 0) ──
        success: "bg-success-soft text-success border-success/20",
        warning: "bg-warning-soft text-warning border-warning/20",
        info:    "bg-info-soft text-info border-info/25",
        danger:  "bg-destructive-soft text-destructive border-destructive/20",
        // Quiet neutral state — for "Not started", "Draft", "Archived"
        neutral: "bg-surface-2 text-muted-foreground border-border",
      },
      size: {
        sm:      "h-[18px] px-1.5 text-[10.5px] gap-1",
        default: "h-[22px] px-2 text-[11.5px]",
        lg:      "h-[26px] px-2.5 text-[12px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  size = "default",
  dot = false,
  asChild = false,
  children,
  ...props
}) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      data-size={size}
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    >
      {dot && (
        <span
          aria-hidden="true"
          className="inline-block size-[6px] rounded-full bg-current shrink-0"
        />
      )}
      {children}
    </Comp>
  );
}

export { Badge, badgeVariants }
