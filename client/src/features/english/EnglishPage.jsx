import { useSearchParams, Link } from 'react-router-dom';
import { CalendarPlus, GraduationCap } from 'lucide-react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '../../context/AuthContext';
import { useMyTeams } from '../../hooks/useTeams';
import BookClassPage from '../schedule/BookClassPage';

// ──────────────────────────────────────────────────────────
// EnglishPage — the leader booking surface (converge Phase 4 end state)
// Route: /english
//
// Convergence Phase 4 folded every English admin surface into a unified one —
// 'classes' → Learning → Cohorts; 'attendance' + 'schedules' → the unified
// English Operations workspace; 'evaluations' → the Grading workspace
// (/grading); 'teams' → People (/people?tab=teams). What remains here is just
// the LEADER BOOKING GRID, so this page is now learner-persona-only:
//   Leader/Participant → Team booking, ONLY when they belong to a Team
//     (otherwise a pointer panel to their generic learning surfaces — Cohesion P4).
//   Admin/Teacher/Coordinator → nothing here (their English work moved to the
//     unified surfaces above); they reach those from the Admin Console nav.
// ──────────────────────────────────────────────────────────

const TABS_BY_ROLE = {
  Participant: [
    { id: 'book', label: 'Team booking', icon: CalendarPlus, description: 'View available sessions and book your slot.' },
  ],
  Leader: [
    { id: 'book', label: 'Team booking', icon: CalendarPlus, description: 'View available sessions and book for your team.' },
  ],
};

const DEFAULT_TAB = {
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
  if (id === 'book') return <BookClassPage />;
  return null;
}
