-- 013_add_hazard_category_defaults.sql
-- Adds default_severity and default_expiry_days to hazard_categories

ALTER TABLE hazard_categories
ADD COLUMN IF NOT EXISTS default_severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN IF NOT EXISTS default_expiry_days INTEGER NOT NULL DEFAULT 7;
