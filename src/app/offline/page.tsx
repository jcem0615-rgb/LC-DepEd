import Link from 'next/link';

export const metadata = { title: 'Offline' };

export default function OfflinePage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 p-6">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-2xl font-extrabold text-ink">You are offline</h1>
        <p className="mt-2 text-sm text-slate-600">
          This page has not been cached yet. Anything you already opened still works, and every record
          you save while offline is kept on the device and synced automatically once the signal returns.
        </p>
        <Link href="/" className="btn-primary mt-5 inline-flex">
          Back to the app
        </Link>
      </div>
    </main>
  );
}
