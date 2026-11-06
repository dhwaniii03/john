-- 019_create_search_history_table.sql
-- Table to store recent search destination history for users
-- Down: DROP TABLE IF EXISTS search_histories CASCADE;

CREATE TABLE IF NOT EXISTS search_histories (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  subtitle VARCHAR(500),
  place_id VARCHAR(255),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_search_histories_user_updated ON search_histories(user_id, updated_at DESC);

