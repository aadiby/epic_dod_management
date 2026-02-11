import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPercent(value: number, digits = 0): string {
  if (!Number.isFinite(value)) {
    return '0%'
  }
  return `${value.toFixed(digits)}%`
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '0'
  }
  return new Intl.NumberFormat().format(value)
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '-'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }
  return date.toLocaleString()
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '-'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

export function deltaClass(delta: number): string {
  if (delta > 0) {
    return 'text-emerald-600'
  }
  if (delta < 0) {
    return 'text-rose-600'
  }
  return 'text-slate-500'
}

export function statusToneClasses(status: 'success' | 'warning' | 'error' | 'neutral'): string {
  if (status === 'success') {
    return 'bg-emerald-100 text-emerald-700 border-emerald-200'
  }
  if (status === 'warning') {
    return 'bg-amber-100 text-amber-700 border-amber-200'
  }
  if (status === 'error') {
    return 'bg-rose-100 text-rose-700 border-rose-200'
  }
  return 'bg-slate-100 text-slate-700 border-slate-200'
}
