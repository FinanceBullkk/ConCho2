import { createPortal } from 'react-dom';

/**
 * Portal — renders children directly into document.body.
 *
 * This escapes any CSS `transform` / `will-change` ancestors that
 * break `position: fixed` modals (the "containing block" bug).
 */
export default function Portal({ children }) {
  return createPortal(children, document.body);
}
