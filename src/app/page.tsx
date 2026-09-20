import Link from 'next/link';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/data/seed';

const FEATURES = [
  {
    title: 'Offline-first by design',
    body: 'Every screen reads and writes IndexedDB through Dexie.js. Attendance taken with no signal is stored locally and drained by the sync queue when the phone reconnects.',
  },
  {
    title: 'Zero-SMS gate alerts',
    body: 'A dynamic HMAC-SHA256 e-ID that rotates every 30 seconds is scanned at the gate; guardians get a free Web Push notification instead of a paid SMS blast.',
  },
  {
    title: 'Paperwork automation',
    body: 'SF1, SF2, SF5, SF9 and SF10 are generated from the same records teachers already keep, with DepEd Order No. 8, s. 2015 transmutation applied automatically.',
  },
  {
    title: 'RA 10173 compliance',
    body: 'Granular RBAC, PII masking for division reports and an immutable audit trail of every record access, export and failed login.',
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-deped-950 via-deped-900 to-slate-900 text-white">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:py-16">
        <header className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-base font-black text-deped-800">
            LC
          </span>
          <div>
            <p className="text-lg font-extrabold leading-tight">LC-DepEd</p>
            <p className="text-sm text-deped-200">School Management &amp; Automation PWA</p>
          </div>
          <Link href="/login" className="btn btn-sm ml-auto bg-white text-deped-800">
            Sign in
          </Link>
        </header>

        <section className="mt-12 max-w-3xl">
          <h1 className="text-3xl font-extrabold leading-tight sm:text-5xl">
            Digitised DepEd paperwork that still works when the signal drops.
          </h1>
          <p className="mt-4 text-lg text-deped-100">
            Six role-based portals — Teacher, Learner, Parent, School Head, SDO/RO and Super Admin —
            built as one installable, low-bandwidth Progressive Web App for Philippine public schools.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/login" className="btn bg-white text-deped-800 hover:bg-deped-50">
              Open the demo
            </Link>
            <Link href="/scanner" className="btn border-2 border-white/40 text-white hover:bg-white/10">
              Gate scanner kiosk
            </Link>
          </div>
        </section>

        <section className="mt-14 grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-white/15 bg-white/5 p-5">
              <h2 className="text-lg font-bold">{f.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-deped-100">{f.body}</p>
            </div>
          ))}
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-extrabold">Demo accounts</h2>
          <p className="mt-1 text-deped-200">
            All demo accounts use the password <code className="rounded bg-white/15 px-1.5 py-0.5">{DEMO_PASSWORD}</code>.
            The dataset is synthetic — no real learner information is included.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {DEMO_ACCOUNTS.map((acc) => (
              <div key={acc.email} className="rounded-2xl border border-white/15 bg-white/5 p-4">
                <p className="text-sm font-bold text-white">{acc.portal}</p>
                <p className="mt-1 break-all font-mono text-sm text-deped-200">{acc.email}</p>
                <p className="mt-2 text-xs leading-relaxed text-deped-100">{acc.blurb}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-16 border-t border-white/10 pt-6 text-sm text-deped-300">
          <p>
            Built for DepEd Order No. 2, s. 2024 (teacher workload relief), DepEd Order No. 8, s. 2015
            (classroom assessment) and the Data Privacy Act of 2012 (RA 10173).
          </p>
        </footer>
      </div>
    </main>
  );
}
