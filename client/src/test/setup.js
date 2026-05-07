import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { server } from './server';

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
