-- 017_prevent_duplicate_hazard_votes.down.sql
-- Down migration for 017_prevent_duplicate_hazard_votes.sql

DROP INDEX IF EXISTS idx_hazard_confirmations_unique_user;
DROP INDEX IF EXISTS idx_hazard_resolutions_unique_user;
