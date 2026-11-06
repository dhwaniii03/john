-- 006_create_hazard_reports_table.sql
-- Hazard reports submitted by users for admin moderation

CREATE TABLE IF NOT EXISTS hazard_reports (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES hazard_categories(id) ON DELETE SET NULL,
  hazard_id INTEGER REFERENCES hazards(id) ON DELETE SET NULL,
  title VARCHAR(255),
  description TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  address VARCHAR(255),
  image_url VARCHAR(500),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
  reviewed_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hazard_reports_user_id ON hazard_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_hazard_reports_status ON hazard_reports(status);
CREATE INDEX IF NOT EXISTS idx_hazard_reports_created_at ON hazard_reports(created_at);
CREATE INDEX IF NOT EXISTS idx_hazard_reports_category_id ON hazard_reports(category_id);
