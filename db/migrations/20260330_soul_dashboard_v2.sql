ALTER TABLE public.visible_soul_files
  ADD COLUMN IF NOT EXISTS personality_spectrum JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS top_values JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS relational_style TEXT DEFAULT NULL;

ALTER TABLE public.hidden_soul_files
  ADD COLUMN IF NOT EXISTS big_five_scores JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS schwartz_profile JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS attachment_scores JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS moral_foundations JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS meaning_orientation TEXT DEFAULT NULL;
