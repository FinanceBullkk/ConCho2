// Returns schedules from allSchedules that overlap with candidate's time window.
// Excludes candidate._id so editing a session doesn't flag itself.
// "Overlap" = intervals intersect (start < otherEnd AND end > otherStart).
export function detectConflicts(allSchedules, candidate) {
  const cStart = new Date(candidate.startTime).getTime();
  const cEnd   = new Date(candidate.endTime).getTime();
  if (!cStart || !cEnd || isNaN(cStart) || isNaN(cEnd) || cEnd <= cStart) return [];
  return allSchedules.filter(s => {
    if (candidate._id && s._id === candidate._id) return false;
    const sStart = new Date(s.startTime).getTime();
    const sEnd   = new Date(s.endTime).getTime();
    return sStart < cEnd && sEnd > cStart;
  });
}
