import { useSearchParams } from 'react-router-dom';
import { Users, UsersRound } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageHeader } from '@/components/PageHeader';
import UsersPage from './UsersPage';
import TeamsPage from './TeamsPage';

// ──────────────────────────────────────────────────────────
// PeoplePage — Phase 2 IA-S2
// Route: /people  (Admin only)
// Tabs: Users · Teams
// Replaces the old /academy?tab=users and /academy?tab=teams.
// ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'users', label: 'Users', icon: Users,     description: 'All employees registered in the system.' },
  { id: 'teams', label: 'Teams', icon: UsersRound, description: 'Cohorts grouped under a Team Leader.' },
];

export default function PeoplePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') ?? 'users';
  const current   = TABS.find((t) => t.id === activeTab) ?? TABS[0];

  const setTab = (tabId) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tabId);
    setSearchParams(next, { replace: true });
  };

  return (
    <div>
      <PageHeader title="People" description={current.description} />
      <Tabs value={activeTab} onValueChange={setTab} className="space-y-6">
        <TabsList>
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <TabsTrigger key={t.id} value={t.id} className="gap-2">
                <Icon className="size-4" aria-hidden="true" />
                {t.label}
              </TabsTrigger>
            );
          })}
        </TabsList>
        <TabsContent value="users" hidden={activeTab !== 'users'}>
          {activeTab === 'users' && <UsersPage />}
        </TabsContent>
        <TabsContent value="teams" hidden={activeTab !== 'teams'}>
          {activeTab === 'teams' && <TeamsPage />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
