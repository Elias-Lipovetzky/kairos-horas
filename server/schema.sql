CREATE TABLE IF NOT EXISTS schema_versions (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
 password_hash text NOT NULL, role text NOT NULL CHECK(role IN ('admin','rrhh')),
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS employees (
 id uuid PRIMARY KEY, name text NOT NULL, dni text NOT NULL UNIQUE, phone text NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS owners (
 id uuid PRIMARY KEY, name text NOT NULL, phone text NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS places (
 id uuid PRIMARY KEY, name text NOT NULL, address text NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS place_owners (
 place_id uuid REFERENCES places(id), owner_id uuid REFERENCES owners(id), is_primary boolean NOT NULL DEFAULT false,
 PRIMARY KEY(place_id,owner_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_primary_owner ON place_owners(place_id) WHERE is_primary;
CREATE TABLE IF NOT EXISTS records (
 id uuid PRIMARY KEY, employee_id uuid NOT NULL REFERENCES employees(id), place_id uuid NOT NULL REFERENCES places(id),
 date date NOT NULL, start_time time, end_time time, minutes integer NOT NULL CHECK(minutes > 0),
 version integer NOT NULL DEFAULT 1, created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, deleted_by uuid REFERENCES users(id),
 CHECK ((start_time IS NULL AND end_time IS NULL) OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time))
);
CREATE INDEX IF NOT EXISTS records_search ON records(employee_id,date,place_id) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS audit (
 id bigserial PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), entity text NOT NULL, entity_id uuid NOT NULL,
 action text NOT NULL, before_data jsonb, after_data jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notifications (
 id bigserial PRIMARY KEY, record_id uuid NOT NULL REFERENCES records(id), audit_id bigint NOT NULL REFERENCES audit(id),
 reason text NOT NULL, details jsonb NOT NULL DEFAULT '{}', reviewed_by uuid REFERENCES users(id), reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS password_resets (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS submissions (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), payload_hash text NOT NULL, result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS login_attempts (
 key text PRIMARY KEY, attempts integer NOT NULL DEFAULT 0, resets_at timestamptz NOT NULL
);
INSERT INTO schema_versions(version) VALUES(1) ON CONFLICT DO NOTHING;
