import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BarChart3, BookOpen, Boxes, ClipboardList, GraduationCap, LayoutDashboard, MessageSquare, Route } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/PageHeader';
import { useRole } from '../../hooks/useRole';
import ProgramsTab from './ProgramsTab';
import CohortsTab from './CohortsTab';
import PathsTab from './PathsTab';
import AssignmentsTab from './AssignmentsTab';
import AssessmentsTab from './AssessmentsTab';
import FeedbackTab from './FeedbackTab';
import ReportsTab from './ReportsTab';
import DashboardTab from './DashboardTab';

// `perm` (optional) gates a tab to roles holding that permission.
// English-class separation 2026-06-12: the `groups` compat tab is gone
// (Teams live in /english?tab=teams) and Cohorts is cohort-world only —
// English/team-mode classes live in /english?tab=classes.
const TABS = [
  { id: 'dashboard', icon: LayoutDashboard, perm: 'read:reports' },
  { id: 'programs', icon: BookOpen },
  { id: 'cohorts', icon: Boxes },
  { id: 'paths', icon: Route, perm: 'manage:path' },
  { id: 'assignments', icon: ClipboardList, perm: 'read:assignments' },
  { id: 'assessments', icon: GraduationCap },
  { id: 'feedback', icon: MessageSquare, perm: 'read:feedback' },
  { id: 'reports', icon: BarChart3, perm: 'read:reports' },
];

export default function LearningPage() {
  const { t } = useTranslation();
  const { can } = useRole();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabs = TABS.filter((tab) => !tab.perm || can(tab.perm));
  const requested = searchParams.get('tab') ?? 'programs';
  // Fall back to the first visible tab if the URL points at a hidden one.
  const activeTab = tabs.some((tab) => tab.id === requested) ? requested : tabs[0].id;
  const current = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  const setTab = (tabId) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tabId);
    setSearchParams(next, { replace: true });
  };

  return (
    <div>
      <PageHeader title={t('learning.title')} description={t(`learning.tabs.${current.id}Desc`)} />
      <Tabs value={activeTab} onValueChange={setTab} className="space-y-6">
        <div className="max-w-full overflow-x-auto pb-1">
          <TabsList className="w-max min-w-full justify-start">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger key={tab.id} value={tab.id} className="gap-2">
                  <Icon className="size-4" aria-hidden="true" />
                  {t(`learning.tabs.${tab.id}`)}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>
        <TabsContent value="dashboard" hidden={activeTab !== 'dashboard'}>
          {activeTab === 'dashboard' && <DashboardTab />}
        </TabsContent>
        <TabsContent value="programs" hidden={activeTab !== 'programs'}>
          {activeTab === 'programs' && <ProgramsTab />}
        </TabsContent>
        <TabsContent value="cohorts" hidden={activeTab !== 'cohorts'}>
          {activeTab === 'cohorts' && <CohortsTab mode="cohort" />}
        </TabsContent>
        <TabsContent value="paths" hidden={activeTab !== 'paths'}>
          {activeTab === 'paths' && <PathsTab />}
        </TabsContent>
        <TabsContent value="assignments" hidden={activeTab !== 'assignments'}>
          {activeTab === 'assignments' && <AssignmentsTab />}
        </TabsContent>
        <TabsContent value="assessments" hidden={activeTab !== 'assessments'}>
          {activeTab === 'assessments' && <AssessmentsTab />}
        </TabsContent>
        <TabsContent value="feedback" hidden={activeTab !== 'feedback'}>
          {activeTab === 'feedback' && <FeedbackTab />}
        </TabsContent>
        <TabsContent value="reports" hidden={activeTab !== 'reports'}>
          {activeTab === 'reports' && <ReportsTab />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
