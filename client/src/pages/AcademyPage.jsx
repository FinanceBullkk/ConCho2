import { useSearchParams } from 'react-router-dom';
import { Users, UsersRound, BookOpen, Library } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageHeader } from '@/components/PageHeader';
import UsersPage from './UsersPage';
import TeamsPage from './TeamsPage';
import ClassesPage from './ClassesPage';
import CourseManager from './CourseManager';

// ──────────────────────────────────────────────────────────
// Academy — section shell for Users, Teams, Classes, Courses.
// Tab state is URL-driven (`?tab=users`) so deep links and the
// back button work as expected.
// ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'users', label: 'Users', icon: Users, description: 'All employees registered in the system.' },
  { id: 'teams', label: 'Teams', icon: UsersRound, description: 'Cohorts grouped under a Team Leader.' },
  { id: 'classes', label: 'Classes', icon: BookOpen, description: 'Class instances per course.' },
  { id: 'courses', label: 'Courses', icon: Library, description: 'Catalog of available courses.' },
];

export default function AcademyPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') ?? 'users';
  const current = TABS.find((t) => t.id === activeTab) ?? TABS[0];

  const setTab = (tabId) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tabId);
    setSearchParams(next, { replace: true });
  };

  return (
    <div>
      <PageHeader title="Academy" description={current.description} />
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
        <TabsContent value="users" forceMount={activeTab === 'users' ? true : undefined} hidden={activeTab !== 'users'}>
          {activeTab === 'users' && <UsersPage />}
        </TabsContent>
        <TabsContent value="teams" hidden={activeTab !== 'teams'}>
          {activeTab === 'teams' && <TeamsPage />}
        </TabsContent>
        <TabsContent value="classes" hidden={activeTab !== 'classes'}>
          {activeTab === 'classes' && <ClassesPage />}
        </TabsContent>
        <TabsContent value="courses" hidden={activeTab !== 'courses'}>
          {activeTab === 'courses' && <CourseManager />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
