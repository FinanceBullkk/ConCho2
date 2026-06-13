// Shape an email NotificationLog row into an in-app feed item (Cohesion P5).
// Title/link are derived from `type`; body is enriched from `metadata` when
// present, with safe fallbacks (metadata may be sparse on older rows).

const fmtDate = (d) => {
  if (!d) return '';
  const iso = typeof d === 'string' ? d : new Date(d).toISOString();
  return iso.slice(0, 10); // YYYY-MM-DD
};

// type → { title, link, body(metadata) }. Links point at existing learner/
// manager surfaces (the same destinations the emails deep-link to).
const PRESENTERS = {
  assignment_due_soon: {
    title: 'Assignment due soon',
    link: '/home',
    body: (m) => {
      const name = m.assignmentTitle || m.targetName || 'A required training';
      const due = m.dueDate ? ` — due ${fmtDate(m.dueDate)}` : '';
      return `${name}${due}`;
    },
  },
  assignment_overdue: {
    title: 'Assignment overdue',
    link: '/home',
    body: (m) => {
      const name = m.assignmentTitle || m.targetName || 'A required training';
      const over = m.daysOverdue ? ` — ${m.daysOverdue} day(s) overdue` : ' is overdue';
      return `${name}${over}`;
    },
  },
  manager_assignment_digest: {
    title: 'Team training overdue',
    link: '/my-team',
    body: (m) => {
      const n = m.learnerCount || 0;
      return `${n} of your report(s) have overdue training`;
    },
  },
  waitlist_promoted: {
    title: 'Enrolled from the waitlist',
    link: '/me/sessions',
    body: () => 'A seat opened in a session you were waiting for — you are now enrolled',
  },
};

const FALLBACK = { title: 'Notification', link: '/home', body: () => '' };

const toFeedItem = (row) => {
  const p = PRESENTERS[row.type] || FALLBACK;
  const metadata = row.metadata || {};
  return {
    id: String(row._id),
    type: row.type,
    title: p.title,
    body: p.body(metadata),
    link: p.link,
    createdAt: row.createdAt,
    readAt: row.readAt || null,
    isRead: Boolean(row.readAt),
  };
};

module.exports = { toFeedItem };
