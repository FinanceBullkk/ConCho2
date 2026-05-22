import { useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, SearchX } from 'lucide-react';
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import QueryError from '@/components/QueryError';
import Pagination from '@/components/Pagination';
import { cn } from '@/lib/utils';

// ──────────────────────────────────────────────────────────
// DataTable — Phase 1 §07
//
// Column-definition–driven table with:
//   • Sort headers   (sortable: true + onSort callback)
//   • Row selection  (selectable: true + selected Set + onSelectChange)
//   • Skeleton load  (isLoading — replaces tbody with shimmer rows)
//   • Refetch dimming (isFetching — opacity overlay, no layout shift)
//   • Error state    (isError — QueryError block)
//   • Empty state    (inline icon+text, or custom emptyState slot)
//   • Pagination     (page/totalPages/total/onPageChange — footer row)
//
// Column definition shape:
//   {
//     key         string | null  data accessor key; null = render-only col
//     header      string         label shown in <th>
//     sortable?   boolean        enable sort button on this column (needs onSort)
//     render?     (row) => node  custom cell renderer (falls back to row[key])
//     className?  string         applied to both <th> and <td>
//     headerCls?  string         <th> only
//     cellCls?    string         <td> only
//     width?      number         fixed pixel width
//   }
//
// Quick example:
//   const columns = [
//     { key: 'empCode', header: 'Code', sortable: true, width: 80,
//       render: (r) => <span className="text-mono text-primary">{r.empCode}</span> },
//     { key: 'name',   header: 'Name', sortable: true },
//     { key: 'status', header: 'Status',
//       render: (r) => <StatusBadge status={r.status} size="sm" /> },
//     { key: null,     header: 'Actions', cellCls: 'text-right',
//       render: (r) => <RowActions row={r} /> },
//   ];
//
//   <DataTable
//     columns={columns}   data={users}   rowKey="_id"
//     sortBy={sortBy}     sortOrder={sortOrder}    onSort={handleSort}
//     selectable          selected={selectedIds}   onSelectChange={setSelectedIds}
//     isLoading={isLoading} isFetching={isFetching}
//     isError={isError}   error={error}            onRetry={refetch}
//     page={page}         totalPages={pages}       total={total}
//     onPageChange={(p) => setParam('page', p > 1 ? String(p) : '')}
//   />
// ──────────────────────────────────────────────────────────

