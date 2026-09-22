# LC-DepEd — Architecture notes

Companion to the [README](../README.md). Covers the four areas the project brief
asks for: offline sync, the form/grading engine, the e-ID protocol, and the
privacy/RBAC design.

---

## 1. Offline-first data flow

```
UI action ──► Dexie (IndexedDB)  ──►  sync queue row  ──►  drain  ──►  API
   │               │                                           │
   │               └── render immediately (optimistic)          └── mark syncState = 'synced'
   └── "Saved Locally ✓"
```

Records carry a `syncState` of `synced | pending | conflict`. A write never waits
for the network:

1. `queries.ts` writes the record to Dexie and calls `enqueue()`.
2. `sync.ts` stores a queue row `{entity, op, recordId, payload, createdAt, attempts}`.
3. The drain runs on the `online` event, on a 30-second timer, on a service-worker
   Background Sync wake-up, and 1.5 s after boot.
4. On success the queue row is deleted and the record flips to `synced`. On failure
   it is marked `failed` and retried on the next drain.

**Conflict rule.** Attendance and grades use deterministic IDs
(`att-<studentId>-<date>`, `grd-<studentId>-<subjectId>-q<n>`), so two devices
editing the same cell converge instead of duplicating. The server keeps the row
with the newer `client_updated_at` (last-write-wins per cell) and records the
loser in `sync_receipts` with `conflict = true` for review. Cell-level granularity
means two teachers marking different learners never collide.

**Cache strategy** (`public/sw.js`):

| Request | Strategy |
| --- | --- |
| Navigations | Network-first → runtime cache → `/offline` |
| `/_next/static/*`, icons, fonts | Cache-first (immutable build output) |
| Everything else same-origin | Stale-while-revalidate |

---

## 2. Grading and form engine

`src/lib/deped-grading.ts` implements DepEd Order No. 8, s. 2015 end to end:

1. **Percentage score** per component = Σ raw ÷ Σ highest possible × 100.
2. **Weighted score** = PS × component weight, where the weights depend on the
   subject group (Languages/AP/EsP 30-50-20, Science & Math 40-40-20, MAPEH/EPP/TLE
   20-60-20, and the three SHS groupings).
3. **Initial grade** = WS(WW) + WS(PT) + WS(QA).
4. **Transmutation** to the quarterly grade via Table 5 of the enclosure.

The transmutation is computed in hundredths rather than floating-point steps:

```ts
const hundredths = Math.round(ig * 100);
if (hundredths >= 6000) return 75 + Math.floor((hundredths - 6000) / 160);
return 60 + Math.floor(hundredths / 400);
```

Using `(ig - 60) / 1.6` directly drops a grade at table boundaries — `96.8 - 60`
evaluates to `36.799999999999997`, which floors to 22 steps instead of 23 and
yields 97 where the table says 98. `tests/deped-grading.test.ts` pins every
boundary in the published table.

Final subject grade is the mean of posted quarters; the general average is the
mean of final grades; honours follow DepEd Order No. 36, s. 2016.

**Forms** are projections over the same records, not separate data entry:

| Form | Source |
| --- | --- |
| SF1 School Register | `students` + `enrollments` |
| SF2 Daily Attendance | `attendance`, tallied per month (late still counts as a day present) |
| SF5 Promotion Report | computed report card per learner + promotion rule |
| SF9 Report Card | quarterly grades + attendance summary |
| SF10 Permanent Record | scholastic record across school years |

### Document rendering

Each form has exactly one projection — `formTable()` in `src/lib/form-specs.ts` —
and both output formats consume it, so the spreadsheet, the PDF and the on-screen
table can never drift apart. The Student, Parent and Teacher portals all build the
same SF9 through `sf9Context()`.

```
Dexie records ──► formTable() ──┬──► formWorkbookSpec() ──► POST /api/export/xlsx ──► ExcelJS ──► .xlsx
                                ├──► formPdfSpec()      ──► POST /api/export/pdf  ──► PDFKit  ──► .pdf
                                └──► React table                                            ──► screen
```

**Why server-side.** ExcelJS and PDFKit together are several megabytes. Shipping
them to a phone on 3G to save one attendance report would defeat the bandwidth
budget the rest of the app is designed around, so the rendering lives behind two
route handlers and the device downloads a finished file.

**Why they are safe.** Both endpoints are stateless: they format the payload the
caller already holds and never touch the database, so calling them grants no
access to learner data. Both bound every dimension of the request before any
rendering starts — sheets, rows, columns, cell length, note count, image bytes,
orientation — and sanitise the download filename so it cannot escape the
directory (`safeFilename`) or break Excel's sheet-name rules (`safeSheetName`).
`tests/export-spec.test.ts` pins that contract. In production the routes sit
behind the session check and the `forms:export` permission.

**Offline.** Exports are the one feature that genuinely needs the network, so
each button degrades instead of failing: the XLSX button writes a UTF-8 CSV (with
BOM, so Excel reads accents correctly) from data already on the device, and the
PDF button opens the browser print dialog scoped to the rendered form through a
print stylesheet. The button label reports which path it took.

**XLSX specifics.** Title and meta block above the table, brand-filled bold header
row, frozen panes and an autofilter on the header, column widths derived from the
longest value, numeric cells written as numbers (not strings) with a `0.0"%"`
format for rates, a shaded totals row, and italic notes underneath. Multi-sheet
packs are used where a single table would lose context — the division report
carries Enrolment / Report intake / Dropout risk, and the privacy pack carries PII
access / Compliance / Permission matrix.

