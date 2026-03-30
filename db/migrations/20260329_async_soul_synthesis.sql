-- Async soul file synthesis: add status tracking to visible_soul_files
-- Status: 'ready' (default, synthesis complete), 'pending' (synthesis in progress), 'failed'
-- synthesis_started_at: timestamp for stale pending detection (>5 min = failed)

ALTER TABLE visible_soul_files
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready', 'pending', 'failed')),
  ADD COLUMN IF NOT EXISTS synthesis_started_at timestamptz;

-- Same for hidden_soul_files (synthesized in tandem)
ALTER TABLE hidden_soul_files
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready', 'pending', 'failed')),
  ADD COLUMN IF NOT EXISTS synthesis_started_at timestamptz;
