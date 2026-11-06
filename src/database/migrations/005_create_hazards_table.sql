-- 005_create_hazards_table.sql
-- Core hazards table with geolocation, severity, status, source

CREATE TABLE IF NOT EXISTS hazards (
  id SERIAL PRIMARY KEY,
  category_id INTEGER REFERENCES hazard_categories(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM', -- LOW, MEDIUM, HIGH, CRITICAL
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, INVESTIGATING, RESOLVED
  source VARCHAR(30) NOT NULL DEFAULT 'USER', -- ADMIN, USER, OFFICIAL_DATASET
  reported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  image_url VARCHAR(500),
  address VARCHAR(255),
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hazards_lat_lng ON hazards(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_hazards_status ON hazards(status);
CREATE INDEX IF NOT EXISTS idx_hazards_severity ON hazards(severity);
CREATE INDEX IF NOT EXISTS idx_hazards_category_id ON hazards(category_id);
CREATE INDEX IF NOT EXISTS idx_hazards_reported_by ON hazards(reported_by);
CREATE INDEX IF NOT EXISTS idx_hazards_created_at ON hazards(created_at);
