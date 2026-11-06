-- 004_create_hazard_categories_table.sql
-- Configurable hazard categories table

CREATE TABLE IF NOT EXISTS hazard_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  icon_url VARCHAR(500),
  default_severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  default_expiry_days INTEGER NOT NULL DEFAULT 7,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hazard_categories_slug ON hazard_categories(slug);
CREATE INDEX IF NOT EXISTS idx_hazard_categories_is_active ON hazard_categories(is_active);
