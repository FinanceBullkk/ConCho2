import { Home, BookOpen, CalendarDays, Languages, FileBarChart, Users, ShieldCog } from 'lucide-react';

// ──────────────────────────────────────────────────────────
// nav-config — single source of truth for the app's primary navigation
// (IA rework 2026-06-13: top horizontal bar → left sidebar).
//
// Each item carries a per-role `access` map: 'full' | 'read' | 'none'.
//   • 'full'/'read' → visible link (the page enforces read-only itself).
//   • 'none'/absent → HIDDEN in the sidebar (enterprise pattern: users only see
//     what they can act on — Docebo/SAP/TalentLMS). This intentionally replaces
//     the old "disabled tooltip" affordance from the top-bar era.
// `parentRoutes` drives active-state highlighting when a deeper route is open.
//
// Groups with no visible item for the current role are not rendered. The
// first group (overview) has no label → Home sits alone at the top.
// ──────────────────────────────────────────────────────────

export const NAV_GROUPS = [
  {
    id: 'overview',
    items: [
      { path: '/home', labelKey: 'nav.home', icon: Home,
        access: { Admin: 'full', Coordinator: 'full', Teacher: 'full', Participant: 'full' },
        parentRoutes: ['/home', '/dashboard'] },
    ],
  },
  {
    id: 'training', labelKey: 'nav.groups.training',
    items: [
      { path: '/learning', labelKey: 'nav.learning', icon: BookOpen,
        access: { Admin: 'full', Coordinator: 'full', Teacher: 'read', Participant: 'none' },
        parentRoutes: ['/learning', '/programs', '/courses'] },
      { path: '/calendar', labelKey: 'nav.calendar', icon: CalendarDays,
        access: { Admin: 'full', Coordinator: 'none', Teacher: 'full', Participant: 'none' },
        parentRoutes: ['/calendar', '/operations', '/schedules', '/attendance'] },
      { path: '/english', labelKey: 'nav.english', icon: Languages,
        access: { Admin: 'full', Coordinator: 'none', Teacher: 'full', Participant: 'full' },
        parentRoutes: ['/english', '/book', '/classes', '/teams'] },
    ],
  },
  {
    id: 'insights', labelKey: 'nav.groups.insights',
    items: [
      { path: '/reports', labelKey: 'nav.reports', icon: FileBarChart,
        access: { Admin: 'full', Coordinator: 'full', Teacher: 'full', Participant: 'none' },
        parentRoutes: ['/reports', '/data'] },
    ],
  },
  {
    id: 'manage', labelKey: 'nav.groups.manage',
    items: [
      { path: '/people', labelKey: 'nav.people', icon: Users,
        access: { Admin: 'full', Coordinator: 'full', Teacher: 'none', Participant: 'none' },
        parentRoutes: ['/people', '/users'] },
      { path: '/system', labelKey: 'nav.system', icon: ShieldCog,
        access: { Admin: 'full', Coordinator: 'none', Teacher: 'none', Participant: 'none' },
        parentRoutes: ['/system', '/admin', '/settings', '/database'] },
    ],
  },
];

// Injected at runtime only when the user has direct reports (keeps the sidebar
// uncluttered for the ~majority who aren't managers).
export const MY_TEAM_ITEM = {
  path: '/my-team', labelKey: 'nav.myTeam', icon: Users,
  access: { Admin: 'full', Coordinator: 'full', Teacher: 'full', Participant: 'full' },
  parentRoutes: ['/my-team'],
};

export function itemAccess(item, role) {
  return item.access?.[role] ?? 'none';
}

export function isRouteActive(item, pathname) {
  const prefixes = item.parentRoutes || [item.path];
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'));
}
