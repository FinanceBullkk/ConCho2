import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen, Boxes, GraduationCap, Users } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import ProgramsTab from './learning/ProgramsTab';
import CohortsTab from './learning/CohortsTab';

const TABS = [
  { id: 'programs', icon: BookOpen },
  { id: 'cohorts', icon: Boxes },
  { id: 'groups', icon: Users },
  { id: 'assessments', icon: GraduationCap },
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
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') ?? 'programs';
  const current = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];

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
          {TABS.map((tab) => {
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
        <TabsContent value="groups" hidden={activeTab !== 'groups'}>
          {activeTab === 'groups' && <CompatibilityTab type="groups" />}
        </TabsContent>
        <TabsContent value="assessments" hidden={activeTab !== 'assessments'}>
          {activeTab === 'assessments' && <CompatibilityTab type="assessments" />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
