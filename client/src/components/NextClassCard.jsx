import { useState, useEffect } from 'react';
import { CalendarPlus, Clock, MapPin, User } from 'lucide-react';
import { downloadICS } from '@/lib/ics';
import { cn } from '@/lib/utils';

// ──────────────────────────────────────────────────────────
// NextClassCard — Phase 3 Screen 6 §D layout band 2
//
// Prominent "next session" card. Weekday/date pill on the left,
// class info + countdown in the middle, "Add to calendar" link on
// the right. Mobile collapses the link onto a separate line.
//
// Re-renders every 60s so the countdown stays accurate while the
// user has the page open (per §E risk: stale countdown).
//
// Props:
//   schedule  — single schedule object, or null. When null the
//               card renders nothing; caller is expected to render
//               an EmptyState instead.
//   className — extra wrapper classes
//
// Schedule fields used:
//   _id · startTime · endTime · classId.{classCode,courseName} ·
//   bookedTeamId (teacher comes from elsewhere — pass via prop if needed)
// ──────────────────────────────────────────────────────────

// Format countdown to startTime: "in 2h 15m" / "tomorrow" / "in 3 days" / etc.
function formatCountdown(startMs, nowMs) {
  const ms = startMs - nowMs;
  if (ms <= 0) return 'starting now';

  const minutes = Math.floor(ms / 60_000);
  const hours   = Math.floor(minutes / 60);
  const days    = Math.floor(hours / 24);

  if (minutes < 60) return `in ${minutes}m`;
  if (hours < 24) {
    const rem = minutes - hours * 60;
    return rem > 0 ? `in ${hours}h ${rem}m` : `in ${hours}h`;
  }
  if (days === 1) return 'tomorrow';
  if (days < 7)   return `in ${days} days`;
  return `in ${Math.floor(days / 7)} week${days >= 14 ? 's' : ''}`;
}

export function NextClassCard({ schedule, teacher, className }) {
  // Re-render every minute so "in 2h 15m" decays correctly.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!schedule) return null;

  const start = new Date(schedule.startTime);
  const end   = new Date(schedule.endTime);
  const startMs = start.getTime();

  const isToday = new Date(now).toDateString() === start.toDateString();

  const weekday = start.toLocaleDateString('en', { weekday: 'short' });   // "Tue"
  const day     = start.getDate();
  const timeStr = `${pad(start.getHours())}:${pad(start.getMinutes())} → ${pad(end.getHours())}:${pad(end.getMinutes())}`;
  const countdown = formatCountdown(startMs, now);

  const cls = schedule.classId;
  const classCode  = cls?.classCode  ?? '—';
  const courseName = cls?.courseName ?? '';
  const room       = schedule.room || cls?.room || '';

  const handleAdd = () => {
    downloadICS({
      id: schedule._id,
      title: courseName ? `${classCode} · ${courseName}` : classCode,
      description: [
        teacher?.name && `Teacher: ${teacher.name}`,
        room && `Room: ${room}`,
      ].filter(Boolean).join('\n'),
      location: room,
      start, end,
    });
  };

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 bg-card border border-border rounded-lg p-4',
        'border-l-[3px] border-l-primary',
        className,
      )}
    >
      {/* Weekday / date pill */}
      <div className="text-center bg-primary-tint rounded-md px-3 py-1.5 shrink-0">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-primary leading-none">
          {weekday}
        </div>
        <div className="text-h2 font-bold text-primary leading-none tabular-nums mt-1">
          {day}
        </div>
      </div>

      {/* Info column */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground truncate">
            Next: {classCode}
            {courseName && <span className="text-muted-foreground"> · {courseName}</span>}
          </span>
          {isToday && (
            <span className="text-[10px] font-bold text-primary bg-primary/15 px-1.5 py-0.5 rounded uppercase tracking-wide">
              Today
            </span>
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {teacher?.name && (
            <span className="inline-flex items-center gap-1">
              <User className="size-3" aria-hidden="true" />
              {teacher.name}
            </span>
          )}
          {room && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" aria-hidden="true" />
              {room}
            </span>
          )}
        </div>

        <div className="mt-1 flex items-center gap-1.5 text-xs text-foreground font-mono tabular-nums">
          <Clock className="size-3 text-subtle-foreground" aria-hidden="true" />
          <span>{timeStr}</span>
          <span className="text-subtle-foreground">·</span>
          <span className="font-medium font-sans">{countdown}</span>
        </div>
      </div>

      {/* Add to calendar */}
      <button
        type="button"
        onClick={handleAdd}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors underline-offset-2 hover:underline"
      >
        <CalendarPlus className="size-3.5" aria-hidden="true" />
        Add to calendar
      </button>
    </div>
  );
}

function pad(n) { return String(n).padStart(2, '0'); }
