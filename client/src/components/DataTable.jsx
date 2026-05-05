import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

/**
 * Thin, schema-driven wrapper over shadcn Table.
 * For complex tables (sorting, pagination), continue using the Table primitive directly.
 *
 * Usage:
 *   <DataTable
 *     columns={[
 *       { key: 'name', header: 'Name' },
 *       { key: 'role', header: 'Role', cell: (row) => <StatusBadge status={row.role} /> },
 *     ]}
 *     data={users}
 *     getRowKey={(u) => u._id}
 *     onRowClick={(u) => navigate(`/users/${u._id}`)}
 *     emptyState={<EmptyState title="No users" />}
 *   />
 */
export function DataTable({
  columns,
  data,
  getRowKey = (row) => row._id ?? row.id,
  onRowClick,
  emptyState,
  className,
  rowClassName,
}) {
  if ((!data || data.length === 0) && emptyState) {
    return <div className={className}>{emptyState}</div>;
  }
  return (
    <div className={cn('overflow-x-auto rounded-lg border border-border/60', className)}>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={cn('text-xs font-semibold uppercase tracking-wider text-muted-foreground', col.headerClassName)}
              >
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => (
            <TableRow
              key={getRowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                onRowClick && 'cursor-pointer',
                typeof rowClassName === 'function' ? rowClassName(row) : rowClassName
              )}
            >
              {columns.map((col) => (
                <TableCell key={col.key} className={col.className}>
                  {col.cell ? col.cell(row) : row[col.key]}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
