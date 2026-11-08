-- Hand-written: additive only (a generated shard diff would rebuild tables).
-- The platform admin behind an audit entry made during support access.
ALTER TABLE `audit_log` ADD COLUMN `impersonator_user_id` text NULL;
