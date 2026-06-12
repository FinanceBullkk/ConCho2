import { useSearchParams, Navigate } from 'react-router-dom';
import { CalendarCheck, ClipboardList } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '../context/AuthContext';
import SchedulesPage from '../features/schedule/SchedulesPage';
import AttendancePage from '../features/attendance/AttendancePage';

// ──────────────────────────────────────────────────────────
// CalendarPage — Phase 2 IA-S3 · English-class separation 2026-06-12
// Route: /calendar
//
// GENERIC training calendar — cohort world only (self_enroll/nomination).
// The English-class (team-booking) world has its own section at /english:
// schedules, attendance, and the leader booking grid all live there now.
// Participants have no calendar surface left — they are redirected to
// /english (team members get the booking grid; others a pointer panel).
//
// Tabs shown depend on role:
//   Admin    → Schedules + Attendance
//   Teacher  → Attendance
// ──────────────────────────────────────────────────────────

const TABS_BY_ROLE = {
  Admin: [
    { id: 'schedules',  label: 'Schedules',  icon: CalendarCheck,  description: 'Create and manage training sessions.' },
    { id: 'attendance', label: 'Attendance', icon: ClipboardList,  description: 'Mark and review session attendance.' },
  ],
  Teacher: [
    { id: 'attendance', label: 'Attendance', icon: ClipboardList,  description: 'Mark and review session attendance.' },
  ],
};

const DEFAULT_TAB = {
  Admin:   'schedules',
  Teacher: 'attendance',
};

export default function CalendarPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabs = TABS_BY_ROLE[user?.role] ?? [];
  const activeTab = searchParams.get('tab') ?? DEFAULT_TAB[user?.role] ?? tabs[0]?.id;
  const current   = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  const setTab = (tabId) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tabId);
    setSearchParams(next, { replace: true });
  };

  // Participant/Leader (or any role without calendar tabs): their world is
  // the English-class section or the /me/* learner surfaces.
  if (!tabs.length) return <Navigate to="/english" replace />;

  // Single-tab roles: skip the tab chrome entirely
  if (tabs.length === 1) {
    return (
      <div>
        <PageHeader title="Calendar" description={tabs[0].description} />
        <TabContent id={tabs[0].id} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Calendar" description={current?.description} />
      <Tabs value={current?.id} onValueChange={setTab} className="space-y-6">
        <TabsList>
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <TabsTrigger key={t.id} value={t.id} className="gap-2">
                <Icon className="size-4" aria-hidden="true" />
                {t.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {tabs.map((t) => (
          <TabsContent key={t.id} value={t.id} hidden={current?.id !== t.id}>
            {current?.id === t.id && <TabContent id={t.id} />}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function TabContent({ id }) {
  if (id === 'schedules')  return <SchedulesPage mode="cohort" />;
  if (id === 'attendance') return <AttendancePage mode="cohort" />;
  return null;
}
