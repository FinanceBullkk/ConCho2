import * as React from "react"
import { cva } from "class-variance-authority";
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/* ─────────────────────────────────────────────────────────────────
 * Phase 0 — Button refactor
 *
 * Changes from current:
 *   1. Default height 36 → 30px (compact desktop tools). xs / sm / lg
 *      shrink in proportion. icon sizes match.
 *   2. New `inverse` variant — solid bg-foreground text-background.
 *      This is the new PRIMARY CTA style (Linear/Vercel pattern).
 *      The old `default` (blue) stays for backwards compat but should
 *      be migrated to `inverse` over time for hero actions.
 *   3. Drop `shadow-xs` from `outline` — Phase 0 forbids decorative shadows.
 *   4. Tighter focus ring (2px instead of 3px) using primary directly.
 *   5. Font weight: secondary/outline/ghost now `font-medium` (was 500).
 *      Primary stays `font-semibold` for clear hierarchy.
 *
 * Public API unchanged — no consumer breaks.
 * ───────────────────────────────────────────────────────────────── */

const buttonVariants = cva(
  // Base: typography, layout, focus ring, disabled state, icon sizing.
  // Note: we explicitly set leading-none so 30px height lines up cleanly
  // with text. Without it Inter overshoots by ~2px.
  [
    "inline-flex shrink-0 items-center justify-center gap-1.5",
    "rounded-md text-[13px] font-medium leading-none whitespace-nowrap",
    "transition-colors duration-(--dur-fast)",
    "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50",
    "aria-invalid:border-destructive aria-invalid:ring-destructive/30",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
    "[&_svg:not([class*='size-'])]:size-[14px] [&_svg:not([class*='size-'])]:stroke-[1.75]",
  ].join(" "),
  {
    variants: {
      variant: {
        // Existing — kept for backwards compat (blue brand action)
        default: "bg-primary text-primary-foreground hover:bg-primary/90 font-semibold",

        // NEW — high-emphasis CTA. Use this for "New schedule", "Save", etc.
        // Visually stronger than blue on dark backgrounds.
        inverse: "bg-foreground text-background hover:bg-foreground/90 font-semibold",

        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 font-semibold focus-visible:ring-destructive",

        outline:
          "border border-border-strong bg-card hover:bg-surface-2 text-foreground",

        secondary:
          "bg-secondary text-secondary-foreground hover:bg-surface-2",

        ghost:
          "text-muted-foreground hover:bg-secondary hover:text-foreground",

        link:
          "text-primary underline-offset-4 hover:underline px-0 h-auto",
      },
      size: {
        default:  "h-[30px] px-3 has-[>svg]:px-2.5",
        xs:       "h-[22px] px-2 text-[11.5px] gap-1 rounded-[5px] has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm:       "h-[26px] px-2.5 text-[12px] has-[>svg]:px-2",
        lg:       "h-[36px] px-4 text-[14px] has-[>svg]:px-3.5",
        icon:     "size-[30px]",
        "icon-xs":"size-[22px] rounded-[5px] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":"size-[26px]",
        "icon-lg":"size-[36px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export { Button, buttonVariants }
