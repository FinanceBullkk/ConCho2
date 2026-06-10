import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import TableSkeleton from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { useQuestionBank } from '../../hooks/useAssessment';

export default function QuestionBankImportPicker({ selectedIds, onChange }) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuestionBank();
  const items = data?.data || [];
  const selected = new Set(selectedIds);

  const toggle = (id, checked) => {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    onChange([...next]);
  };

  if (isLoading) return <TableSkeleton rows={3} cols={3} />;
  if (!items.length) {
    return (
      <EmptyState
        title={t('learning.assessments.bankEmpty')}
        description={t('learning.assessments.bankEmptyDesc')}
      />
    );
  }

  return (
    <div className="rounded-md border border-border divide-y divide-border max-h-56 overflow-y-auto">
      {items.map((item) => (
        <label key={item.id} className="flex items-start gap-3 p-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={selected.has(item.id)}
            onChange={(e) => toggle(item.id, e.target.checked)}
            aria-label={item.prompt}
          />
          <span className="min-w-0 flex-1">
            <span className="block font-medium leading-snug">{item.prompt}</span>
            <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">{t(`learning.assessments.types.${item.type}`)}</Badge>
              <span>{item.points} {t('learning.assessments.points')}</span>
              {item.tags?.map((tag) => <span key={tag}>#{tag}</span>)}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}
