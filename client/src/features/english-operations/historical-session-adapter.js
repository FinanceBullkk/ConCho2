import { englishArchiveWallClockToInstant } from '../english-training/archive-time';

export function adaptHistoricalSessions(rows, labels) {
  return (rows || []).flatMap((row) => {
    const imported = row.sourceKind !== 'live';
    const start = imported
      ? englishArchiveWallClockToInstant(row.heldAt)
      : new Date(row.heldAt);
    if (!start || Number.isNaN(start.getTime())) return [];
    const durationMs = Number(row.durationMinutes || 60) * 60 * 1000;
    const markedCount = Number(row.attendanceCount || 0);
    const enrolledCount = Math.max(Number(row.expectedRosterCount || 0), markedCount);
    const attendanceStatus = markedCount === 0
      ? (enrolledCount === 0 ? 'none' : imported ? 'unrecorded' : 'pending')
      : markedCount < enrolledCount ? 'partial' : 'done';
    return [{
      _id: `archive:${row.id}`,
      archiveSessionId: row.id,
      courseRunId: row.courseRunId,
      meetingId: row.meetingId || null,
      cancellationReason: row.cancellationReason || null,
      meetLink: row.meetLink || null,
      sourceKind: imported ? 'imported' : 'live',
      isHistorical: true,
      historicalLabel: row.meetingStatus === 'cancelled'
        ? (labels.cancelled || labels.live || labels.historical)
        : imported ? labels.historical : (labels.live || labels.historical),
      historicalReadOnlyLabel: row.meetingStatus === 'cancelled'
        ? (labels.cancelled || labels.readOnly)
        : imported ? labels.readOnly : (labels.live || labels.historical),
      startTime: start.toISOString(),
      endTime: new Date(start.getTime() + durationMs).toISOString(),
      status: row.meetingStatus || row.status,
      sessionNumber: row.sessionNumber,
      classId: {
        _id: `archive-run:${row.courseRunId}`,
        classCode: row.classCode,
        courseName: row.courseName,
      },
      enrolledCount,
      markedCount,
      capacity: enrolledCount,
      attendanceStatus,
      attendanceStateLabel: attendanceStatus === 'unrecorded' ? labels.unrecorded : null,
      archiveCounts: {
        present: Number(row.presentCount || 0),
        absent: Number(row.absentCount || 0),
      },
    }];
  });
}

export function latestMarkedHistoricalStart(schedules) {
  return (schedules || []).find((schedule) => schedule.markedCount > 0)?.startTime
    || schedules?.[0]?.startTime;
}
