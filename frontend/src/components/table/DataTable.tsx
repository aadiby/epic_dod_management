import { useMemo, useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  type ColumnDef,
  type PaginationState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { ChevronDown, ChevronLeft, ChevronRight, SlidersHorizontal, Search } from 'lucide-react'

import { cn } from '../../lib/utils'

type DataTableProps<TData> = {
  title?: string
  description?: string
  data: TData[]
  columns: ColumnDef<TData, unknown>[]
  searchPlaceholder?: string
  pageSize?: number
  emptyMessage?: string
  className?: string
}

function includesText(value: unknown, query: string) {
  if (value == null) {
    return false
  }
  return String(value).toLowerCase().includes(query)
}

export function DataTable<TData>({
  title,
  description,
  data,
  columns,
  searchPlaceholder = 'Search...',
  pageSize = 10,
  emptyMessage = 'No records found.',
  className,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [query, setQuery] = useState('')
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  })

  const filteredData = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) {
      return data
    }

    return data.filter((item) => {
      const values = Object.values(item as Record<string, unknown>)
      return values.some((value) => includesText(value, normalized))
    })
  }, [data, query])

  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      sorting,
      pagination,
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  const visibleColumns = table
    .getAllLeafColumns()
    .filter((column) => column.getCanHide())

  return (
    <section className={cn('rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm', className)}>
      {(title || description) && (
        <header className="mb-4">
          {title && <h3 className="text-base font-semibold text-slate-900">{title}</h3>}
          {description && <p className="text-sm text-slate-500">{description}</p>}
        </header>
      )}

      <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <label className="relative block w-full md:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPagination((current) => ({ ...current, pageIndex: 0 }))
            }}
            placeholder={searchPlaceholder}
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 focus:border-teal-400 focus:outline-none"
          />
        </label>

        {visibleColumns.length > 0 && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Columns
                <ChevronDown className="h-4 w-4" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                className="z-50 min-w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-md"
              >
                {visibleColumns.map((column) => (
                  <DropdownMenu.CheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(checked) => column.toggleVisibility(Boolean(checked))}
                    className="cursor-pointer rounded-lg px-2 py-1.5 text-sm text-slate-700 outline-none hover:bg-slate-100"
                  >
                    {column.id}
                  </DropdownMenu.CheckboxItem>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div className="max-h-[540px] overflow-auto">
          <table className="w-full min-w-[900px] border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-50">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="border-b border-slate-200 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      {header.isPlaceholder ? null : (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          disabled={!header.column.getCanSort()}
                          className="inline-flex items-center gap-1 disabled:cursor-default"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() && (
                            <ChevronDown
                              className={cn(
                                'h-3.5 w-3.5 transition',
                                header.column.getIsSorted() === 'asc' && 'rotate-180',
                                !header.column.getIsSorted() && 'opacity-40',
                              )}
                            />
                          )}
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-8 text-center text-sm text-slate-500">
                    {emptyMessage}
                  </td>
                </tr>
              )}
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-3 text-sm text-slate-700 align-top">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <footer className="mt-3 flex flex-col gap-2 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <p>
          Showing {table.getRowModel().rows.length} of {filteredData.length} result(s)
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </button>
          <span>
            Page {pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}
          </span>
          <button
            type="button"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 disabled:opacity-50"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </footer>
    </section>
  )
}
