// react-simple-code-editor ships as CommonJS (`exports.default = Editor`).
// Vite's CJS→ESM interop normally unwraps the default, but on the CI dev
// server the dynamic-import chunk for SystemPage sometimes lands with the
// whole module object as the "default" instead of the unwrapped function.
// The resulting "Element type is invalid: ... got: object" crash brought
// down the entire SystemPage subtree via ErrorBoundary (caught by Playwright
// E2E on PR X — audit PR X follow-up #4).
//
// Namespace + default-or-self fallback is the canonical fix for this
// shape: handles ESM, CJS-with-__esModule, and CJS-without-__esModule all
// at once without depending on Vite's interop heuristics.
import * as ReactSimpleCodeEditor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-json';
import 'prismjs/themes/prism-tomorrow.css';
import { cn } from '@/lib/utils';

const Editor = ReactSimpleCodeEditor.default ?? ReactSimpleCodeEditor;

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
