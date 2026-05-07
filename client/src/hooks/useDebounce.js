import { useState, useEffect } from 'react';

/**
 * Delays updating the returned value until after `delay` ms have elapsed
 * since the last change to `value`. Useful for search inputs — prevents
 * firing a query on every keystroke.
 *
 * @param {*} value   The value to debounce
 * @param {number} delay  Debounce delay in ms (default: 300)
 */
export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
