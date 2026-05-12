import { useMemo } from 'react';
import { useSettings } from './useSettings';

// ──────────────────────────────────────────────────────────
// useTimeSlots — derive allowed time-slot strings from DB settings
// ──────────────────────────────────────────────────────────
// Returns the ALLOWED_TIME_SLOTS setting as an array of strings in the
// format "HH:MM-HH:MM" (e.g. ["10:00-11:00", "11:00-12:00", ...]).
//
// Falls back to hardcoded defaults while the settings query is loading,
// so the timetable grid is never empty on first render.
// ──────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, '0');

/** Convert { sh, sm, eh, em } setting object → "HH:MM-HH:MM" */
const slotToString = ({ sh, sm, eh, em }) =>
  `${pad(sh)}:${pad(sm)}-${pad(eh)}:${pad(em)}`;

/** Hardcoded fallback — mirrors the seed ALLOWED_TIME_SLOTS value. */
export const FALLBACK_TIME_SLOTS = [
  '10:00-11:00',
  '11:00-12:00',
  '13:00-14:00',
  '14:00-15:00',
  '15:00-16:00',
];

/**
 * Hook: returns the current allowed time-slot strings.
 *
 * Usage:
 *   const timeSlots = useTimeSlots();
 *   // → ["10:00-11:00", "11:00-12:00", "13:00-14:00", "14:00-15:00", "15:00-16:00"]
 */
export function useTimeSlots() {
  // Settings are cached by React Query; staleTime keeps re-fetches minimal.
  const { data: settings } = useSettings({ staleTime: 5 * 60 * 1000 });

  return useMemo(() => {
    if (!Array.isArray(settings)) return FALLBACK_TIME_SLOTS;
    const entry = settings.find((s) => s.key === 'ALLOWED_TIME_SLOTS');
    if (!Array.isArray(entry?.value) || entry.value.length === 0) return FALLBACK_TIME_SLOTS;
    return entry.value.map(slotToString);
  }, [settings]);
}
