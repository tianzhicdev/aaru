-- Soul System V2: Visible + Hidden soul files, reflection notes
-- Migrates from single soul_files table to dual soul file architecture

-- ── New tables ─────────────────────────────────────────────────

CREATE TABLE visible_soul_files (
  user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  version              INT NOT NULL DEFAULT 1,
  last_updated         TIMESTAMPTZ NOT NULL DEFAULT now(),
  portrait             TEXT,
  how_you_move         TEXT DEFAULT '',
  how_you_think        TEXT DEFAULT '',
  how_you_connect      TEXT DEFAULT '',
  what_you_carry       TEXT DEFAULT '',
  what_lights_you_up   TEXT DEFAULT '',
  your_contradictions  TEXT DEFAULT '',
  your_voice           TEXT DEFAULT '',
  crystallized_moments JSONB DEFAULT '[]'::jsonb,
  open_threads         JSONB DEFAULT '[]'::jsonb,
  created_at           TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE hidden_soul_files (
  user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  version              INT NOT NULL DEFAULT 1,
  last_updated         TIMESTAMPTZ NOT NULL DEFAULT now(),
  confidence           TEXT NOT NULL DEFAULT 'low'
    CHECK (confidence IN ('low', 'medium', 'high')),
  expert_reflections   JSONB DEFAULT '{}'::jsonb,
  core_drivers         JSONB DEFAULT '[]'::jsonb,
  core_values          JSONB DEFAULT '[]'::jsonb,
  voice                JSONB DEFAULT '{}'::jsonb,
  depth_map            JSONB DEFAULT '{}'::jsonb,
  analyst_notes        JSONB DEFAULT '[]'::jsonb,
  created_at           TIMESTAMPTZ DEFAULT now()
);

-- ── Add reflection_notes to soul_sessions ──────────────────────

ALTER TABLE soul_sessions ADD COLUMN IF NOT EXISTS reflection_notes JSONB DEFAULT '[]'::jsonb;

-- Update status check constraint to include 'synthesizing'
ALTER TABLE soul_sessions DROP CONSTRAINT IF EXISTS soul_sessions_status_check;
ALTER TABLE soul_sessions ADD CONSTRAINT soul_sessions_status_check
  CHECK (status IN ('in_session', 'extracting', 'synthesizing', 'complete', 'failed'));

-- ── Migrate existing soul_files → visible_soul_files ───────────

INSERT INTO visible_soul_files (user_id, version, last_updated, portrait, what_lights_you_up, what_you_carry, your_contradictions, crystallized_moments)
SELECT
  user_id,
  1,
  COALESCE(updated_at, now()),
  essence,
  comes_alive,
  running_from,
  CASE
    WHEN jsonb_array_length(tensions) > 0 THEN
      (SELECT string_agg((elem ->> 'left') || ' — ' || (elem ->> 'right'), '. ')
       FROM jsonb_array_elements(tensions) AS elem)
    ELSE ''
  END,
  CASE
    WHEN jsonb_array_length(your_words) > 0 THEN
      (SELECT jsonb_agg(jsonb_build_object('quote', elem, 'reflection', ''))
       FROM jsonb_array_elements_text(your_words) AS elem)
    ELSE '[]'::jsonb
  END
FROM soul_files
ON CONFLICT (user_id) DO NOTHING;
