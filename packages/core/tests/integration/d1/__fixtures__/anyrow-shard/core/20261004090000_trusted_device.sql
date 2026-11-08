-- Hand-written (see 20261003181500): additive only.
-- Browsers trusted to skip the second factor after a 2FA sign-in (opt-in, 30 days).
CREATE TABLE `user_trusted_device` (`id` text NOT NULL, `user_id` text NOT NULL, `token_hash` text NOT NULL, `browser` text NULL, `os` text NULL, `city` text NULL, `country` text NULL, `last_used_at` integer NULL, `expires_at` integer NOT NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY (`id`), CONSTRAINT `fk_user_trusted_device_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE);
CREATE UNIQUE INDEX `idx_user_trusted_device_token_unique` ON `user_trusted_device` (`token_hash`);
CREATE INDEX `idx_user_trusted_device_user_id` ON `user_trusted_device` (`user_id`);
CREATE INDEX `idx_user_trusted_device_expires_at` ON `user_trusted_device` (`expires_at`);
