import * as React from "react"

import { cn } from "@/lib/utils"

/* ─────────────────────────────────────────────────────────────────
 * Phase 0 — Card refactor
 *
 * Changes from current:
 *   1. REMOVE `shadow-sm` from base Card — Phase 0 forbids decorative
 *      shadows on flat surfaces. Borders only.
 *   2. REMOVE forced `gap-6 py-6` from base — these are too generous
 *      for dense desktop layouts and forced every consumer to override.
 *      Now padding/gap are opt-in via CardHeader / CardContent / CardFooter.
 *   3. Default rounding: rounded-lg (10px) — feels more SaaS than xl.
 *   4. CardHeader: padding 16px 20px (was px-6 = 24px), border-bottom
 *      to visually separate from content (was none).
 *   5. CardContent: padding 20px (was px-6 = 24px).
 *   6. CardFooter: padding 12px 20px, top-border, bg-background subtle.
 *
 * Public API unchanged — no consumer breaks. Existing usages still
 * render correctly; they just look tighter and don't carry shadow.
 *
 * NEW prop: <Card tone="surface-2"> for slightly raised surface
 * (used in stat strips, inner panels).
 * ───────────────────────────────────────────────────────────────── */

function Card({
  className,
  tone = "default",
  ...props
}) {
  return (
    <div
      data-slot="card"
      data-tone={tone}
      className={cn(
        "flex flex-col rounded-lg border text-card-foreground",
        tone === "surface-2" ? "bg-surface-2" : "bg-card",
        className
      )}
      {...props}
    />
  );
}

function CardHeader({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        // grid layout for title/description + action slot
        "@container/card-header grid auto-rows-min items-start gap-1",
        "px-5 py-4 border-b border-border",
        "has-data-[slot=card-action]:grid-cols-[1fr_auto]",
        className
      )}
      {...props}
    />
  );
}

function CardTitle({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-title"
      className={cn("text-[14px] font-semibold leading-tight", className)}
      {...props}
    />
  );
}

function CardDescription({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-[11.5px] text-subtle-foreground leading-snug", className)}
      {...props}
    />
  );
}

function CardAction({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  );
}

function CardContent({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-content"
      className={cn("p-5", className)}
      {...props}
    />
  );
}

function CardFooter({
  className,
  ...props
}) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center gap-2 px-5 py-3 border-t border-border",
        "text-[12px] text-subtle-foreground",
        className
      )}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
