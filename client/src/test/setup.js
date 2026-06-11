import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, beforeAll, afterAll } from 'vitest';
import { server } from './server';

// ── P3-05: i18n stub ──────────────────────────────────────
// LoginPage (and all translated components) call useTranslation().
// Without an initialised i18next instance in tests, t('auth.login.title')
// returns the raw key string "auth.login.title", causing assertions like
// getByRole('heading', { name: /sign in/i }) to fail.
//
// Fix: mock react-i18next with a t() backed by the real EN translation file.
// t('auth.login.title') → 'Sign in'  (matches /sign in/i)
// Unknown keys fall back to the key string itself.
import { vi } from 'vitest';
import enLocale from '../i18n/locales/en.json';

/** Flatten nested object to dot-notation keys: { 'auth.login.title': 'Sign in' } */
const flattenTranslations = (obj, prefix = '') =>
  Object.entries(obj).reduce((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(acc, flattenTranslations(v, key));
    } else {
      acc[key] = Array.isArray(v) ? v.join(', ') : String(v ?? '');
    }
    return acc;
  }, {});

const translations = flattenTranslations(enLocale);
// Minimal i18next-style interpolation so strings like "Due {{date}}" render
// real values in tests instead of raw placeholders.
const mockT = (key, vars) => {
  const template = translations[key] ?? key;
  if (!vars || typeof vars !== 'object') return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: mockT,
    i18n: { changeLanguage: vi.fn(), language: 'en' },
  }),
  Trans: ({ i18nKey, children }) => children ?? mockT(i18nKey),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}));

// Automatically unmount components after each test
afterEach(cleanup);

// Suppress Radix UI / React 18 concurrent mode warnings in tests
const originalError = console.error;
beforeEach(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Warning: ReactDOM.render') ||
        args[0].includes('act('))
    )
      return;
    originalError(...args);
  };
});
afterEach(() => {
  console.error = originalError;
});

// Start mock server before all tests, reset after each, close after all
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
