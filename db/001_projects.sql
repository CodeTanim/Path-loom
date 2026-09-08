CREATE TABLE IF NOT EXISTS pathloom_projects (
  owner_id text NOT NULL,
  id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 128),
  document jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (owner_id, id),
  CHECK (jsonb_typeof(document) = 'object'),
  CHECK (document ->> 'id' IS NOT NULL AND document ->> 'id' = id)
);

CREATE INDEX IF NOT EXISTS pathloom_projects_owner_updated_idx
  ON pathloom_projects (owner_id, updated_at DESC);