export function DataTable({
  // Data
  columns = [],
  data = [],
  rowKey = '_id',

  // Sort
  sortBy,
  sortOrder = 'asc',
  onSort,

  // Selection
  selectable = false,
  selected,           // Set<string>
  onSelectChange,

  // Loading
  isLoading = false,
  isFetching = false,
  isError = false,
  error = null,
  onRetry,
  skeletonRows = 6,

  // Pagination
  page,
  totalPages,
  total,
  onPageChange,

  // Empty state
  emptyState,
  emptyTitle = 'No results',
  emptyMessage = 'Try adjusting your filters or search terms.',

  // Layout
  className,
  tableClassName,
}) {
  const getKey = typeof rowKey === 'function' ? rowKey : (row) => row[rowKey];

  // Prepend checkbox sentinel column when selectable
  const allCols = useMemo(
    () => (selectable ? [{ key: '__select__', header: null, width: 40 }, ...columns] : columns),
    [columns, selectable],
  );

  const allSelected  = selectable && data.length > 0 && selected?.size === data.length;
  const someSelected = selectable && (selected?.size ?? 0) > 0 && selected?.size < data.length;

  const toggleAll = () => {
    if (!onSelectChange) return;
    onSelectChange(allSelected ? new Set() : new Set(data.map(getKey)));
  };

  const toggleRow = (key) => {
    if (!onSelectChange) return;
    const next = new Set(selected);
    next.has(key) ? next.delete(key) : next.add(key);
    onSelectChange(next);
  };

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* ── Table card ── */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <SkeletonRows rows={skeletonRows} cols={allCols.length} />
        ) : isError ? (
          <QueryError error={error} onRetry={onRetry} />
        ) : (
          <div
            className={cn(
              'overflow-x-auto transition-opacity duration-(--dur)',
              isFetching && 'opacity-60 pointer-events-none',
            )}
          >
            <Table className={tableClassName}>

              {/* header */}
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b border-border h-(--row-h)">
                  {allCols.map((col, i) => (
                    <TableHead
                      key={col.key ?? `h-${i}`}
                      style={col.width ? { width: col.width, minWidth: col.width } : undefined}
                      className={cn('px-3', col.className, col.headerCls)}
                    >
                      {col.key === '__select__' ? (
                        <CheckboxCell
                          checked={allSelected}
                          indeterminate={someSelected}
                          onChange={toggleAll}
                          aria-label="Select all rows"
                        />
                      ) : col.sortable && onSort ? (
                        <button
                          type="button"
                          onClick={() => onSort(col.key)}
                          className={cn(
                            'flex items-center gap-1',
                            'text-overline text-muted-foreground',
                            'hover:text-foreground transition-colors duration-(--dur-fast) select-none',
                          )}
                        >
                          {col.header}
                          <SortIndicator colKey={col.key} sortBy={sortBy} sortOrder={sortOrder} />
                        </button>
                      ) : (
                        <span className="text-overline text-muted-foreground">
                          {col.header}
                        </span>
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>

              {/* body */}
              <TableBody>
                {data.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <td colSpan={allCols.length} className="py-14 text-center">
                      {emptyState ?? (
                        <div className="inline-flex flex-col items-center gap-2 text-subtle-foreground">
                          <SearchX className="size-5" strokeWidth={1.5} aria-hidden="true" />
                          <span className="text-body font-medium text-muted-foreground">
                            {emptyTitle}
                          </span>
                          {emptyMessage && (
                            <span className="text-small">{emptyMessage}</span>
                          )}
                        </div>
                      )}
                    </td>
                  </TableRow>
                ) : (
                  data.map((row) => {
                    const key = getKey(row);
                    const isSelected = selectable && (selected?.has(key) ?? false);
                    return (
                      <TableRow
                        key={key}
                        data-state={isSelected ? 'selected' : undefined}
                        className="border-b border-border h-(--row-h)"
                      >
                        {allCols.map((col, i) => (
                          <TableCell
                            key={col.key ?? `c-${i}`}
                            className={cn('px-3 py-0', col.className, col.cellCls)}
                          >
                            {col.key === '__select__' ? (
                              <CheckboxCell
                                checked={isSelected}
                                onChange={() => toggleRow(key)}
                                aria-label="Select row"
                              />
                            ) : col.render ? (
                              col.render(row)
                            ) : (
                              (row[col.key] ?? '—')
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* ── Pagination footer ── */}
      {!isLoading && !isError && totalPages > 1 && (
        <div className="flex items-center justify-between text-small text-muted-foreground">
          <span>
            {total != null ? `Page ${page} of ${totalPages} · ${total} total` : ''}
          </span>
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={onPageChange}
            isLoading={isFetching}
          />
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────

/** Checkbox that can be put into indeterminate state via ref. */
function CheckboxCell({ checked, indeterminate = false, onChange, 'aria-label': ariaLabel }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      ref={(el) => { if (el) el.indeterminate = indeterminate; }}
      onChange={onChange}
      aria-label={ariaLabel}
      className="size-4 rounded border-input bg-background accent-primary cursor-pointer"
    />
  );
}

/** 11 px sort indicator shown next to sortable column headers. */
function SortIndicator({ colKey, sortBy, sortOrder }) {
  const size = { width: 11, height: 11 };
  if (sortBy !== colKey) {
    return <ChevronsUpDown style={size} className="shrink-0 text-subtle-foreground" aria-hidden="true" />;
  }
  if (sortOrder === 'asc') {
    return <ChevronUp style={size} className="shrink-0 text-primary" aria-hidden="true" />;
  }
  return <ChevronDown style={size} className="shrink-0 text-primary" aria-hidden="true" />;
}

/** Skeleton shimmer used while isLoading. */
function SkeletonRows({ rows, cols }) {
  return (
    <div className="p-4 space-y-2" aria-busy="true" aria-label="Loading data…">
      {/* header skeleton */}
      <div className="flex gap-3 pb-2 border-b border-border" style={{ height: 'var(--row-h)' }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn('h-3 self-center', i === 0 ? 'w-16' : i === cols - 1 ? 'w-10 ml-auto' : 'flex-1')}
          />
        ))}
      </div>
      {/* data row skeletons */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3 items-center" style={{ height: 'var(--row-h)' }}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className={cn('h-4', c === 0 ? 'w-12' : c === cols - 1 ? 'w-8 ml-auto' : 'flex-1')}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
