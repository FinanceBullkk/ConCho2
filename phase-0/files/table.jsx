"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/* ─────────────────────────────────────────────────────────────────
 * Phase 0 — Table refactor
 *
 * Changes from current:
 *   1. Header style: text-[11px] font-medium uppercase tracking-wider
 *      text-subtle-foreground (was text-foreground at default weight).
 *      This makes column labels read as metadata, not content.
 *   2. Row hover: very subtle — `hover:bg-foreground/[0.015]` (was
 *      `hover:bg-muted/50` which created chunky stripes).
 *   3. Cell padding: 12px (was 8px) — better breathing room.
 *      Header padding 10px 12px (compact, since uppercase text is short).
 *   4. Last row: no bottom border (clean edge).
 *   5. Density token: header h-10 → h-9 (32px). Cell rows use --row-h.
 *
 * Public API unchanged.
 *
 * Tip — for "stripped down" tables inside Cards, the Card already
 * provides the outer border. The Table just needs `data-bare` or
 * `className="border-0"` to remove its own.
 * ───────────────────────────────────────────────────────────────── */

function Table({
  className,
  ...props
}) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn(
          "w-full caption-bottom text-[13px] tabular-nums",
          className
        )}
        {...props}
      />
    </div>
  );
}

function TableHeader({
  className,
  ...props
}) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b [&_tr]:border-border", className)}
      {...props}
    />
  );
}

function TableBody({
  className,
  ...props
}) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableFooter({
  className,
  ...props
}) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t border-border bg-card font-medium text-[12px] text-subtle-foreground",
        "[&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  );
}

function TableRow({
  className,
  ...props
}) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-border",
        "transition-colors duration-(--dur-fast)",
        // Very subtle hover — not the chunky bg-muted/50 of v1
        "hover:bg-foreground/[0.015]",
        "has-aria-expanded:bg-foreground/[0.025]",
        "data-[state=selected]:bg-primary-soft",
        className
      )}
      {...props}
    />
  );
}

function TableHead({
  className,
  ...props
}) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-9 px-3 text-left align-middle whitespace-nowrap",
        "text-[11px] font-medium uppercase tracking-wider text-subtle-foreground",
        "[&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  );
}

function TableCell({
  className,
  ...props
}) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-3 py-3 align-middle whitespace-nowrap",
        "[&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  );
}

function TableCaption({
  className,
  ...props
}) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-3 text-[12px] text-subtle-foreground", className)}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
