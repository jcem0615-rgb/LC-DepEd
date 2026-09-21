# LC-DepEd — DepEd School Management & Automation PWA

**Live demo: https://lc-deped.vercel.app** — sign in with any account in the table below.

An offline-first Progressive Web App for Philippine public schools: attendance,
DepEd Order No. 8 s. 2015 grading, School Forms automation (SF1–SF10), a dynamic
student e-ID for gate security, and free Web Push alerts for guardians instead of
paid SMS.

Six role-based portals ship in one installable app:

| Portal | What it does |
| --- | --- |
| **Teacher** | One-tap attendance, DO 8 s. 2015 class record, SF1/SF2/SF5/SF9/SF10 generation as real .xlsx and PDF, MATATAG Daily Lesson Log builder with voice input, IPCRF/RPMS portfolio |
| **Learner** | Grades and attendance, dynamic HMAC-signed e-ID QR, printable PDF ID card, offline Self-Learning Kits |
| **Parent / Guardian** | Real-time gate push alerts, signed SF9 report card, adviser messaging, 1-tap dialect switch |
| **School Head** | Approval hub with batch digital signing, NTP task routing (DO 2, s. 2024), LIS sync, school audit trail |
| **SDO / Regional Office** | Automated report intake with rule validation, division analytics, dropout-risk watchlist, security console |
| **Super Admin** | Live telemetry, tenant provisioning, RA 10173 privacy control room, feature flags, backups, VAPID rotation, maintenance mode |

Plus a **gate scanner kiosk** (`/scanner`) — full-screen camera scanning with
audio-visual confirmation, offline signature verification and a manual fallback.

---

## Demo accounts

Every account uses the password **`Demo@1234`**. The login screen has a one-tap
button for each. All data is synthetic — no real learner information is included.

| Portal | Email | Signs in as |
| --- | --- | --- |
| Super Admin | `superadmin@lcdeped.ph` | Engr. Noel Villamor |
| Teacher | `teacher@lcdeped.ph` | Ma. Teresa R. Ramos — adviser, Grade 5 Mabini |
| Learner | `student@lcdeped.ph` | Althea Dela Cruz (also signs in with LRN `136001200001`) |
| Parent / Guardian | `parent@lcdeped.ph` | Rosalinda S. Dela Cruz |
| School Head | `head@lcdeped.ph` | Dr. Aurora M. Beltran |
| SDO / RO | `sdo@lcdeped.ph` | Atty. Ferdinand L. Oliveros |

A second teacher account, `teacher2@lcdeped.ph`, is seeded for approval and
messaging flows that need two teachers.

### A five-minute tour

1. Sign in as the **teacher**, open **Attendance**, tap a few learners — the header
   shows `Saved Locally ✓`. Switch your phone to airplane mode and keep tapping;
   the writes queue locally and upload when you reconnect.
2. Open **Grades → Edit** on any learner. Scores recompute live through the
   DO 8 s. 2015 weights and transmutation table.
3. Go to **School Forms**, flip through SF1/SF2/SF5/SF9/SF10, then
   **Submit for approval**.
4. Sign in as the **school head** → **Approval hub** → select all → **Batch sign**.
5. Sign in as the **learner** → **My e-ID**. The QR rotates every 30 seconds.
6. Back in **School Forms**, hit **Export XLSX** and **Download PDF** on any form —
   both are generated server-side and open in Excel and any PDF reader.
7. Open `/scanner` as the teacher or school head, paste that e-ID payload into
   manual entry — it verifies, chimes, and pushes an alert.
8. Sign in as the **parent** → **Gate Alerts** to see the notification land.

---

## Deployment

The demo runs on Vercel (project `lc-deped`), connected to this repository: every
push to `claude/affectionate-einstein-kfudx6` builds and promotes to production
automatically. Because the XLSX and PDF exports are route handlers, the app needs
a Node runtime — everything else prerenders as static HTML.

Two deployment details matter:

- `serverExternalPackages` keeps ExcelJS and PDFKit out of the bundler, and
  `outputFileTracingIncludes` copies PDFKit's `.afm` font metrics into the PDF
  route. Without the second one the traced bundle carries 0 of the 14 metric
  files and the PDF endpoint throws `ENOENT` in production while working fine
  locally against a full `node_modules`.
- Both export routes declare `maxDuration = 30`, since a full-division roster can
  outrun the platform's 10-second default.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

```bash
npm run build && npm start   # production build
npm test                     # grading + e-ID unit tests
npm run typecheck            # TypeScript, no emit
npm run icons                # regenerate the PWA icon set
```

Install it as an app from the browser's install prompt (the header shows an
**Install** button when the browser offers one), then try it with the network off.

### Environment variables

Both are optional — the app runs fully without them.

| Variable | Effect |
| --- | --- |
| `NEXT_PUBLIC_API_BASE` | Points the offline sync queue at a real backend (`POST {base}/sync`). Unset, the queue simulates a successful round-trip. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Enables real Web Push subscriptions. Unset, notifications are shown locally through the service worker. |

---

## How it is built

- **Next.js 15 (App Router) + React 19 + Tailwind CSS** — static-exportable, no
  server dependency for the demo.
