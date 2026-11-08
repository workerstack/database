PRAGMA defer_foreign_keys = on;
-- Create "new_user_refresh_token" table
CREATE TABLE `new_user_refresh_token` (`id` text NOT NULL, `user_id` text NOT NULL, `token` text NOT NULL, `family_id` text NOT NULL, `parent_token_id` text NULL, `expires_at` integer NOT NULL, `last_used_at` integer NULL, `device_name` text NULL, `ip_address` text NULL, `user_agent` text NULL, `country` text NULL, `region` text NULL, `city` text NULL, `timezone` text NULL, `asn` integer NULL, `as_org` text NULL, `browser` text NULL, `os` text NULL, `device_type` text NULL, `auth_method` text NULL, `mfa_method` text NULL, `session_started_at` integer NOT NULL, `reauthenticated_at` integer NULL, `last_ip` text NULL, `last_country` text NULL, `revoked_at` integer NULL, `revoked_reason` text NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY (`id`), CONSTRAINT `fk_user_refresh_token_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE, CONSTRAINT `refresh_token_expiry_valid` CHECK (expires_at > created_at), CONSTRAINT `revoked_fields_integrity` CHECK ((revoked_at IS NULL AND revoked_reason IS NULL) OR (revoked_at IS NOT NULL AND revoked_reason IS NOT NULL)));
-- Copy rows from old table "user_refresh_token" to new temporary table "new_user_refresh_token"
INSERT INTO `new_user_refresh_token` (`id`, `user_id`, `token`, `family_id`, `parent_token_id`, `expires_at`, `last_used_at`, `device_name`, `ip_address`, `user_agent`, `country`, `region`, `city`, `timezone`, `asn`, `as_org`, `browser`, `os`, `device_type`, `auth_method`, `mfa_method`, `session_started_at`, `reauthenticated_at`, `last_ip`, `last_country`, `revoked_at`, `revoked_reason`, `created_at`, `updated_at`) SELECT `id`, `user_id`, `token`, `family_id`, `parent_token_id`, `expires_at`, `last_used_at`, `device_name`, `ip_address`, `user_agent`, `country`, `region`, `city`, `timezone`, `asn`, `as_org`, `browser`, `os`, `device_type`, `auth_method`, `mfa_method`, `session_started_at`, `reauthenticated_at`, `last_ip`, `last_country`, `revoked_at`, `revoked_reason`, `created_at`, `updated_at` FROM `user_refresh_token`;
-- Drop "user_refresh_token" table after copying rows
DROP TABLE `user_refresh_token`;
-- Rename temporary table "new_user_refresh_token" to "user_refresh_token"
ALTER TABLE `new_user_refresh_token` RENAME TO `user_refresh_token`;
-- Create index "idx_user_refresh_token_unique" to table: "user_refresh_token"
CREATE UNIQUE INDEX `idx_user_refresh_token_unique` ON `user_refresh_token` (`token`);
-- Create index "idx_user_refresh_token_user_id" to table: "user_refresh_token"
CREATE INDEX `idx_user_refresh_token_user_id` ON `user_refresh_token` (`user_id`);
-- Create index "idx_user_refresh_token_expires_at" to table: "user_refresh_token"
CREATE INDEX `idx_user_refresh_token_expires_at` ON `user_refresh_token` (`expires_at`);
-- Create index "idx_user_refresh_token_family_id" to table: "user_refresh_token"
CREATE INDEX `idx_user_refresh_token_family_id` ON `user_refresh_token` (`family_id`);
-- Create index "idx_user_refresh_token_parent_id" to table: "user_refresh_token"
CREATE INDEX `idx_user_refresh_token_parent_id` ON `user_refresh_token` (`parent_token_id`);
-- Create index "idx_user_refresh_token_revoked_at" to table: "user_refresh_token"
CREATE INDEX `idx_user_refresh_token_revoked_at` ON `user_refresh_token` (`revoked_at`);
