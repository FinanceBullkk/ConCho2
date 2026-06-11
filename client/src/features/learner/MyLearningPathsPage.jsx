import { Route } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import TableSkeleton from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { useLearningPaths, usePathProgress } from '../../hooks/useLearning';
import PathProgressView from '../../features/learning/PathProgressView';

// One card per path: fetches the learner's progress for that path and renders it.
function PathProgressCard({ path }) {
  const { data, isLoading } = usePathProgress(path._id);
  return (
    <PathProgressView
      title={path.title}
      code={path.code}
      progress={data?.data}
      loading={isLoading}
    />
  );
}

export default function MyLearningPathsPage() {
  const { data, isLoading } = useLearningPaths({ status: 'active' });
  const paths = data?.data || [];

  let body;
  if (isLoading) {
    body = <TableSkeleton rows={3} cols={2} />;
  } else if (!paths.length) {
    body = (
      <EmptyState
        icon={Route}
        title="No learning paths yet"
        description="Sequenced learning paths will appear here once an admin creates them."
      />
    );
  } else {
    body = (
      <div className="grid gap-4 md:grid-cols-2">
        {paths.map((path) => (
          <PathProgressCard key={path._id} path={path} />
        ))}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="My Learning Paths"
        description="Track your progress through sequenced curricula."
      />
      {body}
    </div>
  );
}
