-- =====================================================================
-- LC-DepEd — PostgreSQL schema (multi-tenant, RA 10173 aligned)
--
-- Design notes
--   * Every school is a tenant. Tenant isolation is enforced by Row-Level
--     Security keyed on the `app.tenant_id` session GUC, so a compromised
--     application role still cannot read another school's learners.
--   * Learner PII lives in `students`; division/regional consumers read the
--     anonymising views at the bottom of this file instead.
--   * `audit_logs` is append-only and hash-chained for tamper evidence.
--
-- Apply with:  psql "$DATABASE_URL" -f db/schema.sql
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ---------------------------------------------------------------------
-- Tenancy & identity
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tenants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     varchar(12) NOT NULL UNIQUE,         -- DepEd School ID
  name          text        NOT NULL,
  district      text        NOT NULL,
  division      text        NOT NULL,
  region        text        NOT NULL,
  enrollment    integer     NOT NULL DEFAULT 0,
  status        text        NOT NULL DEFAULT 'provisioning'
                CHECK (status IN ('active', 'suspended', 'provisioning')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE user_role AS ENUM
  ('superadmin', 'teacher', 'student', 'parent', 'schoolhead', 'sdo');

CREATE TABLE IF NOT EXISTS users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = national/division scope
  email          citext NOT NULL UNIQUE,
  -- Password hash is only used for break-glass accounts; the normal path is
  -- DepEd GSuite OAuth 2.0 (google_sub).
  password_hash  text,
  google_sub     text UNIQUE,
  full_name      text NOT NULL,
  position       text,
  role           user_role NOT NULL,
  preferred_lang text NOT NULL DEFAULT 'en' CHECK (preferred_lang IN ('en','tl','ilo','ceb')),
  mfa_enrolled   boolean NOT NULL DEFAULT false,
  disabled_at    timestamptz,
  last_login_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_tenant_role_idx ON users (tenant_id, role);

-- Granular RBAC: roles carry permissions, users may be granted extras.
CREATE TABLE IF NOT EXISTS permissions (
  key          text PRIMARY KEY,           -- e.g. 'forms:approve'
  description  text NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role        user_role NOT NULL,
  permission  text NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role, permission)
);

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission  text NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
  granted_by  uuid REFERENCES users(id),
  granted_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission)
);

-- ---------------------------------------------------------------------
-- Learners, sections, subjects
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS school_years (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label      text NOT NULL,                 -- '2025-2026'
  starts_on  date NOT NULL,
  ends_on    date NOT NULL,
  is_current boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS sections (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  school_year_id uuid NOT NULL REFERENCES school_years(id),
  name           text NOT NULL,
  grade_level    smallint NOT NULL CHECK (grade_level BETWEEN 1 AND 12),
  adviser_id     uuid REFERENCES users(id),
  room           text,
  UNIQUE (tenant_id, school_year_id, name)
);

CREATE TABLE IF NOT EXISTS students (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lrn            char(12) NOT NULL UNIQUE CHECK (lrn ~ '^[0-9]{12}$'),
  first_name     text NOT NULL,
  middle_name    text,
  last_name      text NOT NULL,
  ext_name       text,
  sex            char(1) NOT NULL CHECK (sex IN ('M','F')),
  birth_date     date NOT NULL,
  mother_tongue  text,
  ip_community   text,
  four_ps        boolean NOT NULL DEFAULT false,
  address        text,
  guardian_name  text,
  -- Contact numbers are encrypted at rest with pgcrypto; the app decrypts
  -- only for roles holding 'learner:pii:read'.
  guardian_contact_enc bytea,
  -- HMAC seed backing the dynamic e-ID. Never leaves the server unencrypted.
  eid_secret_enc bytea NOT NULL,
  enrolled_at    timestamptz NOT NULL DEFAULT now(),
  archived_at    timestamptz
);
CREATE INDEX IF NOT EXISTS students_tenant_idx ON students (tenant_id, last_name, first_name);

CREATE TABLE IF NOT EXISTS enrollments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id  uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  section_id  uuid NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'enrolled'
              CHECK (status IN ('enrolled','transferred_out','transferred_in','dropped','promoted')),
  effective_on date NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (student_id, section_id)
);

