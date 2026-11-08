-- Create "user_totp_used" table
CREATE TABLE `user_totp_used` (`user_id` text NOT NULL, `counter` integer NOT NULL, `expires_at` integer NOT NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY (`user_id`, `counter`), CONSTRAINT `fk_user_totp_used_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE);
-- Create index "idx_user_totp_used_expires_at" to table: "user_totp_used"
CREATE INDEX `idx_user_totp_used_expires_at` ON `user_totp_used` (`expires_at`);
