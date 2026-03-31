ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS model_profile_id TEXT;

UPDATE public.users
SET model_profile_id = 'frontier_v1'
WHERE model_profile_id IS NULL;

ALTER TABLE public.users
  ALTER COLUMN model_profile_id SET DEFAULT 'frontier_v1',
  ALTER COLUMN model_profile_id SET NOT NULL;
