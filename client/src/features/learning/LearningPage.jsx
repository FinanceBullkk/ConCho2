import { Fragment } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen, Boxes, ClipboardList, GraduationCap, MessageSquare, Route } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/PageHeader';
import { useRole } from '../../hooks/useRole';
import ProgramsTab from './ProgramsTab';
import CohortsTab from './CohortsTab';
import PathsTab from './PathsTab';
import AssignmentsTab from './AssignmentsTab';
import AssessmentsTab from './AssessmentsTab';
import FeedbackTab from './FeedbackTab';

// IA cleanup 2026-06-13: the Dashboard + Reports tabs moved OUT to /reports
// (all reporting now lives in one section). The remaining six tabs are grouped
// into two clusters so the strip reads as a workflow instead of a flat row:
//   • catalog  — define what training exists (Programs · Cohorts · Paths)
//   • delivery — run it for learners (Assignments · Assessments · Feedback)
// `perm` (optional) gates a tab to roles holding that permission.
const TABS = [
  { id: 'programs',    icon: BookOpen,      group: 'catalog' },
  { id: 'cohorts',     icon: Boxes,         group: 'catalog' },
  { id: 'paths',       icon: Route,         group: 'catalog',  perm: 'manage:path' },
  { id: 'assignments', icon: ClipboardList, group: 'delivery', perm: 'read:assignments' },
  { id: 'assessments', icon: GraduationCap, group: 'delivery' },
  { id: 'feedback',    icon: MessageSquare, group: 'delivery', perm: 'read:feedback' },
];

const GROUP_ORDER = ['catalog', 'delivery'];

export default function LearningPage() {
  const { t } = useTranslation();
  const { can } = useRole();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabs = TABS.filter((tab) => !tab.perm || can(tab.perm));
  const requested = searchParams.get('tab') ?? 'programs';
  // Fall back to the first visible tab if the URL points at a hidden one.
  const activeTab = tabs.some((tab) => tab.id === requested) ? requested : tabs[0].id;
  const current = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  // Group the visible tabs into clusters (skip empty clusters so a role that
  // can't see any delivery tab gets no dangling divider/label).
  const clusters = GROUP_ORDER
    .map((group) => ({ group, items: tabs.filter((tab) => tab.group === group) }))
    .filter((c) => c.items.length > 0);

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
            {clusters.map((cluster, ci) => (
              <Fragment key={cluster.group}>
                {ci > 0 && <span className="mx-1.5 h-5 w-px bg-border" aria-hidden="true" />}
                <span className="px-2 text-overline text-subtle-foreground select-none whitespace-nowrap" aria-hidden="true">
                  {t(`learning.groups.${cluster.group}`)}
                </span>
                {cluster.items.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <TabsTrigger key={tab.id} value={tab.id} className="gap-2">
                      <Icon className="size-4" aria-hidden="true" />
                      {t(`learning.tabs.${tab.id}`)}
                    </TabsTrigger>
                  );
                })}
              </Fragment>
            ))}
          </TabsList>
        </div>
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
      </Tabs>
    </div>
  );
}
