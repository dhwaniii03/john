-- 018_create_journey_locations_table.sql
-- Table to store historical breadcrumb trail locations during a journey
-- Down: DROP TABLE IF EXISTS journey_locations CASCADE;

CREATE TABLE IF NOT EXISTS journey_locations (
  id SERIAL PRIMARY KEY,
  journey_id INTEGER REFERENCES journeys(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_journey_locations_journey_recorded ON journey_locations(journey_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_journey_locations_user_recorded ON journey_locations(user_id, recorded_at);
