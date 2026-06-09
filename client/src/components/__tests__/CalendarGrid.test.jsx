import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CalendarGrid, toDateKey } from '../CalendarGrid';

// ──────────────────────────────────────────────────────────
// CalendarGrid descriptor contract (Wave E1 client slice)
// ──────────────────────────────────────────────────────────
// Locks the post-migration contract shared by Book/Schedules/Attendance:
//   - rows are slot DESCRIPTORS (not integer hours)
//   - the sticky time column shows slot.label
//   - renderCell is invoked as (day: Date, slot: descriptor)
//   - row key / cell key derive from the exact HH:mm-HH:mm slot id
// ──────────────────────────────────────────────────────────

const mkWeek = () => {
  const monday = new Date(2026, 5, 8); // Mon 8 Jun 2026 (local)
  return Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * 86400000));
};

const pad = (n) => String(n).padStart(2, '0');
const slot = (sh, sm, eh, em) => {
  const id = `${pad(sh)}:${pad(sm)}-${pad(eh)}:${pad(em)}`;
  return { id, label: id, startHour: sh, startMinute: sm, endHour: eh, endMinute: em, durationMinutes: (eh * 60 + em) - (sh * 60 + sm) };
};

const noop = () => {};

describe('CalendarGrid (descriptor contract)', () => {
  it('renders one row per descriptor by label and calls renderCell with (day, slot)', () => {
    const rows = [slot(10, 0, 11, 0), slot(13, 30, 15, 0)];
    const renderCell = vi.fn((day, s) => <span>{`cell:${s.id}:${toDateKey(day)}`}</span>);

    render(
      <CalendarGrid weekDays={mkWeek()} rows={rows} renderCell={renderCell}
        onPrev={noop} onNext={noop} onToday={noop} weekLabel="week" />,
    );

    // Sticky time labels come from slot.label (incl. a non-60-min minute-offset window).
    expect(screen.getAllByText('10:00-11:00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('13:30-15:00').length).toBeGreaterThanOrEqual(1);

    // renderCell receives descriptor OBJECTS, never integer hours.
    const slotArgs = renderCell.mock.calls.map((c) => c[1]);
    expect(slotArgs.length).toBeGreaterThan(0);
    expect(slotArgs.every((s) => s && typeof s === 'object' && typeof s.id === 'string')).toBe(true);

    // 7 days × 2 rows.
    expect(renderCell).toHaveBeenCalledTimes(14);

    // Exact cell content keyed by exact slot id + day proves the (day, slot) wiring.
    const mondayKey = toDateKey(mkWeek()[0]);
    expect(screen.getByText(`cell:13:30-15:00:${mondayKey}`)).toBeInTheDocument();
  });

  it('shows the empty state when there are no rows (fail-closed / no slots)', () => {
    render(
      <CalendarGrid weekDays={mkWeek()} rows={[]} renderCell={() => null}
        onPrev={noop} onNext={noop} onToday={noop} weekLabel="week" />,
    );
    expect(screen.getByText('No sessions this week')).toBeInTheDocument();
  });
});
