const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

// Excel stores these legacy cells as timezone-free wall-clock values. ExcelJS
// exposes the clock components in a Date whose ISO value looks UTC, so 10:00 VN
// arrives as 10:00Z. Convert that encoded wall clock into the real UTC instant
// expected by the shared scheduling grid (10:00 VN -> 03:00Z).
export function englishArchiveWallClockToInstant(value) {
  const encoded = new Date(value);
  if (Number.isNaN(encoded.getTime())) return null;
  return new Date(encoded.getTime() - VIETNAM_OFFSET_MS);
}

export function formatEnglishArchiveDateTime(value) {
  const instant = englishArchiveWallClockToInstant(value);
  return instant?.toLocaleString(undefined, { timeZone: 'Asia/Ho_Chi_Minh' }) || null;
}
