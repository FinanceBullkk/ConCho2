import { useSearchParams, Link } from 'react-router-dom';
import { CalendarCheck, ClipboardList, CalendarPlus, GraduationCap } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '../context/AuthContext';
import { useMyTeams } from '../hooks/useTeams';
import SchedulesPage from '../features/schedule/SchedulesPage';
import AttendancePage from '../features/attendance/AttendancePage';
import BookClassPage from '../features/schedule/BookClassPage';

// ──────────────────────────────────────────────────────────
// CalendarPage — Phase 2 IA-S3 · membership gating Cohesion Wave P4
// Route: /calendar
//
// Unified calendar surface. Tabs shown depend on role:
//   Admin    → Schedules + Attendance
//   Teacher  → Attendance
//   Leader/Participant → Team booking, ONLY when they belong to a Team
//     (team-booking is one scheduling mode — the legacy English-class flow —
//     not the platform's face; a learner enrolled only in cohort-mode
//     programs gets pointed to their generic home instead: /me/sessions).
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
    { id: 'book', label: 'Team booking', icon: CalendarPlus, description: 'View available sessions and book your slot.' },
  ],
  Leader: [
    { id: 'book', label: 'Team booking', icon: CalendarPlus, description: 'View available sessions and book for your team.' },
  ],
};

const DEFAULT_TAB = {
  Admin:       'schedules',
  Teacher:     'attendance',
  Participant: 'book',
  Leader:      'book',
};

// Shown to a Participant with NO team: their learning lives in the generic
// /me/* surfaces, not the team-booking grid.
function NoTeamBookingPanel() {
  return (
    <div className="bg-card border border-border rounded-lg p-10 text-center space-y-3">
      <GraduationCap className="size-8 mx-auto text-muted-foreground" aria-hidden="true" />
      <h2 className="text-h3 text-foreground">No team-booking class</h2>
      <p className="text-muted-foreground">
        Team booking is used by group-based classes. Your sessions and
        programs live in your learning space.
      </p>
      <div className="flex items-center justify-center gap-4 pt-1">
        <Link to="/me/sessions" className="text-sm text-primary font-medium hover:underline underline-offset-2">
          My sessions →
        </Link>
        <Link to="/me/catalog" className="text-sm text-primary font-medium hover:underline underline-offset-2">
          Browse catalog →
        </Link>
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const isParticipant = user?.role === 'Participant' || user?.role === 'Leader';
  // Membership signal — only fetched for participant-shaped roles; staff
  // tabs never depend on it.
  const { data: myTeams = [], isLoading: loadingTeams } = useMyTeams({ enabled: isParticipant });
  const hasTeam = myTeams.length > 0;

  const tabs = TABS_BY_ROLE[user?.role] ?? TABS_BY_ROLE.Participant;
  const activeTab = searchParams.get('tab') ?? DEFAULT_TAB[user?.role] ?? tabs[0]?.id;
  const current   = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  const setTab = (tabId) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tabId);
    setSearchParams(next, { replace: true });
  };

  if (!tabs.length) return null;

  // Participant without a Team: the booking grid is the wrong world —
  // point them at their generic learning surfaces instead (Cohesion P4).
  if (isParticipant && !loadingTeams && !hasTeam) {
    return (
      <div>
        <PageHeader title="Calendar" description="Your sessions and programs." />
        <NoTeamBookingPanel />
      </div>
    );
  }

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
