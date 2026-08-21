CREATE TABLE IF NOT EXISTS model_credentials (
  provider TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('ready', 'disabled')),
  ciphertext TEXT,
  iv TEXT,
  auth_tag TEXT,
  key_version INTEGER,
  provider_model_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (status = 'ready' AND ciphertext IS NOT NULL AND iv IS NOT NULL
      AND auth_tag IS NOT NULL AND key_version IS NOT NULL
      AND provider_model_id IS NOT NULL)
    OR
    (status = 'disabled' AND ciphertext IS NULL AND iv IS NULL
      AND auth_tag IS NULL AND key_version IS NULL
      AND provider_model_id IS NULL)
  )
);
