-- 007_create_journeys_table.sql
-- Journeys table for tracking user trips

CREATE TABLE IF NOT EXISTS journeys (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  transport_mode VARCHAR(20) NOT NULL DEFAULT 'DRIVER', -- DRIVER, CYCLIST, WALKER
  title VARCHAR(255),
  origin_name VARCHAR(255),
  destination_name VARCHAR(255),
  start_latitude DOUBLE PRECISION NOT NULL,
  start_longitude DOUBLE PRECISION NOT NULL,
  end_latitude DOUBLE PRECISION,
  end_longitude DOUBLE PRECISION,
  waypoints JSONB DEFAULT '[]',
  distance_km DOUBLE PRECISION DEFAULT 0,
  duration_minutes INTEGER DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, COMPLETED, CANCELLED
  started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_journeys_user_id ON journeys(user_id);
CREATE INDEX IF NOT EXISTS idx_journeys_status ON journeys(status);
CREATE INDEX IF NOT EXISTS idx_journeys_started_at ON journeys(started_at);
CREATE INDEX IF NOT EXISTS idx_journeys_transport_mode ON journeys(transport_mode);
