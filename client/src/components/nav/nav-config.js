import {
  Home, Users, BookOpen, Boxes, Route as RouteIcon, ClipboardList, GraduationCap, MessageSquare,
  CalendarCheck, ClipboardCheck, BookA, UsersRound, ClipboardEdit,
  LayoutDashboard, BarChart3, ChartLine, Download,
  Building2, MapPin, DoorOpen, Settings, Database, RefreshCw, ShieldCheck, ScrollText,
  Compass, Languages, FileText, Zap, Sparkles, Palette, Calculator, Smartphone, CalendarClock,
} from 'lucide-react';

// ──────────────────────────────────────────────────────────
// nav-config — single source of truth for the app's primary navigation.
// (IA rework 2026-06-13: top bar → left sidebar; Phase 03: section tabs are now
// sidebar SUB-ITEMS, so the umbrella pages dropped their in-page tab strips.)
//
// Item visibility (sidebar shows only what you can act on — enterprise pattern):
//   • `access`: per-role 'full'|'read'|'none' map. 'none'/absent → hidden.
//   • `perm`  : an additional capability check (useRole `can`). Both must pass.
// Active-state:
//   • tab item — `base` + `tab`: active when on `base` and `?tab=` matches (or it
//     is the first VISIBLE item of the section when no `?tab=` is present).
//   • leaf item — `parentRoutes`: active when the current path matches a prefix.
// Labelled groups are collapsible; groups with no visible item don't render.
// ──────────────────────────────────────────────────────────

const ALL = { Admin: 'full', Coordinator: 'full', Teacher: 'full', Participant: 'full' };
const ADMIN_ONLY = { Admin: 'full' };
const LEARNING_ACCESS = { Admin: 'full', Coordinator: 'full', Teacher: 'read', Participant: 'none' };

// `tab` helper — a section sub-item (deep link into an umbrella page).
const tab = (base, key, labelKey, icon, extra = {}) => ({
  path: `${base}?tab=${key}`, base, tab: key, labelKey, icon, ...extra,
});

