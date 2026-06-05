import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Users, UsersRound, Building2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageHeader } from '@/components/PageHeader';
import UsersPage from './UsersPage';
import TeamsPage from './TeamsPage';
import DepartmentsPage from './DepartmentsPage';

// ──────────────────────────────────────────────────────────
// PeoplePage — Phase 2 IA-S2
// Route: /people  (Admin only)
// Tabs: Users · Teams · Departments
// Replaces the old /academy?tab=users and /academy?tab=teams.
// ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'users', icon: Users },
  { id: 'teams', icon: UsersRound },
  { id: 'departments', icon: Building2 },
];

export default function PeoplePage() {
  const { t } = useTranslation();
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
      <PageHeader title={t('people.title')} description={t(`people.tabs.${current.id}Desc`)} />
      <Tabs value={activeTab} onValueChange={setTab} className="space-y-6">
        <TabsList>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger key={tab.id} value={tab.id} className="gap-2">
                <Icon className="size-4" aria-hidden="true" />
                {t(`people.tabs.${tab.id}`)}
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
        <TabsContent value="departments" hidden={activeTab !== 'departments'}>
          {activeTab === 'departments' && <DepartmentsPage />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