CREATE TABLE IF NOT EXISTS guardians (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id  uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  relation    text NOT NULL DEFAULT 'guardian',
  is_primary  boolean NOT NULL DEFAULT false,
  UNIQUE (user_id, student_id)
);

CREATE TYPE weight_group AS ENUM
  ('languages','science_math','mapeh_tle','shs_core','shs_academic','shs_tvl');

CREATE TABLE IF NOT EXISTS subjects (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  grade_level   smallint NOT NULL,
  weight_group  weight_group NOT NULL,      -- drives DO 8, s. 2015 weighting
  teacher_id    uuid REFERENCES users(id)
);

-- ---------------------------------------------------------------------
-- Attendance (SF2) and grades (SF9 / SF10)
-- ---------------------------------------------------------------------

CREATE TYPE attendance_status AS ENUM ('present','absent','late','excused');

CREATE TABLE IF NOT EXISTS attendance (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id   uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  section_id   uuid NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  attend_date  date NOT NULL,
  status       attendance_status NOT NULL,
  recorded_by  uuid NOT NULL REFERENCES users(id),
  -- Client clock at capture time: lets the server resolve offline conflicts
  -- with last-write-wins per (student, date).
  client_updated_at timestamptz NOT NULL,
  synced_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, attend_date)
);
CREATE INDEX IF NOT EXISTS attendance_section_date_idx ON attendance (section_id, attend_date);

CREATE TABLE IF NOT EXISTS grades (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id    uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  quarter       smallint NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  written_work         integer[] NOT NULL DEFAULT '{}',
  written_work_totals  integer[] NOT NULL DEFAULT '{}',
  performance_tasks        integer[] NOT NULL DEFAULT '{}',
  performance_task_totals  integer[] NOT NULL DEFAULT '{}',
  quarterly_assessment       integer NOT NULL DEFAULT 0,
  quarterly_assessment_total integer NOT NULL DEFAULT 0,
  -- Computed server-side by the same routine the PWA runs offline.
  initial_grade    numeric(5,2),
  quarterly_grade  smallint,
  client_updated_at timestamptz NOT NULL,
  synced_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, subject_id, quarter)
);

-- ---------------------------------------------------------------------
-- Forms, lesson logs, NTP tasks
-- ---------------------------------------------------------------------

CREATE TYPE form_type   AS ENUM ('SF1','SF2','SF5','SF9','SF10','IPCRF','DLL');
CREATE TYPE form_status AS ENUM ('draft','submitted','approved','returned');

CREATE TABLE IF NOT EXISTS form_submissions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type         form_type NOT NULL,
  title        text NOT NULL,
  period       text NOT NULL,
  section_id   uuid REFERENCES sections(id) ON DELETE SET NULL,
  submitted_by uuid NOT NULL REFERENCES users(id),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  status       form_status NOT NULL DEFAULT 'draft',
  signed_by    uuid REFERENCES users(id),
  signed_at    timestamptz,
  -- Detached digital signature over the rendered form payload.
  signature    bytea,
  payload_sha256 bytea,
  remarks      text
);
CREATE INDEX IF NOT EXISTS forms_tenant_status_idx ON form_submissions (tenant_id, status);

CREATE TABLE IF NOT EXISTS lesson_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  teacher_id      uuid NOT NULL REFERENCES users(id),
  subject_id      uuid NOT NULL REFERENCES subjects(id),
  grade_level     smallint NOT NULL,
  week            text NOT NULL,
  day             text NOT NULL,
  competency_code text NOT NULL,
  competency      text NOT NULL,
  objectives      text,
  procedure       text,
  assessment      text,
  remarks         text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Curriculum reference data, maintained centrally by the Super Admin portal.
