import { useSearchParams, Link } from 'react-router-dom';
import { BookA, UsersRound, CalendarCheck, ClipboardList, ClipboardEdit, CalendarPlus, GraduationCap } from 'lucide-react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '../../context/AuthContext';
import { useMyTeams } from '../../hooks/useTeams';
import CohortsTab from '../learning/CohortsTab';
import TeamsPage from '../groups/TeamsPage';
import SchedulesPage from '../schedule/SchedulesPage';
import AttendancePage from '../attendance/AttendancePage';
import EvaluationPage from '../evaluations/EvaluationPage';
import BookClassPage from '../schedule/BookClassPage';

// ──────────────────────────────────────────────────────────
// EnglishPage — English-class separation (owner decision 2026-06-12)
// Route: /english
//
// The ENTIRE legacy English-class (team-booking) business lives here, fully
// separated from the generic Training/Learning surfaces: classes, teams,
// schedules, attendance and evaluations — all scoped to the team world
// (reads via /api/english/*; mutations keep their existing mode-gated APIs).
//
// Tabs shown depend on role:
//   Admin    → Classes + Teams + Schedules + Attendance + Evaluations
//   Teacher  → Attendance + Evaluations
//   Leader/Participant → Team booking, ONLY when they belong to a Team
//     (otherwise a pointer panel to their generic learning surfaces —
//     moved here from CalendarPage, Cohesion P4).
//   Coordinator → none (cohort-world role; nav item is disabled)
// ──────────────────────────────────────────────────────────

const TABS_BY_ROLE = {
  Admin: [
    { id: 'classes',     label: 'Classes',      icon: BookA,         description: 'Manage English classes (team-booking world).' },
    { id: 'teams',       label: 'Teams',        icon: UsersRound,    description: 'Manage learning groups and their leaders.' },
    { id: 'schedules',   label: 'Schedules',    icon: CalendarCheck, description: 'Create and manage English-class sessions.' },
    { id: 'attendance',  label: 'Attendance',   icon: ClipboardList, description: 'Mark and review English-class attendance.' },
    { id: 'evaluations', label: 'Evaluations',  icon: ClipboardEdit, description: 'Enter and review learner evaluation scores.' },
  ],
  Teacher: [
    { id: 'attendance',  label: 'Attendance',   icon: ClipboardList, description: 'Mark and review English-class attendance.' },
    { id: 'evaluations', label: 'Evaluations',  icon: ClipboardEdit, description: 'Enter and review learner evaluation scores.' },
  ],
  Participant: [
    { id: 'book', label: 'Team booking', icon: CalendarPlus, description: 'View available sessions and book your slot.' },
  ],
  Leader: [
    { id: 'book', label: 'Team booking', icon: CalendarPlus, description: 'View available sessions and book for your team.' },
  ],
};

const DEFAULT_TAB = {
  Admin:       'classes',
  Teacher:     'attendance',
  Participant: 'book',
  Leader:      'book',
};

// Shown to a Participant with NO team: their learning lives in the generic
// /me/* surfaces, not the English-class world (Cohesion P4, relocated here).
function NoTeamPanel() {
  return (
    <div className="bg-card border border-border rounded-lg p-10 text-center space-y-3">
      <GraduationCap className="size-8 mx-auto text-muted-foreground" aria-hidden="true" />
      <h2 className="text-h3 text-foreground">No English class</h2>
      <p className="text-muted-foreground">
        This section is for group-based English classes. Your sessions and
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

export default function EnglishPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const isParticipant = user?.role === 'Participant' || user?.role === 'Leader';
  // Membership signal — only fetched for participant-shaped roles; staff
  // tabs never depend on it.
  const { data: myTeams = [], isLoading: loadingTeams } = useMyTeams({ enabled: isParticipant });
  const hasTeam = myTeams.length > 0;

  const tabs = TABS_BY_ROLE[user?.role] ?? [];
  const activeTab = searchParams.get('tab') ?? DEFAULT_TAB[user?.role] ?? tabs[0]?.id;
  const current   = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  const setTab = (tabId) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tabId);
    setSearchParams(next, { replace: true });
  };

  // Coordinator (or unknown role) — nothing to show here.
  if (!tabs.length) {
    return <PageHeader title="English Class" description="This section is not available for your role." />;
  }

  // Participant without a Team: pointer panel instead of the booking grid.
  if (isParticipant && !loadingTeams && !hasTeam) {
    return (
      <div>
        <PageHeader title="English Class" description="Group-based English classes." />
        <NoTeamPanel />
      </div>
    );
  }

  // Single-tab roles: skip the tab chrome entirely
  if (tabs.length === 1) {
    return (
      <div>
        <PageHeader title="English Class" description={tabs[0].description} />
        <TabContent id={tabs[0].id} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="English Class" description={current?.description} />
      {/* IA Phase 03: tab strip removed — the sidebar's English Class group drives ?tab=. */}
      <Tabs value={current?.id} onValueChange={setTab} className="space-y-6">
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
  if (id === 'classes')     return <CohortsTab mode="team" titleKey="english.classesTitle" />;
  if (id === 'teams')       return <TeamsPage />;
  if (id === 'schedules')   return <SchedulesPage mode="team" />;
  if (id === 'attendance')  return <AttendancePage mode="team" />;
  if (id === 'evaluations') return <EvaluationPage />;
  if (id === 'book')        return <BookClassPage />;
  return null;
}
