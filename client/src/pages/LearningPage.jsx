import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BarChart3, BookOpen, Boxes, ClipboardList, GraduationCap, MessageSquare, Route, Users } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import { useRole } from '../hooks/useRole';
import ProgramsTab from './learning/ProgramsTab';
import CohortsTab from './learning/CohortsTab';
import PathsTab from './learning/PathsTab';
import AssignmentsTab from './learning/AssignmentsTab';
import AssessmentsTab from './learning/AssessmentsTab';
import FeedbackTab from './learning/FeedbackTab';
import ReportsTab from './learning/ReportsTab';

// `perm` (optional) gates a tab to roles holding that permission.
const TABS = [
  { id: 'programs', icon: BookOpen },
  { id: 'cohorts', icon: Boxes },
  { id: 'paths', icon: Route, perm: 'manage:path' },
  { id: 'assignments', icon: ClipboardList, perm: 'read:assignments' },
  { id: 'groups', icon: Users },
  { id: 'assessments', icon: GraduationCap },
  { id: 'feedback', icon: MessageSquare, perm: 'read:feedback' },
  { id: 'reports', icon: BarChart3, perm: 'read:reports' },
];

function CompatibilityTab({ type }) {
  const { t } = useTranslation();
  const isGroups = type === 'groups';
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(`learning.tabs.${type}`)}</CardTitle>
      </CardHeader>
      <CardContent className="text-body text-muted-foreground">
        {t(isGroups ? 'learning.tabs.groupsDesc' : 'learning.tabs.assessmentsDesc')}
      </CardContent>
    </Card>
  );
}

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
        <TabsList>
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
        <TabsContent value="programs" hidden={activeTab !== 'programs'}>
          {activeTab === 'programs' && <ProgramsTab />}
        </TabsContent>
        <TabsContent value="cohorts" hidden={activeTab !== 'cohorts'}>
          {activeTab === 'cohorts' && <CohortsTab />}
        </TabsContent>
        <TabsContent value="paths" hidden={activeTab !== 'paths'}>
          {activeTab === 'paths' && <PathsTab />}
        </TabsContent>
        <TabsContent value="assignments" hidden={activeTab !== 'assignments'}>
          {activeTab === 'assignments' && <AssignmentsTab />}
        </TabsContent>
        <TabsContent value="groups" hidden={activeTab !== 'groups'}>
          {activeTab === 'groups' && <CompatibilityTab type="groups" />}
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