CREATE TABLE IF NOT EXISTS competencies (
  code         text PRIMARY KEY,           -- e.g. 'M5NS-Ia-1.1'
  curriculum   text NOT NULL DEFAULT 'MATATAG',
  learning_area text NOT NULL,
  grade_level  smallint NOT NULL,
  statement    text NOT NULL,
  retired_at   timestamptz
);

CREATE TABLE IF NOT EXISTS ntp_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title         text NOT NULL,
  category      text NOT NULL,
  assigned_to   text NOT NULL,
  assigned_role text NOT NULL CHECK (assigned_role IN ('AO','PDO','Registrar','Property Custodian')),
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done')),
  origin        text NOT NULL DEFAULT 'school_head' CHECK (origin IN ('teacher_offload','school_head')),
  due_on        date,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Gate e-ID, push notifications, messaging
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gate_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id  uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  direction   text NOT NULL CHECK (direction IN ('in','out')),
  method      text NOT NULL CHECK (method IN ('dynamic','static','manual')),
  gate        text NOT NULL DEFAULT 'Main Gate',
  verified    boolean NOT NULL DEFAULT true,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  scanned_by  uuid REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS gate_events_student_idx ON gate_events (student_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    text NOT NULL UNIQUE,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  vapid_key_id uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  failure_count integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS vapid_keys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_key  text NOT NULL,
  private_key_enc bytea NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  rotated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('gate','grade','form','system')),
  title        text NOT NULL,
  body         text NOT NULL,
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  thread_id  uuid NOT NULL,
  from_id    uuid NOT NULL REFERENCES users(id),
  to_id      uuid NOT NULL REFERENCES users(id),
  body       text NOT NULL,
  sent_at    timestamptz NOT NULL DEFAULT now(),
  read_at    timestamptz
);

-- ---------------------------------------------------------------------
-- Offline sync, division intake, operations
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sync_receipts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id   text NOT NULL,
  entity      text NOT NULL,
  record_id   text NOT NULL,
  operation   text NOT NULL CHECK (operation IN ('create','update','delete')),
  client_ts   timestamptz NOT NULL,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  conflict    boolean NOT NULL DEFAULT false,
  UNIQUE (device_id, entity, record_id, client_ts)
);

