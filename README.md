# LC-DepEd — DepEd School Management & Automation PWA

An offline-first Progressive Web App for Philippine public schools: attendance,
DepEd Order No. 8 s. 2015 grading, School Forms automation (SF1–SF10), a dynamic
student e-ID for gate security, and free Web Push alerts for guardians instead of
paid SMS.

Six role-based portals ship in one installable app:

| Portal | What it does |
| --- | --- |
| **Teacher** | One-tap attendance, DO 8 s. 2015 class record, SF1/SF2/SF5/SF9/SF10 generation, MATATAG Daily Lesson Log builder with voice input, IPCRF/RPMS portfolio |
| **Learner** | Grades and attendance, dynamic HMAC-signed e-ID QR, offline Self-Learning Kits |
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
6. Open `/scanner` as the teacher or school head, paste that e-ID payload into
   manual entry — it verifies, chimes, and pushes an alert.
7. Sign in as the **parent** → **Gate Alerts** to see the notification land.

---

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

### What is real and what is simulated

This repository is a complete, runnable **front end**. To keep it usable with no
infrastructure, the demo build stands in for the backend in three places:

| Area | Demo build | Production path |
| --- | --- | --- |
| Authentication | Seeded local user table, session in `localStorage` | DepEd GSuite OAuth 2.0, same `Session` shape and permission matrix |
| Persistence | IndexedDB via Dexie | PostgreSQL with Row-Level Security — schema in [`db/schema.sql`](db/schema.sql) |
| Sync upload | Queue drains against a simulated round-trip | `POST {NEXT_PUBLIC_API_BASE}/sync` with the same queue records |
| Push delivery | Service-worker local notifications | VAPID Web Push from the server |

Everything else — the grading engine, transmutation table, form generation, e-ID
signing and verification, RBAC, audit logging, offline queueing and PWA install —
is the real implementation and runs unchanged in production.

Exports are CSV (UTF-8 with BOM, opens directly in Excel) and print-to-PDF through
the browser, so no document-generation service is required.

---

## Project layout

```
src/
  app/                     route groups, one folder per portal
    login/ offline/ scanner/
    teacher/ student/ parent/ school-head/ sdo/ superadmin/
  components/              app shell, UI primitives, SVG charts, school forms, QR
  lib/
    deped-grading.ts       DO 8 s. 2015 weights + transmutation table
    eid.ts                 dynamic/static e-ID signing and verification
    crypto.ts              HMAC, AES-256-GCM, PBKDF2 over Web Crypto
    db.ts  store.ts        Dexie schema, seeding, reactive query hook
    queries.ts             reads and mutations shared by the portals
    sync.ts  audit.ts      offline queue, RA 10173 audit trail
    auth.ts  nav.ts        RBAC matrix, session handling, navigation
    i18n.ts                English, Tagalog, Ilokano, Cebuano
  data/seed.ts             deterministic synthetic school
db/schema.sql              PostgreSQL schema with RLS and anonymising views
docs/ARCHITECTURE.md       sync strategy, e-ID protocol, RBAC, privacy design
tests/                     grading and e-ID unit tests (node:test)
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
