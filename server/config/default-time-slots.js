// Approved English scheduling windows in Vietnam wall-clock time.
// Runtime remains Admin-configurable through ALLOWED_TIME_SLOTS; this constant
// is the canonical seed/test baseline for a fresh environment.
const DEFAULT_TIME_SLOTS = [
  { sh: 9, sm: 0, eh: 10, em: 0, label: '09:00-10:00' },
  { sh: 10, sm: 0, eh: 11, em: 0, label: '10:00-11:00' },
  { sh: 13, sm: 0, eh: 14, em: 0, label: '13:00-14:00' },
  { sh: 14, sm: 0, eh: 15, em: 0, label: '14:00-15:00' },
  { sh: 15, sm: 0, eh: 16, em: 0, label: '15:00-16:00' },
];

module.exports = DEFAULT_TIME_SLOTS;