export const NAV_GROUPS = [
  {
    id: 'overview',
    items: [
      { path: '/home', labelKey: 'nav.home', icon: Home, access: ALL, parentRoutes: ['/home', '/dashboard'] },
    ],
  },
  {
    id: 'learning', labelKey: 'nav.groups.learning',
    items: [
      tab('/learning', 'programs', 'learning.tabs.programs', BookOpen, { access: LEARNING_ACCESS }),
      tab('/learning', 'cohorts', 'learning.tabs.cohorts', Boxes, { access: LEARNING_ACCESS }),
      tab('/learning', 'paths', 'learning.tabs.paths', RouteIcon, { access: LEARNING_ACCESS, perm: 'manage:path' }),
      tab('/learning', 'assignments', 'learning.tabs.assignments', ClipboardList, { access: LEARNING_ACCESS, perm: 'read:assignments' }),
      tab('/learning', 'assessments', 'learning.tabs.assessments', GraduationCap, { access: LEARNING_ACCESS }),
      tab('/learning', 'feedback', 'learning.tabs.feedback', MessageSquare, { access: LEARNING_ACCESS, perm: 'read:feedback' }),
    ],
  },
  {
    id: 'operations', labelKey: 'nav.groups.operations',
    items: [
      tab('/calendar', 'schedules', 'nav.sections.schedules', CalendarCheck, { access: ADMIN_ONLY }),
      tab('/calendar', 'attendance', 'nav.sections.attendance', ClipboardCheck, { access: { Admin: 'full', Teacher: 'full' } }),
      { path: '/mobile-attendance', labelKey: 'nav.sections.mobileAttendance', icon: Smartphone, access: { Admin: 'full', Teacher: 'full' }, parentRoutes: ['/mobile-attendance'] },
    ],
  },
  {
    id: 'english', labelKey: 'nav.groups.english',
    items: [
      tab('/english', 'classes', 'nav.sections.classes', BookA, { access: ADMIN_ONLY }),
      tab('/english', 'teams', 'nav.sections.teams', UsersRound, { access: ADMIN_ONLY }),
      tab('/english', 'schedules', 'nav.sections.schedules', CalendarCheck, { access: ADMIN_ONLY }),
      tab('/english', 'attendance', 'nav.sections.attendance', ClipboardList, { access: { Admin: 'full', Teacher: 'full' } }),
      tab('/english', 'evaluations', 'nav.sections.evaluations', ClipboardEdit, { access: { Admin: 'full', Teacher: 'full' } }),
    ],
  },
  {
    id: 'reports', labelKey: 'nav.groups.reports',
    items: [
      tab('/reports', 'overview', 'nav.sections.overview', LayoutDashboard, { perm: 'read:dashboard' }),
      tab('/reports', 'learning', 'nav.sections.ldDashboard', BarChart3, { perm: 'read:reports' }),
      tab('/reports', 'completion', 'nav.sections.completion', ChartLine, { perm: 'read:reports' }),
      tab('/reports', 'hours', 'nav.sections.trainingHours', CalendarClock, { perm: 'read:reports' }),
      tab('/reports', 'analytics', 'nav.sections.attendanceAnalytics', ChartLine, { perm: 'read:attendance' }),
      tab('/reports', 'hr-export', 'nav.sections.hrExport', Download, { perm: 'export:data' }),
    ],
  },
  {
    id: 'people', labelKey: 'nav.groups.people',
    items: [
      tab('/people', 'users', 'people.tabs.users', Users, { perm: 'read:users' }),
      tab('/people', 'departments', 'people.tabs.departments', Building2, { perm: 'read:department' }),
      tab('/people', 'offices', 'people.tabs.offices', MapPin, { perm: 'read:office' }),
      tab('/people', 'rooms', 'people.tabs.rooms', DoorOpen, { perm: 'read:room' }),
    ],
  },
  {
    id: 'configure', labelKey: 'nav.groups.configure',
    items: [
      { path: '/access', labelKey: 'nav.sections.rolesAccess', icon: ShieldCheck, access: ADMIN_ONLY, parentRoutes: ['/access'] },
      { path: '/custom-fields', labelKey: 'nav.sections.customFields', icon: FileText, access: ADMIN_ONLY, parentRoutes: ['/custom-fields'] },
      { path: '/automation', labelKey: 'nav.sections.automation', icon: Zap, access: ADMIN_ONLY, parentRoutes: ['/automation'] },
      { path: '/skills', labelKey: 'nav.sections.skills', icon: Sparkles, access: ADMIN_ONLY, parentRoutes: ['/skills'] },
      { path: '/branding', labelKey: 'nav.sections.branding', icon: Palette, access: ADMIN_ONLY, parentRoutes: ['/branding'] },
      { path: '/scheduling', labelKey: 'nav.sections.scheduling', icon: CalendarClock, access: ADMIN_ONLY, parentRoutes: ['/scheduling'] },
      { path: '/compliance', labelKey: 'nav.sections.compliance', icon: ClipboardCheck, access: { Admin: 'full', Coordinator: 'full' }, parentRoutes: ['/compliance'] },
      { path: '/cost-roi', labelKey: 'nav.sections.costRoi', icon: Calculator, access: ADMIN_ONLY, parentRoutes: ['/cost-roi'] },
    ],
  },
  {
    id: 'system', labelKey: 'nav.groups.system',
    items: [
      tab('/system', 'settings', 'nav.sections.settings', Settings, { access: ADMIN_ONLY }),
      tab('/system', 'database', 'nav.sections.database', Database, { access: ADMIN_ONLY }),
      tab('/system', 'sync', 'nav.sections.sync', RefreshCw, { access: ADMIN_ONLY }),
      tab('/system', 'reconcile', 'nav.sections.reconcile', ShieldCheck, { access: ADMIN_ONLY }),
      tab('/system', 'audit', 'nav.sections.audit', ScrollText, { access: ADMIN_ONLY }),
    ],
  },
];