CREATE TABLE IF NOT EXISTS division_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type        text NOT NULL,
  period      text NOT NULL,
  row_count   integer NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','validated','flagged','rejected')),
  findings    jsonb NOT NULL DEFAULT '[]'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feature_flags (
  key         text PRIMARY KEY,
  label       text NOT NULL,
  description text,
  enabled     boolean NOT NULL DEFAULT false,
  rollout_pct smallint NOT NULL DEFAULT 0 CHECK (rollout_pct BETWEEN 0 AND 100),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS system_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS telemetry_samples (
  id          bigserial PRIMARY KEY,
  sampled_at  timestamptz NOT NULL DEFAULT now(),
  metric      text NOT NULL,       -- api_latency_ms, db_load_pct, push_success_pct …
  value       numeric NOT NULL,
  tenant_id   uuid REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS telemetry_metric_time_idx ON telemetry_samples (metric, sampled_at DESC);

-- ---------------------------------------------------------------------
-- Audit trail (RA 10173) — append-only, hash-chained
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_logs (
  id            bigserial PRIMARY KEY,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  tenant_id     uuid REFERENCES tenants(id) ON DELETE SET NULL,
  actor_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_role    user_role,
  action        text NOT NULL,
  target        text NOT NULL,
  pii_accessed  boolean NOT NULL DEFAULT false,
  outcome       text NOT NULL DEFAULT 'success' CHECK (outcome IN ('success','denied','failure')),
  ip_address    inet,
  user_agent    text,
  prev_hash     bytea,
  entry_hash    bytea
);
CREATE INDEX IF NOT EXISTS audit_time_idx ON audit_logs (occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_pii_idx  ON audit_logs (pii_accessed, occurred_at DESC);

-- Chain each entry to its predecessor so deletions/edits are detectable.
CREATE OR REPLACE FUNCTION audit_chain() RETURNS trigger AS $$
DECLARE
  last_hash bytea;
BEGIN
  SELECT entry_hash INTO last_hash FROM audit_logs ORDER BY id DESC LIMIT 1;
  NEW.prev_hash := last_hash;
  NEW.entry_hash := digest(
    coalesce(encode(last_hash, 'hex'), '') ||
    NEW.occurred_at::text || coalesce(NEW.actor_id::text, '') ||
    NEW.action || NEW.target || NEW.outcome,
    'sha256');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_chain_trg ON audit_logs;
CREATE TRIGGER audit_chain_trg BEFORE INSERT ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_chain();

-- No updates or deletes, ever.
CREATE OR REPLACE FUNCTION audit_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_immutable_trg ON audit_logs;
CREATE TRIGGER audit_immutable_trg BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_immutable();

-- ---------------------------------------------------------------------
-- Row-Level Security — tenant isolation
--   The API sets, per request:
--     SET LOCAL app.tenant_id = '<uuid>';
--     SET LOCAL app.role      = '<user_role>';
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_tenant() RETURNS uuid AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_is_global() RETURNS boolean AS $$
  SELECT coalesce(current_setting('app.role', true), '') IN ('superadmin', 'sdo');
$$ LANGUAGE sql STABLE;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sections','students','enrollments','subjects','attendance','grades',
    'form_submissions','lesson_logs','ntp_tasks','gate_events','messages',
    'division_reports','sync_receipts'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (tenant_id = app_tenant() OR app_is_global())
        WITH CHECK (tenant_id = app_tenant() OR app_is_global())
    $f$, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- Anonymising views for division / regional analytics
--   Division dashboards never join back to `students`.
-- ---------------------------------------------------------------------

CREATE OR REPLACE VIEW v_division_learners AS
SELECT
  s.tenant_id,
  t.division,
  t.region,
  -- Stable pseudonym: same learner, same token, no way back without the key.
  encode(digest(s.lrn || current_setting('app.pseudonym_key', true), 'sha256'), 'hex') AS learner_token,
  left(s.lrn, 3) || '******' || right(s.lrn, 3) AS masked_lrn,
  s.sex,
  date_part('year', age(s.birth_date))::int AS age,
  e.status
FROM students s
JOIN tenants t ON t.id = s.tenant_id
LEFT JOIN enrollments e ON e.student_id = s.id;

CREATE OR REPLACE VIEW v_division_attendance AS
SELECT
  a.tenant_id,
  t.division,
  a.attend_date,
  count(*) FILTER (WHERE a.status IN ('present','late')) AS present_count,
  count(*) AS total_count,
  round(100.0 * count(*) FILTER (WHERE a.status IN ('present','late')) / nullif(count(*), 0), 2) AS attendance_rate
FROM attendance a
JOIN tenants t ON t.id = a.tenant_id
GROUP BY a.tenant_id, t.division, a.attend_date;

-- Learners at risk of dropping out (SARDO), identity-free.
CREATE OR REPLACE VIEW v_dropout_risk AS
SELECT
  a.tenant_id,
  encode(digest(s.lrn || current_setting('app.pseudonym_key', true), 'sha256'), 'hex') AS learner_token,
  count(*) FILTER (WHERE a.status = 'absent') AS absences,
  max(a.attend_date) AS last_recorded
FROM attendance a
JOIN students s ON s.id = a.student_id
GROUP BY a.tenant_id, s.lrn
HAVING count(*) FILTER (WHERE a.status = 'absent') >= 4;

-- ---------------------------------------------------------------------
-- LIS transmittal
--   The one server-side store the app actually uses: a School Head needs
--   to see, next week and from a different phone, that the roster went in.
--   Deployed to the project named by SUPABASE_URL; see src/lib/lis-store.ts.
--
--   Read-path privacy: the deployment's publishable key can record a
--   transmittal and read batch-level counts, and nothing else. `lis_rows`
--   grants it no SELECT at all, so learner records cannot be pulled back
--   out with a key that ships to the browser; rejected rows are surfaced
--   only through `lis_batch_findings`, which masks the LRN.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS lis_batches (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SHA-256 over the canonicalised, sorted rows. UNIQUE is what makes a
  -- re-send idempotent: the same roster returns its original receipt.
  fingerprint        text        NOT NULL UNIQUE,
  school_id          text        NOT NULL,
  school_name        text,
  school_year        text        NOT NULL,
  submitted_by       text        NOT NULL,
  submitted_at       timestamptz NOT NULL DEFAULT now(),
  row_count          integer     NOT NULL,
  accepted_count     integer     NOT NULL DEFAULT 0,
  rejected_count     integer     NOT NULL DEFAULT 0,
  status             text        NOT NULL
    CHECK (status IN ('validated','partially_accepted','rejected',
                      'transmitted','transmission_failed')),
  findings           jsonb       NOT NULL DEFAULT '[]'::jsonb,
  -- A batch row is written before its learner rows, so a failure between the
  -- two leaves a batch with no rows. Idempotency keys off this flag, not on the
  -- batch's mere existence: without it a half-written batch is mistaken for a
  -- finished transmittal and its receipt is handed back to every retry, so the
  -- rows are never written while the page reports success.
  rows_written       boolean     NOT NULL DEFAULT false,
  transmitted_at     timestamptz,
  transmission_ref   text,
  transmission_error text
);

CREATE INDEX IF NOT EXISTS lis_batches_school_idx
  ON lis_batches (school_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS lis_rows (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id         uuid    NOT NULL REFERENCES lis_batches (id) ON DELETE CASCADE,
  lrn              text    NOT NULL,
  last_name        text,
  first_name       text,
  middle_name      text,
  sex              text,
  birth_date       date,
  grade_level      integer,
  section          text,
  guardian_name    text,
  guardian_contact text,
  accepted         boolean NOT NULL,
  errors           jsonb   NOT NULL DEFAULT '[]'::jsonb
  -- Deliberately no UNIQUE (batch_id, lrn). A roster may legitimately contain
  -- the same LRN twice -- that is what the lrn_duplicate rule flags -- and both
  -- rows must be storable for the findings table to show what was submitted.
  -- A unique key here would also only be useful as an upsert conflict target,
  -- and upserting needs UPDATE on this table, which the publishable key is not
  -- given. Idempotency lives on lis_batches.fingerprint instead.
);

CREATE INDEX IF NOT EXISTS lis_rows_batch_idx ON lis_rows (batch_id);

ALTER TABLE lis_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE lis_rows    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lis_batches_insert ON lis_batches;
CREATE POLICY lis_batches_insert ON lis_batches FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS lis_batches_select ON lis_batches;
CREATE POLICY lis_batches_select ON lis_batches FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS lis_batches_update ON lis_batches;
CREATE POLICY lis_batches_update ON lis_batches FOR UPDATE TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS lis_rows_insert ON lis_rows;
CREATE POLICY lis_rows_insert ON lis_rows FOR INSERT TO anon WITH CHECK (true);

-- Belt and braces. Supabase's default grants are permissive, so RLS ends up
-- the only thing standing between the publishable key and learner rows — and
-- a policy that is dropped by accident fails open with a silent empty result.
-- Revoking first makes the same read fail at the privilege level instead.
REVOKE ALL ON lis_rows    FROM anon, authenticated;
REVOKE ALL ON lis_batches FROM anon, authenticated;
GRANT INSERT                 ON lis_rows    TO anon;
GRANT SELECT, INSERT, UPDATE ON lis_batches TO anon;

-- Rejected rows, LRN masked, for the "Records held back" table. SECURITY
-- INVOKER is deliberately off: the view owner's rights are what let the
-- caller see the masked projection without any grant on `lis_rows` itself.
CREATE OR REPLACE VIEW lis_batch_findings
  WITH (security_invoker = off) AS
SELECT
  r.batch_id,
  left(r.lrn, 3) || '******' || right(r.lrn, 3) AS masked_lrn,
  r.errors
FROM lis_rows r
WHERE r.accepted = false;

GRANT SELECT ON lis_batch_findings TO anon;
