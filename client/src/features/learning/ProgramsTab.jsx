import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import TableSkeleton from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { useLearningPrograms } from '../../hooks/useLearning';
import { useRole } from '../../hooks/useRole';
import ProgramFormModal from './ProgramFormModal';
import ProgramDetailModal from './ProgramDetailModal';

const statusTone = { active: 'default', inactive: 'secondary', archived: 'outline' };

export default function ProgramsTab() {
  const { t } = useTranslation();
  const { can } = useRole();
  const canManage = can('create:program');
  const { data, isLoading } = useLearningPrograms({ status: 'active' });
  const programs = data?.data || [];

  // View-then-edit: any reader can open a program's read-only detail; managers
  // edit from there (or create via "New"). Detail and edit are separate states
  // so the Edit shortcut hands the program straight to the builder.
  const [detail, setDetail] = useState(null); // program being viewed | null
  const [edit, setEdit] = useState(null);     // { program } | { program: null } | null

  const header = (
    <div className="flex items-center justify-between">
      <CardTitle>{t('learning.programs.catalog')}</CardTitle>
      {canManage && (
        <Button size="sm" onClick={() => setEdit({ program: null })}>
          <Plus className="size-4 mr-1.5" aria-hidden="true" />{t('learning.programs.new')}
        </Button>
      )}
    </div>
  );

  let body;
  if (isLoading) {
    body = <TableSkeleton rows={6} cols={5} />;
  } else if (!programs.length) {
    body = (
      <Card>
        <CardHeader>{header}</CardHeader>
        <CardContent>
          <EmptyState title={t('learning.programs.empty')} description={t('learning.programs.emptyDesc')} />
        </CardContent>
      </Card>
    );
  } else {
    body = (
      <Card>
        <CardHeader>{header}</CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('learning.programs.colProgram')}</TableHead>
                <TableHead>{t('learning.programs.colCategory')}</TableHead>
                <TableHead>{t('learning.programs.colScheduling')}</TableHead>
                <TableHead>{t('learning.programs.colDelivery')}</TableHead>
                <TableHead className="text-right">{t('learning.programs.colSessions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {programs.map((program) => (
                <TableRow
                  key={program._id}
                  className="cursor-pointer"
                  onClick={() => setDetail(program)}
                >
                  <TableCell>
                    <div className="font-medium text-foreground">{program.name}</div>
                    <div className="text-small text-muted-foreground">{program.code}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusTone[program.status] || 'secondary'}>{t(`learning.category.${program.category}`, program.category)}</Badge>
                  </TableCell>
                  <TableCell>{t(`learning.scheduling.${program.schedulingMode}`, program.schedulingMode)}</TableCell>
                  <TableCell>{t(`learning.delivery.${program.deliveryMode}`, program.deliveryMode)}</TableCell>
                  <TableCell className="text-right">{program.defaultSessionCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {body}
      {detail && (
        <ProgramDetailModal
          program={detail}
          programs={programs}
          canManage={canManage}
          onEdit={() => { setEdit({ program: detail }); setDetail(null); }}
          onClose={() => setDetail(null)}
        />
      )}
      {edit && <ProgramFormModal program={edit.program} onClose={() => setEdit(null)} />}
    </>
  );
}
