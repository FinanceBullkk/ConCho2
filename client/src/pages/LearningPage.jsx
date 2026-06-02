import { useSearchParams } from 'react-router-dom';
import { BookOpen, Boxes, GraduationCap, Users } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import TableSkeleton from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { useLearningCohorts, useLearningPrograms } from '../hooks/useLearning';

const TABS = [
  { id: 'programs', label: 'Programs', icon: BookOpen, description: 'Training catalog for English, onboarding, compliance, and internal learning.' },
  { id: 'cohorts', label: 'Cohorts', icon: Boxes, description: 'Program runs that replace the old class-centric view.' },
  { id: 'groups', label: 'Groups', icon: Users, description: 'Learning groups and team leaders remain managed through existing Teams for now.' },
  { id: 'assessments', label: 'Assessments', icon: GraduationCap, description: 'Evaluation workflows remain compatible while assessment is generalized.' },
];

const statusTone = {
  active: 'default',
  inactive: 'secondary',
  archived: 'outline',
  Ongoing: 'default',
  Completed: 'secondary',
};

function ProgramsTab() {
  const { data, isLoading } = useLearningPrograms({ status: 'active' });
  const programs = data?.data || [];

  if (isLoading) return <TableSkeleton rows={6} cols={5} />;
  if (!programs.length) {
    return <EmptyState title="No learning programs" description="Create programs through the new Learning API or run the backfill script for legacy English courses." />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Program Catalog</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Program</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Scheduling</TableHead>
              <TableHead>Delivery</TableHead>
              <TableHead className="text-right">Sessions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {programs.map((program) => (
              <TableRow key={program._id}>
                <TableCell>
                  <div className="font-medium text-foreground">{program.name}</div>
                  <div className="text-small text-muted-foreground">{program.code}</div>
                </TableCell>
                <TableCell>
                  <Badge variant={statusTone[program.status] || 'secondary'}>{program.category}</Badge>
                </TableCell>
                <TableCell>{program.schedulingMode}</TableCell>
                <TableCell>{program.deliveryMode}</TableCell>
                <TableCell className="text-right">{program.defaultSessionCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CohortsTab() {
  const { data, isLoading } = useLearningCohorts();
  const cohorts = data?.data || [];

  if (isLoading) return <TableSkeleton rows={6} cols={5} />;
  if (!cohorts.length) {
    return <EmptyState title="No cohorts" description="Cohorts are program runs. Existing classes appear here once linked to a learning program." />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cohorts</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cohort</TableHead>
              <TableHead>Program</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Sessions</TableHead>
              <TableHead className="text-right">Booked</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cohorts.map((cohort) => (
              <TableRow key={cohort._id}>
                <TableCell className="font-medium">{cohort.cohortCode}</TableCell>
                <TableCell>{cohort.programName}</TableCell>
                <TableCell>
                  <Badge variant={statusTone[cohort.status] || 'secondary'}>{cohort.status}</Badge>
                </TableCell>
                <TableCell className="text-right">{cohort.totalSessions}</TableCell>
                <TableCell className="text-right">{cohort.bookedSessions}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CompatibilityTab({ type }) {
  const isGroups = type === 'groups';
  return (
    <Card>
      <CardHeader>
        <CardTitle>{isGroups ? 'Groups Compatibility' : 'Assessments Compatibility'}</CardTitle>
      </CardHeader>
      <CardContent className="text-body text-muted-foreground">
        {isGroups
          ? 'Learning groups still use the existing Teams module while the backend domain boundary is being introduced.'
          : 'Assessments still use the existing Evaluations module while the generic assessment model is planned.'}
      </CardContent>
    </Card>
  );
}

export default function LearningPage() {
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
      <PageHeader title="Learning" description={current.description} />
      <Tabs value={activeTab} onValueChange={setTab} className="space-y-6">
        <TabsList>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger key={tab.id} value={tab.id} className="gap-2">
                <Icon className="size-4" aria-hidden="true" />
                {tab.label}
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
