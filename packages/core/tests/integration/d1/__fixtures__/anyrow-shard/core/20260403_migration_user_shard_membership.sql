CREATE TABLE `user_shard_membership` (
  `user_id` text NOT NULL,
  `shard_id` integer NOT NULL,
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (`user_id`, `shard_id`),
  FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `idx_user_shard_membership_user_id`
  ON `user_shard_membership` (`user_id`);

CREATE INDEX `idx_user_shard_membership_shard_id`
  ON `user_shard_membership` (`shard_id`);
