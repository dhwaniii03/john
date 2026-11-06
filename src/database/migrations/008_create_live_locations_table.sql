-- 008_create_live_locations_table.sql
-- Live locations table for real-time proximity awareness

CREATE TABLE IF NOT EXISTS live_locations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  journey_id INTEGER REFERENCES journeys(id) ON DELETE SET NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  transport_mode VARCHAR(20) NOT NULL DEFAULT 'DRIVER',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_live_locations_lat_lng ON live_locations(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_live_locations_is_active ON live_locations(is_active);
CREATE INDEX IF NOT EXISTS idx_live_locations_transport_mode ON live_locations(transport_mode);
CREATE INDEX IF NOT EXISTS idx_live_locations_last_updated ON live_locations(last_updated_at);
