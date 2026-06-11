import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import TableSkeleton from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { useLearningCohorts, useLearningFeedback } from '../../hooks/useLearning';

const ratingText = (value) => (value ? `${value}/5` : '-');

export default function FeedbackTab() {
  const [cohortId, setCohortId] = useState('');
  const { data: cohortData } = useLearningCohorts();
  const cohorts = cohortData?.data || [];
  const { data, isLoading } = useLearningFeedback(cohortId ? { cohortId } : {});
  const feedback = data?.data || [];

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <CardTitle>Feedback</CardTitle>
      <Select value={cohortId || 'all'} onValueChange={(v) => setCohortId(v === 'all' ? '' : v)}>
        <SelectTrigger className="w-[240px]" aria-label="Cohort">
          <SelectValue placeholder="All cohorts" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All cohorts</SelectItem>
          {cohorts.map((c) => (
            <SelectItem key={c._id} value={c._id}>{c.cohortCode} - {c.programName}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  let body;
  if (isLoading) {
    body = <TableSkeleton rows={6} cols={6} />;
  } else if (!feedback.length) {
    body = (
      <EmptyState
        icon={MessageSquare}
        title="No feedback yet"
        description={cohortId ? 'This cohort has no feedback submissions yet.' : 'Learner feedback submissions will appear here.'}
      />
    );
  } else {
    body = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Learner</TableHead>
            <TableHead>Cohort</TableHead>
            <TableHead className="text-right">Overall</TableHead>
            <TableHead className="text-right">Content</TableHead>
            <TableHead className="text-right">Instructor</TableHead>
            <TableHead>Comment</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {feedback.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <div className="font-medium">{row.learner?.name || '-'}</div>
                <div className="text-xs text-muted-foreground">{row.learner?.empCode || ''}</div>
              </TableCell>
              <TableCell>{row.cohortCode || '-'}</TableCell>
              <TableCell className="text-right"><Badge variant="info">{ratingText(row.rating)}</Badge></TableCell>
              <TableCell className="text-right">{ratingText(row.contentRating)}</TableCell>
              <TableCell className="text-right">{ratingText(row.instructorRating)}</TableCell>
              <TableCell className="max-w-[280px] truncate">{row.comment || '-'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <Card>
      <CardHeader>{header}</CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
