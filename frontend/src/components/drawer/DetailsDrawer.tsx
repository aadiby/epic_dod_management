import * as Dialog from '@radix-ui/react-dialog'
import * as ScrollArea from '@radix-ui/react-scroll-area'
import { ExternalLink, X } from 'lucide-react'

import type { DrawerDetail } from '../../types'
import { statusToneClasses } from '../../lib/utils'

type DetailsDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  detail: DrawerDetail | null
}

function toneForStatus(status?: DrawerDetail['statusTone']): 'success' | 'warning' | 'error' | 'neutral' {
  return status ?? 'neutral'
}

export function DetailsDrawer({ open, onOpenChange, detail }: DetailsDrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-900/40 data-[state=open]:animate-fade-in" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl border-l border-slate-200 bg-white shadow-2xl data-[state=open]:animate-slide-in-right data-[state=closed]:animate-slide-out-right">
          <div className="flex h-full flex-col">
            <header className="flex items-start justify-between border-b border-slate-200 p-5">
              <div>
                <Dialog.Title className="text-lg font-semibold text-slate-900">
                  {detail?.title ?? 'Details'}
                </Dialog.Title>
                {detail && (
                  <span
                    className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusToneClasses(
                      toneForStatus(detail.statusTone),
                    )}`}
                  >
                    {detail.status}
                  </span>
                )}
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </header>

            <ScrollArea.Root className="h-full overflow-hidden">
              <ScrollArea.Viewport className="h-full">
                <div className="space-y-6 p-5">
                  {!detail && <p className="text-sm text-slate-500">Select an item to inspect details.</p>}

                  {detail?.summary && (
                    <section>
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Summary</h3>
                      <p className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                        {detail.summary}
                      </p>
                    </section>
                  )}

                  {(detail?.metadata?.length ?? 0) > 0 && (
                    <section>
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Metadata</h3>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {detail?.metadata?.map((item) => (
                          <article key={item.label} className="rounded-xl border border-slate-200 p-3">
                            <p className="text-xs uppercase tracking-wide text-slate-500">{item.label}</p>
                            <p className="mt-1 text-sm font-medium text-slate-800">{item.value}</p>
                          </article>
                        ))}
                      </div>
                    </section>
                  )}

                  {(detail?.failedChecks?.length ?? 0) > 0 && (
                    <section>
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                        Failed DoD Checks
                      </h3>
                      <div className="mt-2 space-y-2">
                        {detail?.failedChecks?.map((item) => (
                          <article key={`${item.title}-${item.subtitle}`} className="rounded-xl border border-rose-200 bg-rose-50/50 p-3">
                            <p className="text-sm font-semibold text-rose-700">{item.title}</p>
                            {item.subtitle && <p className="mt-1 text-sm text-rose-600">{item.subtitle}</p>}
                            {item.href && (
                              <a
                                href={item.href}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-rose-700 underline"
                              >
                                Open link
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </article>
                        ))}
                      </div>
                    </section>
                  )}

                  {(detail?.history?.length ?? 0) > 0 && (
                    <section>
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">History</h3>
                      <ol className="mt-2 space-y-2 border-l border-slate-200 pl-4">
                        {detail?.history?.map((item) => (
                          <li key={`${item.title}-${item.timestamp}`} className="relative">
                            <span className="absolute -left-[1.17rem] top-1.5 h-2.5 w-2.5 rounded-full bg-indigo-500" />
                            <p className="text-sm font-semibold text-slate-700">{item.title}</p>
                            <p className="text-sm text-slate-600">{item.description}</p>
                            {item.timestamp && <p className="text-xs text-slate-500">{item.timestamp}</p>}
                          </li>
                        ))}
                      </ol>
                    </section>
                  )}

                  {(detail?.links?.length ?? 0) > 0 && (
                    <section>
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Links</h3>
                      <div className="mt-2 space-y-1.5">
                        {detail?.links?.map((link) => (
                          <a
                            key={link.href}
                            href={link.href}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
                          >
                            {link.label}
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              </ScrollArea.Viewport>
              <ScrollArea.Scrollbar className="w-2 bg-slate-100" orientation="vertical">
                <ScrollArea.Thumb className="rounded-full bg-slate-300" />
              </ScrollArea.Scrollbar>
            </ScrollArea.Root>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
