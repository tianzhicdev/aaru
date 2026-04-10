UPDATE users
SET model_profile_id = CASE
  WHEN model_profile_id IN ('frontier', 'frontier_v1') THEN 'frontier'
  WHEN model_profile_id IN ('value_cjk', 'value_v1') THEN 'value_cjk'
  WHEN model_profile_id IN ('value_default', 'value_v2') THEN 'value_default'
  ELSE 'value_default'
END
WHERE model_profile_id IS DISTINCT FROM CASE
  WHEN model_profile_id IN ('frontier', 'frontier_v1') THEN 'frontier'
  WHEN model_profile_id IN ('value_cjk', 'value_v1') THEN 'value_cjk'
  WHEN model_profile_id IN ('value_default', 'value_v2') THEN 'value_default'
  ELSE 'value_default'
END;

ALTER TABLE users
  ALTER COLUMN model_profile_id SET DEFAULT 'value_default';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_model_profile_id_valid'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_model_profile_id_valid
      CHECK (model_profile_id IN ('frontier', 'value_cjk', 'value_default'));
  END IF;
END $$;
