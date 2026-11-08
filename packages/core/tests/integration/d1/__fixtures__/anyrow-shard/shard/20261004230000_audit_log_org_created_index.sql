-- Hand-written: index-only change (a generated shard diff would rebuild tables).
-- Per-org log reads and retention cleanup range on (organization_id, created_at); the two
-- single-column indexes it replaces have no other reader.
CREATE INDEX `idx_audit_log_organization_created` ON `audit_log` (`organization_id`, `created_at`);
DROP INDEX `idx_audit_log_organization_id`;
DROP INDEX `idx_audit_log_created_at`;
