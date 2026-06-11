import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import TableSkeleton from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { useLearningPaths } from '../../hooks/useLearning';
import { useRole } from '../../hooks/useRole';
import PathFormModal from './PathFormModal';

const statusTone = { active: 'default', inactive: 'secondary', archived: 'outline' };

export default function PathsTab() {
  const { t } = useTranslation();
  const { can } = useRole();
  const canManage = can('manage:path');
  const { data, isLoading } = useLearningPaths({ status: 'active' });
  const paths = data?.data || [];

  const [modal, setModal] = useState(null); // { path } | { path: null } | null

  const header = (
    <div className="flex items-center justify-between">
      <CardTitle>{t('learning.paths.catalog')}</CardTitle>
      {canManage && (
        <Button size="sm" onClick={() => setModal({ path: null })}>
          <Plus className="size-4 mr-1.5" aria-hidden="true" />{t('learning.paths.new')}
        </Button>
      )}
    </div>
  );

  let body;
  if (isLoading) {
    body = <TableSkeleton rows={5} cols={4} />;
  } else if (!paths.length) {
    body = (
      <Card>
        <CardHeader>{header}</CardHeader>
        <CardContent>
          <EmptyState title={t('learning.paths.empty')} description={t('learning.paths.emptyDesc')} />
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
                <TableHead>{t('learning.paths.colPath')}</TableHead>
                <TableHead>{t('learning.paths.colSteps')}</TableHead>
                <TableHead>{t('learning.fields.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paths.map((path) => (
                <TableRow
                  key={path._id}
                  className={canManage ? 'cursor-pointer' : undefined}
                  onClick={canManage ? () => setModal({ path }) : undefined}
                >
                  <TableCell>
                    <div className="font-medium text-foreground">{path.title}</div>
                    <div className="text-small text-muted-foreground">{path.code}</div>
                  </TableCell>
                  <TableCell className="tabular-nums">{path.programs?.length || 0}</TableCell>
                  <TableCell>
                    <Badge variant={statusTone[path.status] || 'secondary'}>{t(`learning.status.${path.status}`, path.status)}</Badge>
                  </TableCell>
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
      {modal && <PathFormModal path={modal.path} onClose={() => setModal(null)} />}
    </>
  );
}