- **Dexie.js over IndexedDB** — every portal reads and writes locally first.
- **Custom service worker** (`public/sw.js`) — network-first navigations with an
  offline fallback, cache-first build assets, stale-while-revalidate for the rest,
  plus `push` and `notificationclick` handlers.
- **Web Crypto** — HMAC-SHA256 e-ID signatures, AES-256-GCM helpers and PBKDF2
  password hashing, no crypto dependencies.
- **No chart library** — the dashboards draw their own SVG, keeping the payload
  small on 3G.
- **ExcelJS + PDFKit behind two route handlers** — real `.xlsx` and PDF rendering
  stays on the server, so the phone downloads a finished file instead of a
  megabyte of formatting code.

### Exports

`Export XLSX` and `Download PDF` appear wherever a portal produces a document:
the five School Forms, the SF2 attendance summary, the class record, the IPCRF
portfolio, the learner's report card in both the Student and Parent portals, the
approval register, the LIS transmittal, the audit trails, and the division and
privacy packs.

| | Produced by | Notes |
| --- | --- | --- |
| `.xlsx` | `POST /api/export/xlsx` (ExcelJS) | Styled header, frozen panes, autofilter, sized columns, typed numeric cells, multi-sheet packs |
| `.pdf` | `POST /api/export/pdf` (PDFKit) | A4 portrait or landscape, repeating table headers across pages, page numbering, signature lines, optional embedded image (the e-ID card) |

Both endpoints are **stateless** — they format the payload the client already
holds and never read the database, so generating a document grants the server no
access to learner data it did not already have. Both bound every dimension of the
request (sheets, rows, columns, cell length, image size) before rendering. A
production deployment puts the session check and the `forms:export` permission in
front of them; the portals already write the export to the audit trail.

**Offline, exports still work.** With no connection the XLSX button saves a CSV
from the device and the PDF button opens the print dialog scoped to the form on
screen. The button says which path it took.

### What is real and what is simulated

This repository is a complete, runnable **front end**. To keep it usable with no
infrastructure, the demo build stands in for the backend in three places:

| Area | Demo build | Production path |
| --- | --- | --- |
| Authentication | Seeded local user table, session in `localStorage` | DepEd GSuite OAuth 2.0, same `Session` shape and permission matrix |
| Persistence | IndexedDB via Dexie | PostgreSQL with Row-Level Security — schema in [`db/schema.sql`](db/schema.sql) |
| Sync upload | Queue drains against a simulated round-trip | `POST {NEXT_PUBLIC_API_BASE}/sync` with the same queue records |
| Push delivery | Service-worker local notifications | VAPID Web Push from the server |
| Document export | Real — the same ExcelJS/PDFKit routes run in both | Add the session check in front of the route |

Everything else — the grading engine, transmutation table, form generation, XLSX
and PDF rendering, e-ID signing and verification, RBAC, audit logging, offline
queueing and PWA install — is the real implementation and runs unchanged in
production.

Because the export endpoints are route handlers, the app needs a Node runtime
(`npm start`, a container, or any Node host). It is no longer a pure static
export; everything except `/api/export/*` still prerenders as static HTML.

---

## Project layout

```
src/
  app/                     route groups, one folder per portal
    login/ offline/ scanner/
    teacher/ student/ parent/ school-head/ sdo/ superadmin/
    api/export/xlsx/       ExcelJS workbook renderer
    api/export/pdf/        PDFKit document renderer
  components/              app shell, UI primitives, SVG charts, school forms, QR,
                           export buttons with offline fallbacks
  lib/
    deped-grading.ts       DO 8 s. 2015 weights + transmutation table
    eid.ts                 dynamic/static e-ID signing and verification
    crypto.ts              HMAC, AES-256-GCM, PBKDF2 over Web Crypto
    export-spec.ts         shared export contract + input validation
    form-specs.ts          SF1/SF2/SF5/SF9/SF10 projections for XLSX and PDF
    db.ts  store.ts        Dexie schema, seeding, reactive query hook
    queries.ts             reads and mutations shared by the portals
    sync.ts  audit.ts      offline queue, RA 10173 audit trail
    auth.ts  nav.ts        RBAC matrix, session handling, navigation
    i18n.ts                English, Tagalog, Ilokano, Cebuano
  data/seed.ts             deterministic synthetic school
db/schema.sql              PostgreSQL schema with RLS and anonymising views
docs/ARCHITECTURE.md       sync strategy, e-ID protocol, RBAC, privacy design
tests/                     grading, e-ID and export-contract unit tests (node:test)
```

---

## Accessibility and field constraints

- Minimum 48×48 px touch targets; bottom navigation on phones, sidebar on desktop.
- High-contrast scanner kiosk with an audible chime for noisy gates.
- Works down to 414 px with no horizontal scrolling; honours
  `prefers-reduced-motion`.
- UI localised in English, Tagalog, Ilokano and Cebuano, switchable in one tap.

## Privacy

Built against the Data Privacy Act of 2012 (RA 10173): least-privilege RBAC,
Learner Reference Numbers masked by default, an append-only audit trail of every
PII access and export, and anonymising views so division and regional dashboards
see risk indicators rather than identities.
