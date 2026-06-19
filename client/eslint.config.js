import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import { defineConfig, globalIgnores } from 'eslint/config'

// ──────────────────────────────────────────────────────────
// Lint policy (audit PR J — CODE-007; ratcheted in PR U)
//
// CI's `client-lint` job is now a REQUIRED gate. To make that
// safe without forcing a 29-file refactor in this PR, we use
// the ratchet pattern:
//
//   - eslint runs with `--max-warnings <N>` where N is the
//     warning count on `main` at the time of the cap bump.
//   - The cap is allowed to GO DOWN but never UP. PR review
//     calls out any increase.
//   - New rule violations on existing files surface as warnings
//     (developer feedback) but don't break CI until they push
//     the total above the cap.
//
// Cap history:
//   PR J  — 138 (initial baseline)
//   PR U  — 113 (after FE-010 modal migrations + autofix removed
//                redundant eslint-disable comments)
//   …     —  41 (incremental burndown across later PRs)
//   Q-B#1 —  35 (quality-first slice 1: fixed 6 React Compiler
//                correctness warnings — Date.now()-in-render purity ×3,
//                use-before-declare immutability ×3)
//   Q-B#2 —   7 (quality-first slice 2: cleared all 28 jsx-a11y warnings
//                across 8 files — keyboard handlers / convert-to-button /
//                role=presentation / managed autofocus, adversarially
//                verified. Remaining 7 = set-state-in-effect ×3 +
//                react-hook-form watch() ×3 + react-refresh ×1)
//
// Specifically downgraded from `error` (plugin default) → `warn`:
//   - jsx-a11y/*   — 92 pre-existing violations (P3-06 follow-up)
//   - react-hooks/purity, set-state-in-effect, immutability,
//     static-components, incompatible-library — these are the
//     React Compiler rules new in eslint-plugin-react-hooks v7.
//     They're useful warnings but flag long-standing patterns
//     that need careful refactoring per component. ~21 sites
//     today; track individually and fix opportunistically.
//
// Hard errors that still block (no ratchet):
//   - no-undef, no-unused-vars (catches typos & dead code)
//   - react-hooks/rules-of-hooks (real bug — broken component)
//   - react-hooks/exhaustive-deps (real bug — stale closure)
// ──────────────────────────────────────────────────────────

export default defineConfig([
  // `.vite-cache` is Vite's dependency pre-bundling cache (regenerated on
  // every `npm run dev`); it contains transpiled vendor JS that should not
  // be linted. `dist` is the production build output.
  // `coverage` is the vitest --coverage output (lcov + HTML report) — generated
  // JS that must not be linted nor committed (also in .gitignore).
  globalIgnores(['dist', 'dist_old', '.vite-cache', 'playwright-report', 'test-results', 'coverage']),

  // ── Application source ───────────────────────────────────
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],

      // QA-013: plugin-recommended severity is `warn`; the header above (and
      // testing-and-ci.md) always CLAIMED this was a hard error. Promoted for
      // real once the 8 live violations were fixed (audit round 6) — a stale
      // closure is a real bug, it must block.
      'react-hooks/exhaustive-deps': 'error',

      // ── jsx-a11y: downgrade from error → warn ────────────
      // The 92 accessibility violations are real UX debt but
      // they are not functional regressions. Treat as warnings
      // so the ratchet cap can hold the line while we resolve
      // incrementally (P3-06 follow-up).
      'jsx-a11y/label-has-associated-control': 'warn',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/no-noninteractive-element-interactions': 'warn',
      'jsx-a11y/no-autofocus': 'warn',
      'jsx-a11y/interactive-supports-focus': 'warn',
      'jsx-a11y/anchor-is-valid': 'warn',

      // ── react-refresh: warn instead of error ─────────────
      // Several utility files export both components and helpers.
      // Fixing all of them requires file splits which are out-of-scope
      // for this audit cycle. Warn so the intent is visible.
      'react-refresh/only-export-components': 'warn',

      // ── react-hooks v7 (React Compiler rules) ────────────
      // New in eslint-plugin-react-hooks v7. These flag patterns
      // that the upcoming React Compiler can't optimise. The
      // codebase predates v7 so ~21 sites trip them. They're
      // legitimate signal but require careful per-component
      // refactor (move setState out of effects, lift derived
      // state to useMemo, etc.). Track as warnings until the
      // ratchet drives them to zero.
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/incompatible-library': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/unsupported-syntax': 'warn',
      'react-hooks/error-boundaries': 'warn',
      'react-hooks/component-hook-factories': 'warn',
      'react-hooks/globals': 'warn',
      'react-hooks/config': 'warn',
      'react-hooks/gating': 'warn',
    },
  },

  // ── Node-environment overrides (MUST come AFTER application block) ──
  // Flat-config rule resolution is "last match wins" per file. Both this
  // block and the application block target e2e/**, so this one wins for
  // the rules it sets.
  //
  // vite.config.js, playwright.config.js, e2e/**  use Node globals
  // (process, __dirname) that are not available in browser scope.
  // Lint them with node globals so no-undef does not fire there.
  //
  // The e2e suite also uses Playwright's fixture pattern `async ({ page }, use)`
  // where `use` is NOT a React hook — but rules-of-hooks sees the name and
  // fires. Disable the React Hooks linter for the e2e dir specifically.
  {
    files: [
      'vite.config.js',
      'playwright.config.js',
      'e2e/**/*.js',
      'e2e/**/*.jsx',
    ],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
])
