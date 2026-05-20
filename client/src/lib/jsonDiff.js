// ──────────────────────────────────────────────────────────
// jsonDiff — Phase 4 Surface 9 §H
//
// Simple line-by-line diff between two JSON-able values. Used by
// the audit-log accordion to render add/remove highlighted lines.
//
// Caveats spelled out in the spec: this is NOT LCS-based. For small
// patches (single-field updates, typical audit entries) it produces
// a clean diff. For large object reordering you'll see noise — keys
// are sorted before stringify to dampen that, but switch to
// `fast-json-patch` later if rendering looks noisy in practice.
// ──────────────────────────────────────────────────────────

/**
 * Stable-stringify: same as JSON.stringify but with keys sorted at every
 * level. Reordering noise in the diff drops dramatically when both sides
 * are stringified through this.
 */
function stableStringify(value) {
  return JSON.stringify(
    value ?? null,
    (_key, val) => {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        return Object.fromEntries(
          Object.keys(val).sort().map((k) => [k, val[k]]),
        );
      }
      return val;
    },
    2,
  );
}

/**
 * @param {*} before  prior value (any JSON-able shape, may be null)
 * @param {*} after   new value
 * @returns Array<{ type: 'eq'|'add'|'del', line: string }>
 */
export function diffJson(before, after) {
  const a = stableStringify(before).split('\n');
  const b = stableStringify(after).split('\n');
  const max = Math.max(a.length, b.length);
  const lines = [];
  for (let i = 0; i < max; i++) {
    if (a[i] === b[i]) {
      lines.push({ type: 'eq', line: a[i] ?? '' });
    } else {
      if (a[i] !== undefined) lines.push({ type: 'del', line: a[i] });
      if (b[i] !== undefined) lines.push({ type: 'add', line: b[i] });
    }
  }
  return lines;
}
