-- Soul Mirror tables
-- Soul files (one per user, updated each session)
CREATE TABLE soul_files (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  essence       TEXT,
  tensions      JSONB DEFAULT '[]'::jsonb,
  comes_alive   TEXT,
  running_from  TEXT,
  your_words    JSONB DEFAULT '[]'::jsonb,
  evolution     JSONB DEFAULT '[]'::jsonb,
  session_count INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Soul sessions (one per conversation session)
CREATE TABLE soul_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_number  INT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'in_session'
    CHECK (status IN ('in_session', 'extracting', 'complete', 'failed')),
  exchange_count  INT DEFAULT 0,
  started_at      TIMESTAMPTZ DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  next_available_at TIMESTAMPTZ,
  extraction_error TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_soul_sessions_user_status ON soul_sessions(user_id, status);

-- Soul messages (conversation transcript)
CREATE TABLE soul_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES soul_sessions(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_soul_messages_session ON soul_messages(session_id, created_at);
