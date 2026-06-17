// Shared constants for the Users feature (page + UserModal + columns + admin modal).
// Per Screen 5 §E (Users variant):
//   facets: status · role · BU · level    bulk: change status · change role · export · delete
export const ROLES         = ['Admin', 'Coordinator', 'Teacher', 'Participant'];
export const STATUSES      = ['Active', 'Inactive', 'Dropped', 'Transferred', 'On-hold', 'Waiting for class'];
export const STATUS_CHIPS  = ['Active', 'Inactive', 'On-hold'];   // primary axis per design
export const PAGE_SIZE     = 50;
export const BULK_TYPE_CONFIRM_THRESHOLD = 5;   // §D rule 10

// Shared input class for the user forms (UserModal + admin-action modal).
export const INPUT_CLS =
  'w-full px-3 h-(--control-h) rounded-md bg-background border border-input text-foreground placeholder:text-subtle-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-40 transition-colors duration-(--dur-fast)';
