ALTER TABLE public.reflection_snapshots
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

UPDATE public.reflection_snapshots
SET version = 1
WHERE version IS NULL;

ALTER TABLE public.reflection_snapshots
  DROP CONSTRAINT IF EXISTS reflection_snapshots_pkey;

ALTER TABLE public.reflection_snapshots
  ADD PRIMARY KEY (user_id, version);

ALTER TABLE public.visible_soul_files
  DROP CONSTRAINT IF EXISTS visible_soul_files_pkey;

ALTER TABLE public.visible_soul_files
  ADD PRIMARY KEY (user_id, version);

ALTER TABLE public.hidden_soul_files
  DROP CONSTRAINT IF EXISTS hidden_soul_files_pkey;

ALTER TABLE public.hidden_soul_files
  ADD PRIMARY KEY (user_id, version);

ALTER TABLE public.hidden_soul_files
  ADD COLUMN IF NOT EXISTS honest_insights jsonb DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_reflection_snapshots_latest
  ON public.reflection_snapshots (user_id, version DESC);

CREATE INDEX IF NOT EXISTS idx_visible_soul_files_latest
  ON public.visible_soul_files (user_id, version DESC);

CREATE INDEX IF NOT EXISTS idx_hidden_soul_files_latest
  ON public.hidden_soul_files (user_id, version DESC);
