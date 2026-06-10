import { useSearchParams } from 'react-router-dom';
import { CalendarCheck, ClipboardList, CalendarPlus } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '../context/AuthContext';
import SchedulesPage from '../features/schedule/SchedulesPage';
import AttendancePage from '../features/attendance/AttendancePage';
import BookClassPage from '../features/schedule/BookClassPage';

// ──────────────────────────────────────────────────────────
// CalendarPage — Phase 2 IA-S3
// Route: /calendar
//
// Unified calendar surface. Tabs shown depend on role:
//   Admin    → Schedules + Attendance
//   Teacher  → Attendance
//   Leader/Participant → Book
//
// Each tab delegates to the existing page component so no
// business logic needs to move here yet. The shared CalendarGrid
// primitive (Phase 1 §10) is already used inside each page.
// ──────────────────────────────────────────────────────────

const TABS_BY_ROLE = {
  Admin: [
    { id: 'schedules',  label: 'Schedules',  icon: CalendarCheck,  description: 'Create and manage all weekly sessions.' },
    { id: 'attendance', label: 'Attendance', icon: ClipboardList,  description: 'Mark and review session attendance.' },
  ],
  Teacher: [
    { id: 'attendance', label: 'Attendance', icon: ClipboardList,  description: 'Mark and review session attendance.' },
  ],
  Participant: [
    { id: 'book', label: 'Book',        icon: CalendarPlus,   description: 'View available sessions and book your slot.' },
  ],
  Leader: [
    { id: 'book', label: 'Book',        icon: CalendarPlus,   description: 'View available sessions and book for your team.' },
  ],
};

const DEFAULT_TAB = {
  Admin:       'schedules',
  Teacher:     'attendance',
  Participant: 'book',
  Leader:      'book',
};

export default function CalendarPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabs = TABS_BY_ROLE[user?.role] ?? TABS_BY_ROLE.Participant;
  const activeTab = searchParams.get('tab') ?? DEFAULT_TAB[user?.role] ?? tabs[0]?.id;
  const current   = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  const setTab = (tabId) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tabId);
    setSearchParams(next, { replace: true });
  };

  if (!tabs.length) return null;

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
      <Tabs value={activeTab} onValueChange={setTab} className="space-y-6">
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
          <TabsContent key={t.id} value={t.id} hidden={activeTab !== t.id}>
            {activeTab === t.id && <TabContent id={t.id} />}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function TabContent({ id }) {
  if (id === 'schedules')  return <SchedulesPage />;
  if (id === 'attendance') return <AttendancePage />;
  if (id === 'book')       return <BookClassPage />;
  return null;
}
