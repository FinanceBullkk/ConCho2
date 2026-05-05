import { useSearchParams } from 'react-router-dom';
import { CalendarDays, ClipboardCheck, ChartLine } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/context/AuthContext';
import SchedulesPage from './SchedulesPage';
import BookClassPage from './BookClassPage';
import AttendancePage from './AttendancePage';
import AttendanceDashboardPage from './AttendanceDashboardPage';

// ──────────────────────────────────────────────────────────
// Operations — section shell for Schedules + Attendance + Analytics.
// Schedules tab adapts to role (Participants see booking calendar).
// ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'schedules', label: 'Schedules', icon: CalendarDays, description: 'Weekly calendar of all sessions.' },
  { id: 'attendance', label: 'Attendance', icon: ClipboardCheck, description: 'Mark attendance per session.' },
  { id: 'analytics', label: 'Analytics', icon: ChartLine, description: 'Attendance rates by employee, team, class.' },
];

export default function OperationsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') ?? 'schedules';
  const current = TABS.find((t) => t.id === activeTab) ?? TABS[0];

  const setTab = (tabId) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tabId);
    setSearchParams(next, { replace: true });
  };

  const ScheduleView = user?.role === 'Participant' ? BookClassPage : SchedulesPage;

  return (
    <div>
      <PageHeader title="Operations" description={current.description} />
      <Tabs value={activeTab} onValueChange={setTab} className="space-y-6">
        <TabsList>
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <TabsTrigger key={t.id} value={t.id} className="gap-2">
                <Icon className="size-4" />
                {t.label}
              </TabsTrigger>
            );
          })}
        </TabsList>
        <TabsContent value="schedules" hidden={activeTab !== 'schedules'}>
          {activeTab === 'schedules' && <ScheduleView />}
        </TabsContent>
        <TabsContent value="attendance" hidden={activeTab !== 'attendance'}>
          {activeTab === 'attendance' && <AttendancePage />}
        </TabsContent>
        <TabsContent value="analytics" hidden={activeTab !== 'analytics'}>
          {activeTab === 'analytics' && <AttendanceDashboardPage />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
