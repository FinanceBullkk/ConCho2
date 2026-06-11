import { useQuery } from '@tanstack/react-query';
import { learningAPI } from '../api/api';
import { qk } from './queryKeys';

// ──────────────────────────────────────────────────────────
// useSchedulingConfig — the server's authoritative scheduling config
// ──────────────────────────────────────────────────────────
// Reads GET /api/learning/sessions/config:
//   { timezone, utcOffsetMinutes, weeklyTeamLimit, slots[] }
// where each slot is an exact descriptor
//   { id, label, startHour, startMinute, endHour, endMinute, durationMinutes }.
//
// The booking grid renders these exact windows (incl. non-60-min / minute
// offsets) and builds exact UTC ranges from them — no client-side fallback slot
// list. An empty/malformed config returns `slots: []` (fail-closed: nothing new
// is bookable; historical off-policy sessions still render).
// ──────────────────────────────────────────────────────────

// VN is a fixed +07:00 (no DST); used only if the config hasn't loaded yet.
export const DEFAULT_UTC_OFFSET_MINUTES = 420;

export function useSchedulingConfig(options = {}) {
  return useQuery({
    queryKey: qk.schedules.config,
    queryFn: () => learningAPI.getSchedulingConfig().then((r) => r.data.data),
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}
