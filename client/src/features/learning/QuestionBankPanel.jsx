import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import TableSkeleton from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { useArchiveQuestionBankItem, useQuestionBank } from '../../hooks/useAssessment';
import QuestionBankFormModal from './QuestionBankFormModal';

export default function QuestionBankPanel() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuestionBank();
  const items = data?.data || [];
  const archiveMutation = useArchiveQuestionBankItem();
  const [open, setOpen] = useState(false);
  const [confirmArchiveId, setConfirmArchiveId] = useState('');

  const archive = async (id) => {
    if (confirmArchiveId !== id) {
      setConfirmArchiveId(id);
      return;
    }
    await archiveMutation.mutateAsync(id);
    setConfirmArchiveId('');
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>{t('learning.assessments.bankTitle')}</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              <Plus className="size-4 mr-1.5" aria-hidden="true" />
              {t('learning.assessments.bankNew')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton rows={4} cols={3} />
          ) : !items.length ? (
            <EmptyState title={t('learning.assessments.bankEmpty')} description={t('learning.assessments.bankEmptyDesc')} />
          ) : (
            <div className="divide-y divide-border rounded-md border border-border">
              {items.slice(0, 6).map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <div className="font-medium leading-snug">{item.prompt}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">{t(`learning.assessments.types.${item.type}`)}</Badge>
                      <span>{item.points} {t('learning.assessments.points')}</span>
                      {item.tags?.map((tag) => <span key={tag}>#{tag}</span>)}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" disabled={archiveMutation.isPending} onClick={() => archive(item.id)}>
                    <Archive className="size-4 mr-1.5" aria-hidden="true" />
                    {confirmArchiveId === item.id ? t('learning.assessments.archiveConfirm') : t('learning.programs.archive')}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {open && <QuestionBankFormModal onClose={() => setOpen(false)} />}
    </>
  );
}
