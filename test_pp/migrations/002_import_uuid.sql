-- Keep this migration independently safe when applied to an older installation.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Existing installations created by the original schema used a bigserial import id.
-- Replace those surrogate ids once, retaining all import fingerprints and links.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'imports' AND column_name = 'id' AND data_type <> 'uuid'
  ) THEN
    ALTER TABLE imports ADD COLUMN id_uuid uuid;
    UPDATE imports SET id_uuid = gen_random_uuid() WHERE id_uuid IS NULL;
    ALTER TABLE imports DROP CONSTRAINT imports_pkey;
    ALTER TABLE imports DROP COLUMN id;
    ALTER TABLE imports RENAME COLUMN id_uuid TO id;
    ALTER TABLE imports ADD PRIMARY KEY (id);
  END IF;
END $$;