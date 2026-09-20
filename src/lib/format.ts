/** Small formatting helpers shared across portals. */

export function formatDate(value: string | number | Date, opts?: Intl.DateTimeFormatOptions): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-PH', opts ?? { year: 'numeric', month: 'short', day: 'numeric' }).format(d);
}

export function formatTime(value: string | number | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' }).format(d);
}

export function formatDateTime(value: string | number | Date): string {
  return `${formatDate(value)} • ${formatTime(value)}`;
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(ts);
}

export function todayIso(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fullName(p: { firstName: string; middleName?: string; lastName: string }): string {
  const mi = p.middleName ? ` ${p.middleName.charAt(0)}.` : '';
  return `${p.lastName}, ${p.firstName}${mi}`;
}

export function pct(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(digits)}%`;
}

export function compactNumber(n: number): string {
  return new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

/** Masks a Learner Reference Number for non-privileged views (RA 10173). */
export function maskLrn(lrn: string): string {
  if (!lrn || lrn.length < 12) return '••••••••••••';
  return `${lrn.slice(0, 3)}••••••${lrn.slice(-3)}`;
}

/**
 * Friendly name for greetings: drops a title and keeps abbreviated Filipino
 * given names intact ("Dr. Aurora M. Beltran" → "Aurora", "Ma. Teresa R. Ramos" → "Ma. Teresa").
 */
export function greetingName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const titles = new Set(['Dr.', 'Atty.', 'Engr.', 'Mr.', 'Ms.', 'Mrs.', 'Prof.', 'Hon.']);
  let index = titles.has(parts[0]) ? 1 : 0;
  let result = parts[index] ?? '';
  if (result.endsWith('.') && parts[index + 1]) result += ` ${parts[index + 1]}`;
  return result;
}

/** The most recent weekday — DepEd classes do not run on weekends. */
export function lastSchoolDay(from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return todayIso(d);
}
