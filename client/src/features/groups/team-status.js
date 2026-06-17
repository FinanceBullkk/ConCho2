// Derive a team's status from its assigned class. Shared by the page, card and
// table columns so the active/completed logic lives in one place.
export const teamStatus = (t) => {
  if (!t.classId) return 'no-class';
  if (t.classId.status === 'Completed') return 'completed';
  return 'active'; // Ongoing or any other status
};
