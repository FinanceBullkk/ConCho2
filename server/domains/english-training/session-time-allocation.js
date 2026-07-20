// Deterministic repair for imported English Archive session timestamps.
//
// The workbook dates remain the starting point. Each date keeps at most one
// class in each approved one-hour slot; overflow is moved to the nearest
// weekday with free capacity. This module is pure so preview/apply use exactly
// the same allocation and the rules can be regression-tested without a DB.

const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (value) => String(value).padStart(2, '0');
const slotStartMinutes = (slot) => slot.sh * 60 + slot.sm;
const slotDurationMinutes = (slot) => (slot.eh * 60 + slot.em) - slotStartMinutes(slot);

function asIso(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid Archive session timestamp: ${value}`);
  return date.toISOString();
}

function sourceDate(value) {
  return asIso(value).slice(0, 10);
}

function sourceMinutes(value) {
  const date = new Date(asIso(value));
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function dateAtSlot(date, slot, end = false) {
  const hour = end ? slot.eh : slot.sh;
  const minute = end ? slot.em : slot.sm;
  return `${date}T${pad(hour)}:${pad(minute)}:00.000Z`;
}

function shiftDate(date, days) {
  const shifted = new Date(`${date}T00:00:00.000Z`).getTime() + days * DAY_MS;
  return new Date(shifted).toISOString().slice(0, 10);
}

function isWeekday(date) {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day >= 1 && day <= 5;
}

const identity = (row) => String(row.naturalKey || row.id);
const compareSessions = (a, b) => (
  identity(a).localeCompare(identity(b), 'en')
  || String(a.id).localeCompare(String(b.id), 'en')
);

function assertInputs(sessions, slots) {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    throw new Error('Archive session allocation requires at least one session');
  }
  if (!Array.isArray(slots) || slots.length === 0) {
    throw new Error('Archive session allocation requires approved time slots');
  }
  const labels = new Set();
  for (const slot of slots) {
    if (slotDurationMinutes(slot) !== 60) throw new Error(`Archive slot must be one hour: ${slot.label}`);
    if (labels.has(slot.label)) throw new Error(`Duplicate Archive slot label: ${slot.label}`);
    labels.add(slot.label);
  }
  const ids = new Set();
  const keys = new Set();
  for (const row of sessions) {
    if (!row.id || !row.naturalKey || !row.classCode || !row.courseRunKey) {
      throw new Error('Archive session allocation requires id, naturalKey, classCode, and courseRunKey');
    }
    if (!Number.isInteger(Number(row.sessionNumber)) || Number(row.sessionNumber) < 1) {
      throw new Error(`Invalid Archive session number: ${row.sessionNumber}`);
    }
    asIso(row.heldAt);
    if (ids.has(String(row.id))) throw new Error(`Duplicate Archive session id: ${row.id}`);
    if (keys.has(String(row.naturalKey))) throw new Error(`Duplicate Archive natural key: ${row.naturalKey}`);
    ids.add(String(row.id));
    keys.add(String(row.naturalKey));
  }
}

function combinations(rows, size) {
  const result = [];
  const visit = (start, chosen) => {
    if (chosen.length === size) {
      result.push(chosen);
      return;
    }
    for (let index = start; index <= rows.length - (size - chosen.length); index += 1) {
      visit(index + 1, [...chosen, rows[index]]);
    }
  };
  visit(0, []);
  return result;
}

function bestSlotAssignment(rows, slots) {
  const ordered = [...rows].sort(compareSessions);
  let best = null;
  const visit = (index, used, chosen, cost) => {
    if (index === ordered.length) {
      const signature = chosen.map((item) => pad(item.slotIndex)).join('|');
      if (!best || cost < best.cost || (cost === best.cost && signature < best.signature)) {
        best = { cost, signature, chosen: [...chosen] };
      }
      return;
    }
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      if (used.has(slotIndex)) continue;
      const slot = slots[slotIndex];
      const nextCost = cost + Math.abs(sourceMinutes(ordered[index].heldAt) - slotStartMinutes(slot));
      if (best && nextCost > best.cost) continue;
      used.add(slotIndex);
      chosen.push({ row: ordered[index], slot, slotIndex });
      visit(index + 1, used, chosen, nextCost);
      chosen.pop();
      used.delete(slotIndex);
    }
  };
  visit(0, new Set(), [], 0);
  return best;
}

function chooseSessionsToKeep(rows, slots) {
  const ordered = [...rows].sort(compareSessions);
  const keepCount = Math.min(slots.length, new Set(ordered.map((row) => row.classCode)).size);
  let best = null;
  for (const candidate of combinations(ordered, keepCount)) {
    if (new Set(candidate.map((row) => row.classCode)).size !== candidate.length) continue;
    const slotPlan = bestSlotAssignment(candidate, slots);
    const signature = candidate.map(identity).sort().join('|');
    if (!best || slotPlan.cost < best.cost || (slotPlan.cost === best.cost && signature < best.signature)) {
      best = { rows: candidate, cost: slotPlan.cost, signature };
    }
  }
  if (!best) throw new Error('Could not choose a valid Archive session subset');
  const kept = new Set(best.rows.map((row) => String(row.id)));
  return {
    kept: best.rows,
    overflow: ordered.filter((row) => !kept.has(String(row.id))),
  };
}

function nearestAvailableDate(row, occupiedByDate, slotCount) {
  const originalDate = sourceDate(row.heldAt);
  for (let distance = 1; distance <= 3660; distance += 1) {
    // Prefer a future date when past/future are equally distant.
    for (const direction of [1, -1]) {
      const candidate = shiftDate(originalDate, distance * direction);
      if (!isWeekday(candidate)) continue;
      const assigned = occupiedByDate.get(candidate) || [];
      if (assigned.length >= slotCount) continue;
      if (assigned.some((item) => item.classCode === row.classCode)) continue;
      return candidate;
    }
  }
  throw new Error(`Could not place Archive session ${identity(row)} within ten years`);
}

function allocationRow(row, date, slot) {
  const originalHeldAt = asIso(row.heldAt);
  const assignedStartAt = dateAtSlot(date, slot);
  return {
    id: String(row.id),
    naturalKey: String(row.naturalKey),
    classCode: String(row.classCode),
    courseRunKey: String(row.courseRunKey),
    sessionNumber: Number(row.sessionNumber),
    originalHeldAt,
    originalDate: sourceDate(originalHeldAt),
    assignedDate: date,
    assignedStartAt,
    assignedEndAt: dateAtSlot(date, slot, true),
    slotLabel: slot.label,
    movedDate: sourceDate(originalHeldAt) !== date,
    changedTime: originalHeldAt !== assignedStartAt,
  };
}

function validateArchiveSessionAllocation(assignments, slots) {
  const errors = [];
  const slotByLabel = new Map(slots.map((slot) => [slot.label, slot]));
  const occupied = new Set();
  const classDates = new Set();
  for (const row of assignments) {
    const slot = slotByLabel.get(row.slotLabel);
    if (!slot) errors.push(`off_policy_slot:${row.naturalKey}:${row.slotLabel}`);
    else {
      if (slotDurationMinutes(slot) !== 60) errors.push(`non_hour_slot:${row.naturalKey}`);
      if (row.assignedStartAt !== dateAtSlot(row.assignedDate, slot)) {
        errors.push(`slot_start_mismatch:${row.naturalKey}`);
      }
      if (row.assignedEndAt !== dateAtSlot(row.assignedDate, slot, true)) {
        errors.push(`slot_end_mismatch:${row.naturalKey}`);
      }
    }
    const occupiedKey = `${row.assignedDate}|${row.slotLabel}`;
    if (occupied.has(occupiedKey)) errors.push(`overlap:${occupiedKey}`);
    occupied.add(occupiedKey);
    const classDateKey = `${row.assignedDate}|${row.classCode}`;
    if (classDates.has(classDateKey)) errors.push(`class_twice_in_day:${classDateKey}`);
    classDates.add(classDateKey);
  }

  const byRun = new Map();
  for (const row of assignments) {
    if (!byRun.has(row.courseRunKey)) byRun.set(row.courseRunKey, []);
    byRun.get(row.courseRunKey).push(row);
  }
  for (const [runKey, rows] of byRun) {
    const ordered = [...rows].sort((a, b) => a.sessionNumber - b.sessionNumber || compareSessions(a, b));
    for (let index = 1; index < ordered.length; index += 1) {
      if (ordered[index].assignedStartAt <= ordered[index - 1].assignedStartAt) {
        errors.push(`run_sequence:${runKey}:${ordered[index - 1].sessionNumber}->${ordered[index].sessionNumber}`);
      }
    }
  }
  return errors;
}

function allocateArchiveSessionTimes(sessions, { slots } = {}) {
  assertInputs(sessions, slots);
  const sourceGroups = new Map();
  for (const row of sessions) {
    const date = sourceDate(row.heldAt);
    if (!sourceGroups.has(date)) sourceGroups.set(date, []);
    sourceGroups.get(date).push(row);
  }

  const assignedByDate = new Map();
  const overflow = [];
  let overcrowdedSourceDays = 0;
  for (const [date, rows] of [...sourceGroups].sort(([a], [b]) => a.localeCompare(b))) {
    const selected = chooseSessionsToKeep(rows, slots);
    assignedByDate.set(date, [...selected.kept]);
    overflow.push(...selected.overflow);
    if (selected.overflow.length) overcrowdedSourceDays += 1;
  }

  overflow.sort((a, b) => (
    sourceDate(a.heldAt).localeCompare(sourceDate(b.heldAt))
    || compareSessions(a, b)
  ));
  for (const row of overflow) {
    const assignedDate = nearestAvailableDate(row, assignedByDate, slots.length);
    if (!assignedByDate.has(assignedDate)) assignedByDate.set(assignedDate, []);
    assignedByDate.get(assignedDate).push(row);
  }

  const assignments = [];
  for (const [date, rows] of [...assignedByDate].sort(([a], [b]) => a.localeCompare(b))) {
    const slotPlan = bestSlotAssignment(rows, slots);
    assignments.push(...slotPlan.chosen.map(({ row, slot }) => allocationRow(row, date, slot)));
  }
  assignments.sort((a, b) => compareSessions(a, b));

  const errors = validateArchiveSessionAllocation(assignments, slots);
  if (errors.length) {
    throw new Error(`Archive allocation invariant failed: ${errors.slice(0, 10).join(', ')}`);
  }

  const assignedDates = assignments.map((row) => row.assignedDate).sort();
  return {
    assignments,
    summary: {
      total: assignments.length,
      sourceDays: sourceGroups.size,
      assignedDays: new Set(assignedDates).size,
      overcrowdedSourceDays,
      movedDates: assignments.filter((row) => row.movedDate).length,
      changedTimes: assignments.filter((row) => row.changedTime).length,
      unchanged: assignments.filter((row) => !row.changedTime).length,
      firstAssignedDate: assignedDates[0],
      lastAssignedDate: assignedDates[assignedDates.length - 1],
    },
  };
}

module.exports = {
  allocateArchiveSessionTimes,
  validateArchiveSessionAllocation,
  sourceDate,
  sourceMinutes,
};
