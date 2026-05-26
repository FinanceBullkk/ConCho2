// ──────────────────────────────────────────────────────────
// PasswordStrength — Phase 4 Surface 10 §D
//
// Single source of truth for password-strength scoring + meter UI.
// Lifts the heuristic + 4-bar visual that previously lived inline
// in App.jsx ForceChangePasswordModal (and a less-developed copy in
// UserSettingsPage). 3 callsites consume:
//
//   1. App.jsx ForceChangePasswordModal — passes VN labels
//   2. UserSettingsPage ChangePasswordSection — passes EN labels
//   3. ResetPasswordPage (bonus per Phase 4 Plan §11A) — EN labels
//
// Scorer is 4 binary checks summed (preserved verbatim from existing
// logic to avoid behavior drift): length≥10 + uppercase + digit +
// non-alphanumeric. Score 0-4. No external dep.
//
// Design choices (Phase 4 §D notes):
// - Static tone maps (not template strings) so Tailwind's purge keeps
//   the classes alive in production builds.
// - Component returns null when value is empty — caller doesn't need
//   to gate. Parent reads strength via `scorePassword(value)` directly
//   for submit gating (10D · pure UI, no callback).
// ──────────────────────────────────────────────────────────

const DEFAULT_LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong'];

// Static class maps — string-template would defeat Tailwind purge.
const TONE_BG = [
  '',
  'bg-destructive',
  'bg-warning',
  'bg-success',
  'bg-success',
];
const TONE_TEXT = [
  'text-muted-foreground',
  'text-destructive',
  'text-warning',
  'text-success',
  'text-success',
];

/**
 * Score a password 0-4 using the project's existing rule set.
 * Caller-friendly: also safe with non-string input (returns 0).
 */
// eslint-disable-next-line react-refresh/only-export-components
export function scorePassword(pwd) {
  if (typeof pwd !== 'string' || !pwd) return 0;
  let s = 0;
  if (pwd.length >= 10)              s++;
  if (/[A-Z]/.test(pwd))             s++;
  if (/[0-9]/.test(pwd))             s++;
  if (/[^A-Za-z0-9]/.test(pwd))      s++;
  return s;
}

export function PasswordStrength({ value, labels = DEFAULT_LABELS, className }) {
  if (!value) return null;
  const score = scorePassword(value);
  return (
    <div className={`space-y-1 ${className ?? ''}`}>
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <div
            key={n}
            className={`h-1 flex-1 rounded-full transition-colors duration-200 ${
              score >= n ? TONE_BG[score] : 'bg-muted'
            }`}
          />
        ))}
      </div>
      <p
        className={`text-xs font-medium ${TONE_TEXT[score]}`}
        aria-live="polite"
      >
        {labels[score] || ''}
      </p>
    </div>
  );
}
