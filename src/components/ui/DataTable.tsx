import React, { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  id: string;
  header: React.ReactNode;
  accessor?: (item: T) => React.ReactNode;
  sortable?: boolean;
  sortValue?: (item: T) => string | number | bigint | boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;
  className?: string;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T) => string | number;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  onRowClick?: (item: T) => void;
  pageSize?: number;
  stickyHeader?: boolean;
  className?: string;
  rowClassName?: (item: T) => string | undefined;
}

type SortDirection = 'asc' | 'desc';

export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  isLoading = false,
  emptyTitle = 'No records found',
  emptyDescription = 'There are no items to display at this time.',
  emptyAction,
  onRowClick,
  pageSize = 10,
  stickyHeader = true,
  className = '',
  rowClassName,
}: DataTableProps<T>): React.ReactElement {
  const [sortColumnId, setSortColumnId] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Sorting logic
  const sortedData = useMemo(() => {
    if (!sortColumnId) return data;

    const column = columns.find((c) => c.id === sortColumnId);
    if (!column || !column.sortable) return data;

    return [...data].sort((a, b) => {
      let valA: unknown;
      let valB: unknown;

      if (column.sortValue) {
        valA = column.sortValue(a);
        valB = column.sortValue(b);
      } else {
        valA = (a as Record<string, unknown>)[sortColumnId];
        valB = (b as Record<string, unknown>)[sortColumnId];
      }

      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      let comparison = 0;
      if (typeof valA === 'bigint' && typeof valB === 'bigint') {
        comparison = valA < valB ? -1 : 1;
      } else if (typeof valA === 'number' && typeof valB === 'number') {
        comparison = valA < valB ? -1 : 1;
      } else {
        comparison = String(valA).localeCompare(String(valB));
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data, columns, sortColumnId, sortDirection]);

  // Pagination logic
  const totalItems = sortedData.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);

  const paginatedData = useMemo(() => {
    const startIndex = (validCurrentPage - 1) * pageSize;
    return sortedData.slice(startIndex, startIndex + pageSize);
  }, [sortedData, validCurrentPage, pageSize]);

  const handleSort = (columnId: string, sortable?: boolean) => {
    if (!sortable) return;

    if (sortColumnId === columnId) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortColumnId(null);
        setSortDirection('asc');
      }
    } else {
      setSortColumnId(columnId);
      setSortDirection('asc');
    }
  };

  const startEntry = totalItems === 0 ? 0 : (validCurrentPage - 1) * pageSize + 1;
  const endEntry = Math.min(validCurrentPage * pageSize, totalItems);

  return (
    <div className={`w-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-subtle ${className}`}>
      <div className="overflow-x-auto relative">
        <table className="w-full text-left border-collapse">
          {/* Table Header */}
          <thead className={stickyHeader ? 'sticky top-0 z-10 bg-slate-50 dark:bg-slate-800/90 backdrop-blur-sm' : 'bg-slate-50 dark:bg-slate-800/90'}>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              {columns.map((col) => {
                const isSorted = sortColumnId === col.id;
                const alignClass =
                  col.align === 'right'
                    ? 'text-right'
                    : col.align === 'center'
                    ? 'text-center'
                    : 'text-left';

                return (
                  <th
                    key={col.id}
                    scope="col"
                    style={{ width: col.width }}
                    onClick={() => handleSort(col.id, col.sortable)}
                    className={`py-3.5 px-4 sm:px-6 select-none ${alignClass} ${
                      col.sortable ? 'cursor-pointer hover:bg-slate-100/80 dark:hover:bg-slate-700/60 transition-subtle' : ''
                    } ${col.className || ''}`}
                  >
                    <div
                      className={`inline-flex items-center space-x-1.5 ${
                        col.align === 'right' ? 'justify-end w-full' : ''
                      }`}
                    >
                      <span>{col.header}</span>
                      {col.sortable && (
                        <span className="text-slate-400 dark:text-slate-500">
                          {isSorted ? (
                            sortDirection === 'asc' ? (
                              <ChevronUp className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                            )
                          ) : (
                            <ChevronsUpDown className="w-3.5 h-3.5 opacity-40 hover:opacity-100" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
            {isLoading ? (
              Array.from({ length: Math.min(pageSize, 5) }).map((_, rIdx) => (
                <tr key={`skel-row-${rIdx}`} className="animate-pulse">
                  {columns.map((col, cIdx) => (
                    <td key={`skel-col-${cIdx}`} className="py-4 px-4 sm:px-6">
                      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-8">
                  <EmptyState
                    title={emptyTitle}
                    description={emptyDescription}
                    action={emptyAction}
                  />
                </td>
              </tr>
            ) : (
              paginatedData.map((item) => {
                const key = keyExtractor(item);
                const isClickable = Boolean(onRowClick);

                return (
                  <tr
                    key={key}
                    tabIndex={isClickable ? 0 : undefined}
                    onClick={() => onRowClick?.(item)}
                    onKeyDown={(e) => {
                      if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        onRowClick?.(item);
                      }
                    }}
                    className={`transition-subtle ${
                      rowClassName ? rowClassName(item) || '' : ''
                    } ${
                      isClickable
                        ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 focus:bg-slate-50 dark:focus:bg-slate-800 focus:outline-none'
                        : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    {columns.map((col) => {
                      const alignClass =
                        col.align === 'right'
                          ? 'text-right tabular-nums'
                          : col.align === 'center'
                          ? 'text-center'
                          : 'text-left';

                      return (
                        <td
                          key={col.id}
                          className={`py-3.5 px-4 sm:px-6 text-slate-800 dark:text-slate-200 ${alignClass} ${col.className || ''}`}
                        >
                          {col.accessor
                            ? col.accessor(item)
                            : (item as Record<string, unknown>)[col.id] !== undefined
                            ? String((item as Record<string, unknown>)[col.id])
                            : null}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {!isLoading && totalItems > 0 && (
        <div className="px-4 sm:px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400 select-none">
          <div>
            Showing <span className="font-semibold text-slate-900 dark:text-slate-100">{startEntry}</span> to{' '}
            <span className="font-semibold text-slate-900 dark:text-slate-100">{endEntry}</span> of{' '}
            <span className="font-semibold text-slate-900 dark:text-slate-100">{totalItems}</span> results
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              disabled={validCurrentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
              className="px-3 py-1.5 min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:pointer-events-none transition-subtle inline-flex items-center font-medium shadow-subtle"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Prev
            </button>

            <span className="px-2 font-mono font-medium text-slate-700 dark:text-slate-300">
              Page {validCurrentPage} / {totalPages}
            </span>

            <button
              type="button"
              disabled={validCurrentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Next page"
              className="px-3 py-1.5 min-h-[38px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:pointer-events-none transition-subtle inline-flex items-center font-medium shadow-subtle"
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
