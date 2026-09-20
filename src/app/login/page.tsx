'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ROLE_HOME, readSession, signIn } from '@/lib/auth';
import { useSession } from '@/components/providers';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/data/seed';
import { Banner } from '@/components/ui';
import { Icon } from '@/components/icons';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { refreshSession } = useSession();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const existing = readSession();
    if (existing) router.replace(ROLE_HOME[existing.role]);
  }, [router]);

  async function submit(id: string, pw: string) {
    setBusy(true);
    setError(null);
    const result = await signIn(id, pw);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    refreshSession();
    const next = params.get('next');
    const target = next && next.startsWith('/') ? next : ROLE_HOME[result.session.role];
    router.replace(target);
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 lg:grid-cols-2 lg:py-14">
        <section className="card">
          <Link href="/" className="mb-6 inline-flex items-center gap-2">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-deped-700 text-sm font-black text-white">
              LC
            </span>
            <span>
              <span className="block font-extrabold leading-tight text-ink">LC-DepEd</span>
              <span className="block text-xs text-slate-500">School Management PWA</span>
            </span>
          </Link>

          <h1 className="text-2xl font-extrabold text-ink">Sign in</h1>
          <p className="mt-1 text-sm text-slate-600">
            Use your DepEd email — learners may sign in with their 12-digit LRN.
          </p>

          <form
            className="mt-5"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(identifier, password);
            }}
          >
            <div className="mb-3">
              <label className="label" htmlFor="identifier">
                Email or LRN
              </label>
              <input
                id="identifier"
                className="input"
                autoComplete="username"
                inputMode="email"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="teacher@lcdeped.ph"
                required
              />
            </div>
            <div className="mb-4">
              <label className="label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                className="input"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="mb-3">
                <Banner tone="danger">{error}</Banner>
              </div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="mt-5 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
            <p className="flex items-center gap-2 font-semibold text-slate-700">
              <Icon name="lock" className="h-4 w-4" />
              Demo build
            </p>
            <p className="mt-1">
              Accounts are seeded into this device&apos;s local database. A production deployment
              authenticates through DepEd GSuite OAuth 2.0 with the same role matrix.
            </p>
          </div>
        </section>

        <section className="card">
          <h2 className="text-lg font-bold text-ink">Demo accounts</h2>
          <p className="mt-1 text-sm text-slate-600">
            One account per portal. Password for all:{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">{DEMO_PASSWORD}</code>
          </p>
          <ul className="mt-4 space-y-2">
            {DEMO_ACCOUNTS.map((acc) => (
              <li key={acc.email}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setIdentifier(acc.email);
                    setPassword(acc.password);
                    void submit(acc.email, acc.password);
                  }}
                  className="w-full rounded-xl border-2 border-slate-200 p-3 text-left transition hover:border-deped-400 hover:bg-deped-50 disabled:opacity-60"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-bold text-ink">{acc.portal}</span>
                    <span className="chip bg-deped-100 text-deped-800">Use</span>
                  </span>
                  <span className="mt-0.5 block font-mono text-xs text-slate-500">{acc.email}</span>
                  <span className="mt-1 block text-xs text-slate-600">{acc.blurb}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-slate-500">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
