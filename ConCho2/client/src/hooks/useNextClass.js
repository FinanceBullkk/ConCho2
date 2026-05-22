import { useEffect, useMemo, useState } from 'react';
import { useMyClassSchedules } from './useSchedules';

// ──────────────────────────────────────────────────────────
// useNextClass — Phase 3 Screen 6 §E
//
// Returns the earliest upcoming session for the current participant
// (whichever team/class they're in). Backed by useMyClassSchedules
// — server already filters to schedules with startTime >= today.
//
// Shape:
//   {
//     nextClass,       // single schedule object, or null
//     team,            // team name string
//     leader,          // populated leader { _id, name, empCode, email }
//     upcoming,        // next 5 schedules (asc by startTime), excluding nextClass-overlap
//     schedules,       // full list (asc)
//     isLoading, isError, error,
//   }
//
// Caller decides what to render — see ParticipantDashboard.
// ──────────────────────────────────────────────────────────

export function useNextClass() {
  const { data, isLoading, isError, error } = useMyClassSchedules();

  // Re-evaluate "future" every minute so the next-class slot drifts forward
  // as time passes and the user keeps the page open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  return useMemo(() => {
    const schedules = data?.data ?? [];
    const team      = data?.team ?? null;
    const leader    = data?.leader ?? null;

    const sorted = [...schedules].sort(
      (a, b) => new Date(a.startTime) - new Date(b.startTime),
    );

    const future    = sorted.filter((s) => new Date(s.startTime).getTime() >= now);
    const nextClass = future[0] ?? null;
    const upcoming  = future.slice(0, 5);

    return { nextClass, upcoming, schedules: sorted, team, leader, isLoading, isError, error };
  }, [data, now, isLoading, isError, error]);
}
