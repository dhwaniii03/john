-- 016_add_journey_last_on_route_at.sql
-- Add last_on_route_at timestamp to track whether user is currently on the journey polyline

ALTER TABLE journeys
ADD COLUMN IF NOT EXISTS last_on_route_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_journeys_last_on_route_at ON journeys(last_on_route_at);
