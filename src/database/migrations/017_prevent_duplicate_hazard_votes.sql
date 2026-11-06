-- 017_prevent_duplicate_hazard_votes.sql
-- Safely deduplicate any existing multiple votes and add unique constraint per user per hazard

-- 1. Deduplicate hazard_confirmations keeping the earliest record
DELETE FROM hazard_confirmations a
USING hazard_confirmations b
WHERE a.id > b.id
  AND a.hazard_id = b.hazard_id
  AND a.user_id = b.user_id
  AND a.user_id IS NOT NULL;

-- Create unique index on hazard_confirmations (hazard_id, user_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_hazard_confirmations_unique_user 
ON hazard_confirmations (hazard_id, user_id) 
WHERE user_id IS NOT NULL;

-- 2. Deduplicate hazard_resolutions keeping the earliest record
DELETE FROM hazard_resolutions a
USING hazard_resolutions b
WHERE a.id > b.id
  AND a.hazard_id = b.hazard_id
  AND a.user_id = b.user_id
  AND a.user_id IS NOT NULL;

-- Create unique index on hazard_resolutions (hazard_id, user_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_hazard_resolutions_unique_user 
ON hazard_resolutions (hazard_id, user_id) 
WHERE user_id IS NOT NULL;
