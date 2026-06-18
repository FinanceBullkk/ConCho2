import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { PageHeader } from '@/components/PageHeader';
import { useRole } from '../../hooks/useRole';
import ProgramsTab from './ProgramsTab';
import CohortsTab from './CohortsTab';
import PathsTab from './PathsTab';
import AssignmentsTab from './AssignmentsTab';
import AssessmentsTab from './AssessmentsTab';
import FeedbackTab from './FeedbackTab';

// IA Phase 03 (2026-06-13): the six Learning tabs are now sidebar sub-items
// (Learning group), so the in-page tab strip is gone — this page just renders
// the body for the section selected via `?tab=`. `perm` gates a tab to roles
// holding it (used to pick the fallback when the URL points at a hidden one).
const TABS = [
  { id: 'programs' },
  { id: 'cohorts' },
  { id: 'paths', perm: 'manage:path' },
  { id: 'assignments', perm: 'read:assignments' },
  { id: 'assessments' },
  { id: 'feedback', perm: 'read:feedback' },
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
        <TabsContent value="programs" hidden={activeTab !== 'programs'}>
          {activeTab === 'programs' && <ProgramsTab />}
        </TabsContent>
        <TabsContent value="cohorts" hidden={activeTab !== 'cohorts'}>
          {activeTab === 'cohorts' && <CohortsTab mode="all" />}
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
      </Tabs>
    </div>
  );
}
