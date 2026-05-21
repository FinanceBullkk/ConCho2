import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { server } from './server';

// Initialize i18n synchronously for tests so components that call
// useTranslation() receive real translated strings, not raw keys.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../i18n/locales/en.json';
import vi_locale from '../i18n/locales/vi.json';

if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      resources: { en: { translation: en }, vi: { translation: vi_locale } },
      lng: 'en',
      fallbackLng: 'en',
      defaultNS: 'translation',
      interpolation: { escapeValue: false },
      initImmediate: false,
    });
}

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
