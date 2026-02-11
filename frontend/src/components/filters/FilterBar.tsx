import * as Popover from '@radix-ui/react-popover'
import { Check, ChevronsUpDown, Filter, X } from 'lucide-react'

import type { EpicStatus } from '../../types'
import { cn } from '../../lib/utils'

type FilterBarProps = {
  availableSquads: string[]
  selectedSquads: string[]
  rawSquadValue: string
  categoryOptions: string[]
  categoryFilter: string
  epicStatusFilter: EpicStatus
  onRawSquadChange: (value: string) => void
  onSelectedSquadsChange: (value: string[]) => void
  onCategoryFilterChange: (value: string) => void
  onEpicStatusFilterChange: (value: EpicStatus) => void
  onClearAll: () => void
}

export function FilterBar({
  availableSquads,
  selectedSquads,
  rawSquadValue,
  categoryOptions,
  categoryFilter,
  epicStatusFilter,
  onRawSquadChange,
  onSelectedSquadsChange,
  onCategoryFilterChange,
  onEpicStatusFilterChange,
  onClearAll,
}: FilterBarProps) {
  const toggleSquad = (squad: string) => {
    const selected = new Set(selectedSquads)
    if (selected.has(squad)) {
      selected.delete(squad)
    } else {
      selected.add(squad)
    }
    onSelectedSquadsChange(Array.from(selected))
  }

  const activeFilters = [
    ...selectedSquads.map((squad) => ({ key: `squad-${squad}`, label: `Squad: ${squad}` })),
    ...(categoryFilter ? [{ key: `category-${categoryFilter}`, label: `Category: ${categoryFilter}` }] : []),
    ...(epicStatusFilter !== 'all' ? [{ key: `status-${epicStatusFilter}`, label: `Status: ${epicStatusFilter}` }] : []),
  ]

  return (
    <section className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
            <Filter className="h-4 w-4 text-teal-600" />
            Filters
          </div>

          <Popover.Root>
            <Popover.Trigger asChild>
              <button
                type="button"
                className="inline-flex min-w-52 items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:shadow-sm"
              >
                <span className="truncate">
                  {selectedSquads.length > 0 ? `${selectedSquads.length} squad(s) selected` : 'Select squads'}
                </span>
                <ChevronsUpDown className="h-4 w-4 text-slate-400" />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="start"
                sideOffset={8}
                className="z-50 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-md"
              >
                <div className="max-h-52 overflow-y-auto">
                  {availableSquads.length === 0 && (
                    <p className="px-2 py-1 text-sm text-slate-500">No squads available</p>
                  )}
                  {availableSquads.map((squad) => {
                    const selected = selectedSquads.includes(squad)
                    return (
                      <button
                        key={squad}
                        type="button"
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100"
                        onClick={() => toggleSquad(squad)}
                      >
                        <span
                          className={cn(
                            'grid h-4 w-4 place-items-center rounded border border-slate-300',
                            selected ? 'border-teal-500 bg-teal-500 text-white' : 'bg-white text-transparent',
                          )}
                        >
                          <Check className="h-3 w-3" />
                        </span>
                        <span className="truncate">{squad}</span>
                      </button>
                    )
                  })}
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>

          <label className="sr-only" htmlFor="category-filter">DoD Category</label>
          <select
            id="category-filter"
            value={categoryFilter}
            onChange={(event) => onCategoryFilterChange(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            data-testid="filter-category"
          >
            <option value="">All categories</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>

          <label className="sr-only" htmlFor="status-filter">Epic Status</label>
          <select
            id="status-filter"
            value={epicStatusFilter}
            onChange={(event) => onEpicStatusFilterChange(event.target.value as EpicStatus)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            data-testid="filter-epic-status"
          >
            <option value="all">All epics</option>
            <option value="open">Open</option>
            <option value="done">Done</option>
          </select>

          {activeFilters.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700"
            >
              Clear all
            </button>
          )}
        </div>

        <details
          open
          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
        >
          <summary className="cursor-pointer select-none text-slate-700">Advanced</summary>
          <label className="mt-2 block text-xs font-medium text-slate-500" htmlFor="squad-filter-input">
            Squad filter query (comma-separated)
          </label>
          <input
            id="squad-filter-input"
            value={rawSquadValue}
            onChange={(event) => onRawSquadChange(event.target.value)}
            placeholder="squad_platform,squad_mobile"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700"
            data-testid="filter-squad"
          />
        </details>
      </div>

      {activeFilters.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-200 pt-3">
          {activeFilters.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
            >
              {chip.label}
              <X className="h-3.5 w-3.5" />
            </span>
          ))}
        </div>
      )}
    </section>
  )
}
