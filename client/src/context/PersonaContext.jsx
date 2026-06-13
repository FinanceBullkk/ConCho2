import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';

// ──────────────────────────────────────────────────────────
// PersonaContext — IA rework Phase 02 (2026-06-13).
//
// A lightweight CLIENT UI mode that swaps which sidebar group-set renders:
//   • 'admin'   → Admin Console (Training/Insights/Manage groups)
//   • 'learner' → My Learning (the /me/* learner surfaces)
//
// It is NOT an authz boundary — the server still enforces everything; routes are
// still guarded by ProtectedRoute. Persona only changes what the sidebar shows
// and where the "switch" lands you. Participants are locked to 'learner'
// (they have no admin surfaces); staff default to 'admin' and may switch.
// Choice persists in localStorage.
// ──────────────────────────────────────────────────────────

const PersonaContext = createContext(null);
const STORAGE_KEY = 'tms.persona';
const VALID = ['admin', 'learner'];

const defaultPersona = (role) => (role === 'Participant' ? 'learner' : 'admin');

export function PersonaProvider({ children }) {
  const { user } = useAuth();
  const role = user?.role;
  const canSwitch = Boolean(role) && role !== 'Participant';

  const [stored, setStored] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  });

  // Effective persona: Participant is always 'learner'; otherwise the stored
  // choice (if valid) else the role default.
  const persona = useMemo(() => {
    if (!role) return 'admin';
    if (role === 'Participant') return 'learner';
    return VALID.includes(stored) ? stored : defaultPersona(role);
  }, [role, stored]);

  const setPersona = useCallback((next) => {
    if (!VALID.includes(next)) return;
    setStored(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* localStorage unavailable — non-fatal */ }
  }, []);

  const value = useMemo(
    () => ({ persona, setPersona, canSwitch }),
    [persona, setPersona, canSwitch],
  );

  return <PersonaContext.Provider value={value}>{children}</PersonaContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePersona() {
  const ctx = useContext(PersonaContext);
  if (!ctx) throw new Error('usePersona must be used within a PersonaProvider');
  return ctx;
}
