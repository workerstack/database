-- Hand-written: a generated diff rebuilds every core table (database emits `id text NULL` and named
-- FKs; prod has `id text NOT NULL` and FKs named `0`), and rebuilding `user` cascade-deletes all of
-- its child rows. Only user_two_factor is rebuilt here; nothing references it.
PRAGMA defer_foreign_keys = on;
-- SMS second factor was never implemented: drop `phone` and its CHECK
CREATE TABLE `new_user_two_factor` (`id` text NOT NULL, `user_id` text NOT NULL, `type` text NOT NULL, `_secret_encrypted` text NOT NULL, `_secret_iv` text NOT NULL, `_backup_codes` text NULL, `verified` integer NOT NULL DEFAULT 0, `verified_at` integer NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY (`id`), CONSTRAINT `fk_user_two_factor_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE, CONSTRAINT `backup_codes_size` CHECK (_backup_codes IS NULL OR length(_backup_codes) <= 10240), CONSTRAINT `verified_requires_verified_at` CHECK (verified = 0 OR verified_at IS NOT NULL));
INSERT INTO `new_user_two_factor` (`id`, `user_id`, `type`, `_secret_encrypted`, `_secret_iv`, `_backup_codes`, `verified`, `verified_at`, `created_at`, `updated_at`) SELECT `id`, `user_id`, `type`, `_secret_encrypted`, `_secret_iv`, `_backup_codes`, `verified`, `verified_at`, `created_at`, `updated_at` FROM `user_two_factor`;
DROP TABLE `user_two_factor`;
ALTER TABLE `new_user_two_factor` RENAME TO `user_two_factor`;
CREATE INDEX `idx_user_two_factor_user_id` ON `user_two_factor` (`user_id`);
CREATE INDEX `idx_user_two_factor_user_verified` ON `user_two_factor` (`user_id`, `verified`);
CREATE UNIQUE INDEX `idx_user_two_factor_user_type_unique` ON `user_two_factor` (`user_id`, `type`);
-- Tables removed from the schema in bf4fa3825 (empty in prod)
DROP TABLE `public_profile`;
DROP TABLE `referral`;
DROP TABLE `referral_code`;
