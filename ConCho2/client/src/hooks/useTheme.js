// ──────────────────────────────────────────────────────────
// useTheme — persisted dark/light mode toggle
//
// Reads initial value from localStorage ('tms-theme').
// Falls back to system preference (prefers-color-scheme).
// Applies 'dark' class to <html> and persists the choice.
// ──────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';

function getInitialTheme() {
  try {
    const stored = localStorage.getItem('tms-theme');
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    // localStorage blocked in some browsers
  }
  // Fall back to system preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('tms-theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  const isDark = theme === 'dark';

  return { theme, isDark, toggle };
}
