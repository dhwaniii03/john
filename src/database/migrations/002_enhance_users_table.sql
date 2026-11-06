-- 002_enhance_users_table.sql
-- Adds missing user fields per RoadLife specifications

ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS last_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
  ADD COLUMN IF NOT EXISTS profile_image VARCHAR(500),
  ADD COLUMN IF NOT EXISTS transport_mode VARCHAR(20) NOT NULL DEFAULT 'DRIVER',
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS notification_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS location_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- Populate first_name from existing name if first_name is empty
UPDATE users 
SET first_name = SPLIT_PART(name, ' ', 1),
    last_name = SUBSTRING(name FROM LENGTH(SPLIT_PART(name, ' ', 1)) + 2)
WHERE first_name IS NULL AND name IS NOT NULL;

-- Create indexes for frequent queries
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_transport_mode ON users(transport_mode);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);
