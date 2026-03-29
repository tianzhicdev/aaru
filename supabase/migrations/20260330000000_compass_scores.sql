ALTER TABLE visible_soul_files
  ADD COLUMN compass_scores jsonb DEFAULT '{}'::jsonb;
