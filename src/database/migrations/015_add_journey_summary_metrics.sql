-- 015_add_journey_summary_metrics.sql
-- Add summary metrics and polyline columns to journeys table

ALTER TABLE journeys
ADD COLUMN IF NOT EXISTS avg_speed_kmh DOUBLE PRECISION DEFAULT 0,
ADD COLUMN IF NOT EXISTS hazards_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS cyclists_nearby INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS walkers_nearby INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS route_polyline TEXT;
