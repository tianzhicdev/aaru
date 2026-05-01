-- Match-mode profile additions: optional bio + up to 3 camera photos per user.
-- Photos live in their own table so soulmate_profiles reads stay cheap and we
-- can swap to R2 later without rewriting hot queries.

ALTER TABLE soulmate_profiles
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS photo_count int NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS soulmate_photos (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idx        int  NOT NULL CHECK (idx BETWEEN 0 AND 2),
  data       bytea NOT NULL,
  mime_type  text NOT NULL DEFAULT 'image/jpeg',
  byte_size  int  NOT NULL,
  etag       text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, idx)
);
