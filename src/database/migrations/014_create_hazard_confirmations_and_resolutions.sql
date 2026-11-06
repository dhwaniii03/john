-- 014_create_hazard_confirmations_and_resolutions.sql
-- Adds confirmation and resolution counts to hazards table and creates tracking tables

ALTER TABLE hazards 
  ADD COLUMN IF NOT EXISTS confirmation_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resolved_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_confirmed_at TIMESTAMP WITH TIME ZONE;

CREATE TABLE IF NOT EXISTS hazard_confirmations (
  id SERIAL PRIMARY KEY,
  hazard_id INTEGER NOT NULL REFERENCES hazards(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hazard_resolutions (
  id SERIAL PRIMARY KEY,
  hazard_id INTEGER NOT NULL REFERENCES hazards(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hazard_confirmations_hazard_id ON hazard_confirmations(hazard_id);
CREATE INDEX IF NOT EXISTS idx_hazard_confirmations_user_id ON hazard_confirmations(user_id);
CREATE INDEX IF NOT EXISTS idx_hazard_resolutions_hazard_id ON hazard_resolutions(hazard_id);
CREATE INDEX IF NOT EXISTS idx_hazard_resolutions_user_id ON hazard_resolutions(user_id);