**PDF specifics.** A4, portrait or landscape chosen by column count, DepEd header
block, two-column meta grid, a table whose header repeats on every page, automatic
pagination with `Page n of m` numbering, notes, and signature rules. The learner
e-ID card embeds the learner portrait and the QR side by side as PNGs.

---

## 3. Learner e-ID protocol

Payload: `LCD1|<lrn>|<signature>`

- `signature` = first 24 base64url characters of
  `HMAC-SHA256(learnerSecret, "LCD1|<lrn>")`.

Each learner has exactly one code. It is derived from their LRN and a secret only
the school holds, so it is unique per learner, stable forever, and identical on
the printed card and on screen.

Properties:

- **No PII in the code.** Only the LRN and a signature — no name, address or
  contact number is ever encoded.
- **Unforgeable without the secret.** Swapping the LRN inside someone else's
  payload invalidates the signature, which `tests/eid.test.ts` pins directly.
- **Offline verification.** The kiosk recomputes the HMAC from its own copy of the
  learner secret, so gates work with no connectivity — and, because no clock is
  involved, a kiosk with a wrong clock verifies just as well.
- **Revocation.** A lost card is handled by re-issuing the learner secret: every
  previous code stops verifying immediately.
- **Rejections are logged** with a reason (`malformed`, `unknown_learner`,
  `bad_signature`), and the scanner debounces repeat frames of the same payload
  for 4 seconds.

In production the learner secret stays server-side (`students.eid_secret_enc`,
encrypted with pgcrypto) and is delivered to the learner's device and to gate
kiosks over an authenticated channel.

### Learner portrait

The ID card carries the learner's photo. `Student.photoUrl` holds the photo;
where none exists, `lib/learner-photo.ts` generates a stable portrait from a hash
of the LRN, so the same learner shows the same picture on every device and no
card is ever a blank frame. The portrait appears in the teacher's roster, in the
learner detail alongside the e-ID QR, and — rendered to PNG through a canvas,
since PDFKit takes no SVG — on the printed card.

A photo is set from either side: the teacher sets it on the learner detail, and
the learner sets their own on the e-ID screen. `components/photo-capture.tsx`
offers both routes — **Upload photo**, and **Take a photo**, which opens the
device camera through `getUserMedia` with a live preview and a shutter (the file
input also carries `capture="user"`, so a phone offers its camera directly). Both
routes centre-crop to the 4:5 ID ratio and downscale to 480px JPEG before
storing, so a 12-megapixel phone photo does not land in IndexedDB. Photos are
personal data, so setting or removing one writes an audit entry.

## 4. Security, RBAC and RA 10173

**Permission matrix** (`src/lib/auth.ts`) — roles hold explicit permissions such as
`attendance:write`, `forms:approve`, `learner:pii:read`, `audit:read:global`,
`gate:scan`. Routes check the role, and sensitive actions check the permission;
`/scanner` for example requires `gate:scan`, which parents and learners do not hold.

**Tenant isolation** is enforced in the database, not just the app. Every
tenant-scoped table has `FORCE ROW LEVEL SECURITY` with a policy comparing
`tenant_id` to the `app.tenant_id` session GUC, so a bug in the API cannot leak
another school's learners.

**Audit trail.** `logAudit()` records actor, role, action, target, whether PII was
touched, and the outcome. In PostgreSQL the table is append-only (an `UPDATE`/`DELETE`
trigger raises) and each row is hash-chained to its predecessor, so tampering is
detectable during a National Privacy Commission review.

**Data minimisation.** LRNs are masked (`136••••••001`) unless a user with
`learner:pii:read` explicitly reveals them — and revealing writes an audit entry.
Division and regional dashboards read `v_division_learners`, `v_division_attendance`
and `v_dropout_risk`, which expose a keyed pseudonym rather than an identity.

**Encryption.** TLS 1.3 in transit; AES-256-GCM for sensitive local payloads
(`crypto.ts`) and pgcrypto for guardian contacts and e-ID secrets at rest. Break-glass
passwords are PBKDF2-SHA256 with 120,000 iterations; the normal path is GSuite OAuth.

**Retention.** `retention_days` (default 1825 = 5 years after a learner leaves)
drives the anonymisation job; audit entries are retained independently.

---

## 5. Testing

- `npm test` — 26 unit tests over the transmutation table, component weighting,
  promotion/honours rules, e-ID signing, drift tolerance, tampering, expiry and
  per-learner uniqueness, LRN swapping, tampering and malformed input, plus the
  export contract (filename and sheet-name
  sanitising, every size limit, and the image allow-list).
- `npm run typecheck` — strict TypeScript across the app.
- `npm run build` — all routes prerender.

Browser-level verification during development covered every portal route for all
six demo accounts (zero console errors), the full interaction set (attendance,
grading, form generation and approval, DLL, IPCRF, NTP routing, LIS sync, intake
revalidation, tenant provisioning, flags, VAPID rotation), and PWA behaviour:
service-worker activation, offline navigation from cache, offline writes landing in
the queue, automatic drain on reconnect, and the offline fallback page.

Every export button was driven in the browser and the downloaded files inspected:
the workbooks were re-opened with an independent Excel parser (sheet names, frozen
panes, autofilters, column widths, typed numeric cells, number formats, header
fill), and the PDFs were parsed for page count, repeated table headers across
pages, expected text, embedded images, page numbering, and text drawn outside the
page box. The offline path was exercised with the network disabled to confirm the
CSV and print fallbacks.
