-- Hand-written (see 20261003181500): additive only, no table rebuilds.
-- Session metadata: where/how each refresh family started, and the latest refresh.
ALTER TABLE `user_refresh_token` ADD COLUMN `country` text NULL;
ALTER TABLE `user_refresh_token` ADD COLUMN `region` text NULL;
ALTER TABLE `user_refresh_token` ADD COLUMN `city` text NULL;
ALTER TABLE `user_refresh_token` ADD COLUMN `timezone` text NULL;
ALTER TABLE `user_refresh_token` ADD COLUMN `asn` integer NULL;
ALTER TABLE `user_refresh_token` ADD COLUMN `as_org` text NULL;
ALTER TABLE `user_refresh_token` ADD COLUMN `browser` text NULL;
ALTER TABLE `user_refresh_token` ADD COLUMN `os` text NULL;
ALTER TABLE `user_refresh_token` ADD COLUMN `device_type` text NULL;
ALTER TABLE `user_refresh_token` ADD COLUMN `auth_method` text NULL;
ALTER TABLE `user_refresh_token` ADD COLUMN `mfa_method` text NULL;
-- NOT NULL needs a default to add; existing families started when their row was created
ALTER TABLE `user_refresh_token` ADD COLUMN `session_started_at` integer NOT NULL DEFAULT 0;
UPDATE `user_refresh_token` SET `session_started_at` = `created_at`;
ALTER TABLE `user_refresh_token` ADD COLUMN `last_ip` text NULL;
ALTER TABLE `user_refresh_token` ADD COLUMN `last_country` text NULL;
-- Per-user security activity log (180-day retention via cron)
CREATE TABLE `user_security_event` (`id` text NOT NULL, `user_id` text NOT NULL, `type` text NOT NULL, `ip` text NULL, `country` text NULL, `city` text NULL, `browser` text NULL, `os` text NULL, `session_family_id` text NULL, `actor_user_id` text NULL, `metadata_json` text NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY (`id`), CONSTRAINT `fk_user_security_event_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE);
CREATE INDEX `idx_user_security_event_user_created` ON `user_security_event` (`user_id`, `created_at`);
CREATE INDEX `idx_user_security_event_created_at` ON `user_security_event` (`created_at`);
