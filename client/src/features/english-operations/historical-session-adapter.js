import { englishArchiveWallClockToInstant } from '../english-training/archive-time';

const ONE_HOUR_MS = 60 * 60 * 1000;

export function adaptHistoricalSessions(rows, labels) {
  return (rows || []).flatMap((row) => {
    const start = englishArchiveWallClockToInstant(row.heldAt);
    if (!start) return [];
    const markedCount = Number(row.attendanceCount || 0);
    const enrolledCount = Math.max(Number(row.expectedRosterCount || 0), markedCount);
    const attendanceStatus = markedCount === 0
      ? 'none'
      : markedCount < enrolledCount ? 'partial' : 'done';
    return [{
      _id: `archive:${row.id}`,
      archiveSessionId: row.id,
      isHistorical: true,
      historicalLabel: labels.historical,
      historicalReadOnlyLabel: labels.readOnly,
      startTime: start.toISOString(),
      endTime: new Date(start.getTime() + ONE_HOUR_MS).toISOString(),
      status: row.status,
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
