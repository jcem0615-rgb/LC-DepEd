'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession } from './providers';
import { Icon } from './icons';
import { InstallButton, SyncStatus } from './status-bar';
import { NAV, PORTAL_TITLE, SHARED_NAV, type NavItem } from '@/lib/nav';
import { ROLE_HOME, ROLE_LABEL } from '@/lib/auth';
import { LANGUAGES } from '@/lib/i18n';
import type { Lang, Role } from '@/lib/types';

export function AppShell({ role, children }: { role: Role; children: React.ReactNode }) {
  const { session, user, ready, lang, setLang, logout } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!session) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (session.role !== role) {
      router.replace(ROLE_HOME[session.role]);
    }
  }, [ready, session, role, router, pathname]);

  useEffect(() => setMoreOpen(false), [pathname]);

  if (!ready || !session || session.role !== role) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-deped-200 border-t-deped-700" />
          <p className="text-sm font-semibold text-slate-600">Loading your portal…</p>
        </div>
      </div>
    );
  }

  const items = NAV[role];
  const primary = items.slice(0, 4);
  const overflow = [...items.slice(4), ...SHARED_NAV];

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <Link href={ROLE_HOME[role]} className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-deped-700 text-sm font-black text-white">
              LC
            </span>
            <span className="hidden sm:block">
              <span className="block text-sm font-extrabold leading-tight text-ink">LC-DepEd</span>
              <span className="block text-xs leading-tight text-slate-500">{PORTAL_TITLE[role]}</span>
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <SyncStatus />
            <InstallButton />
            <label className="sr-only" htmlFor="lang-select">
              Language
            </label>
            <select
              id="lang-select"
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang)}
              className="min-h-touch rounded-xl border-2 border-slate-300 bg-white px-2 text-sm font-semibold text-slate-700"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.short}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={logout}
              className="btn btn-sm border-2 border-slate-300 bg-white text-slate-700"
              title="Sign out"
            >
              <Icon name="logout" className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-5">
        <aside className="hidden w-60 shrink-0 lg:block">
          <nav className="sticky top-20 space-y-1" aria-label="Portal navigation">
            <p className="px-3 pb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
              {ROLE_LABEL[role]}
            </p>
            {[...items, ...SHARED_NAV].map((item) => (
              <SideLink key={item.href} item={item} active={isActive(pathname, item.href)} />
            ))}
            <div className="mt-4 rounded-xl bg-white p-3 text-xs text-slate-600 shadow-sm">
              <p className="font-bold text-ink">{user?.name ?? session.name}</p>
              <p className="mt-0.5">{user?.position ?? ROLE_LABEL[role]}</p>
            </div>
          </nav>
        </aside>

        <main className="min-w-0 flex-1 pb-24 lg:pb-6">{children}</main>
      </div>

      {/* Mobile bottom navigation — large thumb targets. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white lg:hidden"
        style={{ paddingBottom: 'var(--safe-bottom)' }}
        aria-label="Portal navigation"
      >
        <ul className="flex">
          {primary.map((item) => (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={`flex min-h-touch flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-semibold ${
                  isActive(pathname, item.href) ? 'text-deped-700' : 'text-slate-500'
                }`}
              >
                <Icon name={item.icon} className="h-6 w-6" />
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          ))}
          {overflow.length > 0 && (
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                aria-expanded={moreOpen}
                className={`flex min-h-touch w-full flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-semibold ${
                  moreOpen ? 'text-deped-700' : 'text-slate-500'
                }`}
              >
                <Icon name="cog" className="h-6 w-6" />
                More
              </button>
            </li>
          )}
        </ul>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4 pb-8 shadow-xl">
            <p className="mb-3 text-sm font-bold text-slate-500">More</p>
            <ul className="space-y-1">
              {overflow.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex min-h-touch items-center gap-3 rounded-xl px-3 py-3 text-base font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <Icon name={item.icon} className="h-6 w-6 text-deped-700" />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function SideLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-touch items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
        active ? 'bg-deped-700 text-white shadow-sm' : 'text-slate-700 hover:bg-white'
      }`}
    >
      <Icon name={item.icon} className="h-5 w-5" />
      {item.label}
    </Link>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === pathname) return true;
  // Portal roots should not stay highlighted on their child routes.
  const depth = href.split('/').filter(Boolean).length;
  if (depth <= 1) return false;
  return pathname.startsWith(`${href}/`);
}
