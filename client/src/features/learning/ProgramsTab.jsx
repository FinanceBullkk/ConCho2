import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
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

const statusTone = { active: 'default', inactive: 'secondary', archived: 'outline' };

export default function ProgramsTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { can } = useRole();
  const canManage = can('create:program');
  const { data, isLoading } = useLearningPrograms({ status: 'active' });
  const programs = data?.data || [];

  const [modal, setModal] = useState(null); // { program } | { program: null } | null

  const header = (
    <div className="flex items-center justify-between">
      <CardTitle>{t('learning.programs.catalog')}</CardTitle>
      {canManage && (
        <Button size="sm" onClick={() => setModal({ program: null })}>
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
                  onClick={() => navigate(`/learning/programs/${program._id}`)}
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
      {modal && <ProgramFormModal program={modal.program} onClose={() => setModal(null)} />}
    </>
  );
}
