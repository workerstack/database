-- Hand-written (see 20261003181500): additive only.
-- Support access sessions (platform admin viewing as a user).
CREATE TABLE `impersonation_session` (`id` text NOT NULL, `admin_user_id` text NOT NULL, `target_user_id` text NOT NULL, `reason` text NOT NULL, `ip` text NULL, `expires_at` integer NOT NULL, `ended_at` integer NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY (`id`));
CREATE INDEX `idx_impersonation_session_target` ON `impersonation_session` (`target_user_id`, `created_at`);
CREATE INDEX `idx_impersonation_session_admin` ON `impersonation_session` (`admin_user_id`, `created_at`);