// ── Learner persona group-set (My Learning) ───────────────
// Surfaced when persona === 'learner' (always for Participants; staff via the
// switch). English Class carries its own access map so it shows for learners in
// the team-booking world and hides otherwise.
export const LEARNER_GROUPS = [
  {
    id: 'learner-overview',
    items: [
      { path: '/home', labelKey: 'nav.home', icon: Home, access: ALL, parentRoutes: ['/home', '/dashboard'] },
    ],
  },
  {
    id: 'learner-main', labelKey: 'nav.groups.myLearning',
    items: [
      { path: '/me/programs', labelKey: 'nav.learner.programs', icon: BookOpen, access: ALL, parentRoutes: ['/me/programs'] },
      { path: '/me/catalog', labelKey: 'nav.learner.catalog', icon: Compass, access: ALL, parentRoutes: ['/me/catalog'] },
      { path: '/me/sessions', labelKey: 'nav.learner.sessions', icon: CalendarCheck, access: ALL, parentRoutes: ['/me/sessions'] },
      { path: '/me/paths', labelKey: 'nav.learner.paths', icon: RouteIcon, access: ALL, parentRoutes: ['/me/paths'] },
      { path: '/me/assessments', labelKey: 'nav.learner.assessments', icon: GraduationCap, access: ALL, parentRoutes: ['/me/assessments'] },
      { path: '/me/feedback', labelKey: 'nav.learner.feedback', icon: MessageSquare, access: ALL, parentRoutes: ['/me/feedback'] },
      { path: '/me/transcript', labelKey: 'nav.learner.transcript', icon: ScrollText, access: ALL, parentRoutes: ['/me/transcript'] },
    ],
  },
  {
    id: 'learner-english',
    items: [
      { path: '/english', labelKey: 'nav.english', icon: Languages,
        access: { Admin: 'full', Coordinator: 'none', Teacher: 'full', Participant: 'full' },
        parentRoutes: ['/english', '/book', '/classes', '/teams'] },
    ],
  },
];

// Injected at runtime only when the user has direct reports.
export const MY_TEAM_ITEM = {
  path: '/my-team', labelKey: 'nav.myTeam', icon: Users, access: ALL, parentRoutes: ['/my-team'],
};

// ── Helpers ───────────────────────────────────────────────
export function isItemVisible(item, role, can) {
  if (item.access && (item.access[role] ?? 'none') === 'none') return false;
  if (item.perm && !(can && can(item.perm))) return false;
  return true;
}

// The labelKey of the nav item the current location resolves to — used by the
// Topbar breadcrumb (workspace › page). Mirrors the Sidebar's group assembly so
// the crumb always matches the highlighted sidebar item. Falls back to Home.
export function activeItemLabelKey({ role, can, pathname, tab, persona }) {
  if (pathname.startsWith('/my-team')) return MY_TEAM_ITEM.labelKey;
  const groups = persona === 'learner' ? LEARNER_GROUPS : NAV_GROUPS;
  for (const group of groups) {
    const items = group.items.filter((it) => isItemVisible(it, role, can));
    const activePath = groupActivePath(items, pathname, tab);
    if (activePath) {
      const item = items.find((it) => it.path === activePath);
      if (item) return item.labelKey;
    }
  }
  return 'nav.home';
}

// The active item's `path` within a group of VISIBLE items (or null). Tab groups
// share a base: match `?tab=`, else the first visible item (role-correct default).
export function groupActivePath(visibleItems, pathname, currentTab) {
  if (visibleItems.length === 0) return null;
  const first = visibleItems[0];
  if (first.tab !== undefined) {
    const base = first.base;
    const onBase = pathname === base || pathname.startsWith(base + '/');
    if (!onBase) return null;
    if (currentTab) {
      const match = visibleItems.find((it) => it.tab === currentTab);
      return match ? match.path : first.path;
    }
    return first.path;
  }
  const leaf = visibleItems.find((it) =>
    (it.parentRoutes || [it.path]).some((p) => pathname === p || pathname.startsWith(p + '/')));
  return leaf ? leaf.path : null;
}
