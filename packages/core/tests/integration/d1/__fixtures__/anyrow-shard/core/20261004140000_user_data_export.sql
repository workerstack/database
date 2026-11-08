-- Hand-written (see 20261003181500): additive only.
-- Personal data exports (one JSON file in R2 per request, kept 7 days).
CREATE TABLE `user_data_export` (`id` text NOT NULL, `user_id` text NOT NULL, `status` text NOT NULL, `r2_key` text NULL, `size_bytes` integer NULL, `error` text NULL, `download_count` integer NOT NULL DEFAULT 0, `completed_at` integer NULL, `expires_at` integer NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY (`id`), CONSTRAINT `fk_user_data_export_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE);
CREATE INDEX `idx_user_data_export_user_created` ON `user_data_export` (`user_id`, `created_at`);
CREATE INDEX `idx_user_data_export_expires_at` ON `user_data_export` (`expires_at`);
