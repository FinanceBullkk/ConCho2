import { useMemo, useState } from 'react';
import { BookOpen, CheckCircle2, Filter, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/PageHeader';
import TableSkeleton from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import {
  useEnrollLearner,
  useLearningCohorts,
  useLearningEnrollments,
  useLearningPrograms,
} from '../hooks/useLearning';

const CATEGORY_LABELS = {
  english: 'English',
  onboarding: 'Onboarding',
  compliance: 'Compliance',
  soft_skills: 'Soft skills',
  technical: 'Technical',
  workshop: 'Workshop',
  other: 'Other',
};

const searchable = (program, cohort) => [
  program.name,
  program.code,
  program.description,
  CATEGORY_LABELS[program.category],
  cohort?.cohortCode,
].filter(Boolean).join(' ').toLowerCase();

export default function MyLearningCatalogPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const enroll = useEnrollLearner();
  const { data: programData, isLoading: loadingPrograms } = useLearningPrograms({ status: 'active' });
  const { data: cohortData, isLoading: loadingCohorts } = useLearningCohorts({ status: 'Ongoing' });
  const { data: enrollmentData, isLoading: loadingEnrollments } = useLearningEnrollments();

  const enrolledCohortIds = useMemo(() => new Set(
    (enrollmentData?.data || [])
      .filter((row) => row.status !== 'Dropped')
      .map((row) => String(row.cohortId)),
  ), [enrollmentData]);

  const cohortsByProgram = useMemo(() => {
    const map = new Map();
    (cohortData?.data || []).forEach((cohort) => {
      if (!cohort.programId) return;
      const key = String(cohort.programId);
      map.set(key, [...(map.get(key) || []), cohort]);
    });
    return map;
  }, [cohortData]);

  const catalogRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (programData?.data || [])
      .filter((program) => program.schedulingMode === 'self_enroll')
      .filter((program) => category === 'all' || program.category === category)
      .flatMap((program) => (cohortsByProgram.get(String(program._id)) || [])
        .map((cohort) => ({ program, cohort })))
      .filter(({ program, cohort }) => !q || searchable(program, cohort).includes(q));
  }, [category, cohortsByProgram, programData, query]);

  const handleEnroll = async (cohort) => {
    try {
      await enroll.mutateAsync({ cohortId: cohort._id });
      toast.success('Enrollment submitted');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not enroll');
    }
  };

  const loading = loadingPrograms || loadingCohorts || loadingEnrollments;

  let body;
  if (loading) {
    body = <TableSkeleton rows={4} cols={3} />;
  } else if (!catalogRows.length) {
    body = (
      <EmptyState
        icon={BookOpen}
        title="No self-enroll programs"
        description="Try a different search, or check back when new cohorts open."
      />
    );
  } else {
    body = (
      <div className="grid gap-4 md:grid-cols-2">
        {catalogRows.map(({ program, cohort }) => {
          const enrolled = enrolledCohortIds.has(String(cohort._id));
          return (
            <Card key={`${program._id}:${cohort._id}`} className="rounded-lg">
              <CardHeader className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{program.name}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {program.code} · {cohort.cohortCode || cohort.classCode}
                    </p>
                  </div>
                  <Badge variant="secondary">{CATEGORY_LABELS[program.category] || program.category}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {program.description && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{program.description}</p>
                )}
                <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                  <span>{program.deliveryMode}</span>
                  <span>{cohort.bookedSessions || 0}/{cohort.totalSessions || program.defaultSessionCount} sessions</span>
                  <span>{cohort.status}</span>
                </div>
                <Button
                  className="w-full"
                  disabled={enrolled || enroll.isPending}
                  onClick={() => handleEnroll(cohort)}
                >
                  {enrolled ? (
                    <><CheckCircle2 className="mr-1.5 size-4" aria-hidden="true" />Enrolled</>
                  ) : 'Enroll'}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Learning Catalog" description="Browse open programs and self-enroll in available cohorts." />
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_220px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search programs"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search programs"
          />
        </div>
        <div className="relative">
          <Filter className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <select
            aria-label="Filter by category"
            className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">All categories</option>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>
      {body}
    </div>
  );
}
