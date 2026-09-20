'use client';

import { type ReactNode } from 'react';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  success: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-rose-100 text-rose-800',
  info: 'bg-sky-100 text-sky-800',
  brand: 'bg-deped-100 text-deped-800',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`chip ${TONE_CLASSES[tone]}`}>{children}</span>;
}

export function Card({
  title,
  subtitle,
  action,
  children,
  className = '',
  id,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`card ${className}`}>
      {(title || action) && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && <h2 className="text-lg font-bold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          {action && <div className="flex flex-wrap gap-2">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-slate-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = 'brand',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
}) {
  const ring: Record<Tone, string> = {
    neutral: 'border-slate-200',
    success: 'border-emerald-200',
    warning: 'border-amber-200',
    danger: 'border-rose-200',
    info: 'border-sky-200',
    brand: 'border-deped-200',
  };
  return (
    <div className={`rounded-2xl border-2 ${ring[tone]} bg-white p-4 shadow-sm`}>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-ink sm:text-3xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-300 p-6 text-center">
      <p className="font-semibold text-slate-600">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
    </div>
  );
}

export function Loading({ rows = 3, label = 'Loading…' }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-10 w-full" />
      ))}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-3">
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition focus:outline-none focus-visible:ring-4 focus-visible:ring-deped-300 ${
        checked ? 'bg-emerald-600' : 'bg-slate-300'
      }`}
    >
      <span
        className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
          checked ? 'translate-x-7' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={`btn btn-sm whitespace-nowrap ${
            active === tab.id
              ? 'bg-deped-700 text-white'
              : 'border-2 border-slate-300 bg-white text-slate-700'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ value, tone = 'brand' }: { value: number; tone?: Tone }) {
  const colors: Record<Tone, string> = {
    neutral: 'bg-slate-500',
    success: 'bg-emerald-600',
    warning: 'bg-amber-500',
    danger: 'bg-rose-600',
    info: 'bg-sky-600',
    brand: 'bg-deped-600',
  };
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200"
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={`h-full rounded-full ${colors[tone]}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function Banner({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  const styles: Record<Tone, string> = {
    neutral: 'border-slate-300 bg-slate-50 text-slate-700',
    success: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    warning: 'border-amber-300 bg-amber-50 text-amber-900',
    danger: 'border-rose-300 bg-rose-50 text-rose-800',
    info: 'border-sky-300 bg-sky-50 text-sky-900',
    brand: 'border-deped-300 bg-deped-50 text-deped-900',
  };
  return (
    <div className={`rounded-xl border-2 px-4 py-3 text-sm ${styles[tone]}`} role="status">
      {children}
    </div>
  );
}
