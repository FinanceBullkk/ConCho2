// react-simple-code-editor ships as CommonJS (`exports.default = Editor`).
// Vite's CJS→ESM interop on the dev server occasionally double-wraps the
// default for lazy-loaded chunks (SystemPage is lazy), producing
// `{ default: { default: Editor } }` instead of `{ default: Editor }`.
// A single-level `mod.default ?? mod` is not enough — it returns the
// inner object, React then throws "Element type is invalid ... got:
// object", and the whole SystemPage subtree falls into the top-level
// ErrorBoundary. The Playwright E2E gate on PR X surfaced this; the
// audit PR V `continue-on-error: true` was hiding it.
//
// Walk `.default` until we land on a function (the actual component).
// Handles all of ESM, CJS-with-__esModule, CJS-without-__esModule, and
// the double-wrapped Vite case without committing to any specific interop
// behaviour.
import * as ReactSimpleCodeEditor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-json';
import 'prismjs/themes/prism-tomorrow.css';
import { cn } from '@/lib/utils';

function unwrapComponent(mod) {
  let cur = mod;
  // Bounded to 4 hops — any reasonable interop wraps at most twice.
  for (let i = 0; i < 4; i++) {
    if (cur == null) return cur;
    // Stop at any valid React element type: a plain function (function or
    // class component), or an object with `$$typeof` (forwardRef / memo /
    // lazy result — react-simple-code-editor's Editor is a forwardRef so
    // this is the path the unwrap usually exits through).
    if (typeof cur === 'function') return cur;
    if (typeof cur === 'object' && cur.$$typeof) return cur;
    // Nothing further to unwrap.
    if (!('default' in cur)) return cur;
    cur = cur.default;
  }
  return cur;
}
const Editor = unwrapComponent(ReactSimpleCodeEditor);

// ──────────────────────────────────────────────────────────
// SettingsEditor — Phase 4 Surface 9 §H
//
// Lightweight JSON code editor for the System · Settings tab.
// Wraps react-simple-code-editor + Prism so the user gets syntax
// coloring on small config snippets without bringing in CodeMirror.
//
// Phase 0 §02 exception: code surfaces stay dark for legibility. The
// Prism "tomorrow" theme is dark; we render on bg-slate-900 to match.
// CSS is imported at the module level (loaded once for the whole app)
// — verified not to bleed onto plain <code> elsewhere because Prism
// only adds classes via the `highlight` callback we control.
//
// Props:
//   value     string   raw JSON text
//   onChange  fn       called on every keystroke
//   onBlur    fn       (optional) hook for per-field validate-on-blur
//   error     string   (optional) JSON.parse error message → red border + footer
//   minHeight number   (default 160) pixels
// ──────────────────────────────────────────────────────────

export function SettingsEditor({ value, onChange, onBlur, error, minHeight = 160 }) {
  return (
    <div
      className={cn(
        'rounded-md border overflow-hidden bg-slate-900',
        error ? 'border-destructive' : 'border-border',
      )}
    >
      <Editor
        value={value ?? ''}
        onValueChange={onChange}
        onBlur={onBlur}
        highlight={(code) => Prism.highlight(code, Prism.languages.json, 'json')}
        padding={12}
        textareaClassName="font-mono text-sm focus:outline-none"
        preClassName="font-mono text-sm"
        style={{ minHeight, color: 'hsl(160 60% 70%)' }}
        spellCheck={false}
      />
      {error && (
        <div
          role="alert"
          className="bg-destructive/10 border-t border-destructive/30 px-3 py-1.5 text-xs text-destructive font-mono"
        >
          {error}
        </div>
      )}
    </div>
  );
}
