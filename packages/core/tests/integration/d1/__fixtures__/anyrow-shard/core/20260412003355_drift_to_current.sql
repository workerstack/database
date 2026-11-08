-- Disable the enforcement of foreign-keys constraints
PRAGMA foreign_keys = off;
-- Create "new_app_notification" table
CREATE TABLE `new_app_notification` (`id` text NOT NULL, `_search` text NOT NULL DEFAULT '', `user_id` text NOT NULL, `event_type` text NOT NULL, `title` text NOT NULL, `body` text NULL, `org_id` text NULL, `project_id` text NULL, `resource_id` text NULL, `read_at` integer NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY (`id`), CONSTRAINT `0` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE);
-- Copy rows from old table "app_notification" to new temporary table "new_app_notification"
INSERT INTO `new_app_notification` (`id`, `_search`, `user_id`, `event_type`, `title`, `body`, `org_id`, `project_id`, `resource_id`, `read_at`, `created_at`) SELECT `id`, `_search`, `user_id`, `event_type`, `title`, `body`, `org_id`, `project_id`, `resource_id`, `read_at`, `created_at` FROM `app_notification`;
-- Drop "app_notification" table after copying rows
DROP TABLE `app_notification`;
-- Rename temporary table "new_app_notification" to "app_notification"
ALTER TABLE `new_app_notification` RENAME TO `app_notification`;
-- Create index "idx_app_notification_user_id" to table: "app_notification"
CREATE INDEX `idx_app_notification_user_id` ON `app_notification` (`user_id`);
-- Create index "idx_app_notification_user_unread" to table: "app_notification"
CREATE INDEX `idx_app_notification_user_unread` ON `app_notification` (`user_id`, `read_at`) WHERE read_at IS NULL;
-- Create index "idx_app_notification_user_created" to table: "app_notification"
CREATE INDEX `idx_app_notification_user_created` ON `app_notification` (`user_id`, `created_at`);
-- Create "new_custom_domain" table
CREATE TABLE `new_custom_domain` (`id` text NOT NULL, `_search` text NOT NULL DEFAULT '', `organization_id` text NOT NULL, `hostname` text NOT NULL, `cf_hostname_id` text NULL, `status` text NOT NULL DEFAULT 'pending', `ssl_status` text NULL, `last_synced_at` integer NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY (`id`));
-- Copy rows from old table "custom_domain" to new temporary table "new_custom_domain"
INSERT INTO `new_custom_domain` (`id`, `_search`, `organization_id`, `hostname`, `cf_hostname_id`, `status`, `ssl_status`, `last_synced_at`, `created_at`, `updated_at`) SELECT `id`, `_search`, `organization_id`, `hostname`, `cf_hostname_id`, `status`, `ssl_status`, `last_synced_at`, `created_at`, `updated_at` FROM `custom_domain`;
-- Drop "custom_domain" table after copying rows
DROP TABLE `custom_domain`;
-- Rename temporary table "new_custom_domain" to "custom_domain"
ALTER TABLE `new_custom_domain` RENAME TO `custom_domain`;
-- Create index "idx_custom_domain_hostname_unique" to table: "custom_domain"
CREATE UNIQUE INDEX `idx_custom_domain_hostname_unique` ON `custom_domain` (`hostname`);
-- Create index "idx_custom_domain_organization_id" to table: "custom_domain"
CREATE INDEX `idx_custom_domain_organization_id` ON `custom_domain` (`organization_id`);
-- Create index "idx_custom_domain_status" to table: "custom_domain"
CREATE INDEX `idx_custom_domain_status` ON `custom_domain` (`status`) WHERE status != 'deleted';
-- Create "new_notification_preference" table
CREATE TABLE `new_notification_preference` (`id` text NOT NULL, `user_id` text NOT NULL, `channel` text NOT NULL DEFAULT 'email', `extraction_complete` integer NOT NULL DEFAULT 1, `extraction_failed` integer NOT NULL DEFAULT 1, `webhook_disabled` integer NOT NULL DEFAULT 1, `usage_warning` integer NOT NULL DEFAULT 1, `billing_alert` integer NOT NULL DEFAULT 1, `invite_received` integer NOT NULL DEFAULT 1, `marketing` integer NOT NULL DEFAULT 0, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY (`id`), CONSTRAINT `0` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE);
-- Copy rows from old table "notification_preference" to new temporary table "new_notification_preference"
INSERT INTO `new_notification_preference` (`id`, `user_id`, `channel`, `extraction_complete`, `extraction_failed`, `webhook_disabled`, `usage_warning`, `billing_alert`, `invite_received`, `marketing`, `created_at`, `updated_at`) SELECT `id`, `user_id`, `channel`, `extraction_complete`, `extraction_failed`, `webhook_disabled`, `usage_warning`, `billing_alert`, `invite_received`, `marketing`, `created_at`, `updated_at` FROM `notification_preference`;
-- Drop "notification_preference" table after copying rows
DROP TABLE `notification_preference`;
-- Rename temporary table "new_notification_preference" to "notification_preference"
ALTER TABLE `new_notification_preference` RENAME TO `notification_preference`;
-- Create index "idx_notification_preference_user_channel_unique" to table: "notification_preference"
CREATE UNIQUE INDEX `idx_notification_preference_user_channel_unique` ON `notification_preference` (`user_id`, `channel`);
-- Create index "idx_notification_preference_user_id" to table: "notification_preference"
CREATE INDEX `idx_notification_preference_user_id` ON `notification_preference` (`user_id`);
-- Create "new_shard_map" table
CREATE TABLE `new_shard_map` (`created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), `deleted_at` integer NULL, `driver` text NOT NULL DEFAULT 'd1', `org_id` text NOT NULL, `shard_id` integer NOT NULL, `target` text NOT NULL, `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY (`org_id`));
-- Copy rows from old table "shard_map" to new temporary table "new_shard_map"
INSERT INTO `new_shard_map` (`created_at`, `deleted_at`, `driver`, `org_id`, `shard_id`, `target`, `updated_at`) SELECT `created_at`, `deleted_at`, `driver`, `org_id`, `shard_id`, `target`, `updated_at` FROM `shard_map`;
-- Drop "shard_map" table after copying rows
DROP TABLE `shard_map`;
-- Rename temporary table "new_shard_map" to "shard_map"
ALTER TABLE `new_shard_map` RENAME TO `shard_map`;
-- Create index "idx_shard_map_shard_id" to table: "shard_map"
CREATE INDEX `idx_shard_map_shard_id` ON `shard_map` (`shard_id`);
-- Create index "idx_shard_map_driver" to table: "shard_map"
CREATE INDEX `idx_shard_map_driver` ON `shard_map` (`driver`) WHERE deleted_at IS NULL;
-- Create "new_table_template" table
CREATE TABLE `new_table_template` (`id` text NOT NULL, `_search` text NOT NULL DEFAULT '', `category` text NOT NULL, `columns_json` text NOT NULL, `creator_display_name` text NULL, `creator_user_id` text NULL, `description` text NULL, `insert_mode` text NOT NULL DEFAULT 'append', `instruction` text NULL, `merge_columns_json` text NULL, `name` text NOT NULL, `strictness` text NOT NULL DEFAULT 'strict', `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000), `usage_count` integer NOT NULL DEFAULT 0, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY (`id`));
-- Copy rows from old table "table_template" to new temporary table "new_table_template"
INSERT INTO `new_table_template` (`id`, `_search`, `category`, `columns_json`, `creator_display_name`, `creator_user_id`, `description`, `insert_mode`, `instruction`, `merge_columns_json`, `name`, `strictness`, `updated_at`, `usage_count`, `created_at`) SELECT `id`, `_search`, `category`, `columns_json`, `creator_display_name`, `creator_user_id`, `description`, `insert_mode`, `instruction`, `merge_columns_json`, `name`, `strictness`, `updated_at`, `usage_count`, `created_at` FROM `table_template`;
-- Drop "table_template" table after copying rows
DROP TABLE `table_template`;
-- Rename temporary table "new_table_template" to "table_template"
ALTER TABLE `new_table_template` RENAME TO `table_template`;
-- Create index "idx_table_template_category" to table: "table_template"
CREATE INDEX `idx_table_template_category` ON `table_template` (`category`);
-- Create index "idx_table_template_creator_user_id" to table: "table_template"
CREATE INDEX `idx_table_template_creator_user_id` ON `table_template` (`creator_user_id`);
-- Create index "idx_table_template_usage_count" to table: "table_template"
CREATE INDEX `idx_table_template_usage_count` ON `table_template` (`usage_count`);
-- Create "new_user" table
CREATE TABLE `new_user` (`id` text NOT NULL, `email` text NOT NULL, `email_verified_at` integer NULL, `first_name` text NULL, `last_name` text NULL, `avatar_url` text NULL, `phone_number` text NULL, `country` text NULL, `preferred_language` text NULL, `timezone` text NULL, `two_factor_enabled_at` integer NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000), `deleted_at` integer NULL, PRIMARY KEY (`id`));
-- Copy rows from old table "user" to new temporary table "new_user"
INSERT INTO `new_user` (`id`, `email`, `email_verified_at`, `first_name`, `last_name`, `avatar_url`, `phone_number`, `country`, `preferred_language`, `timezone`, `two_factor_enabled_at`, `created_at`, `updated_at`, `deleted_at`) SELECT `id`, `email`, `email_verified_at`, `first_name`, `last_name`, `avatar_url`, `phone_number`, `country`, `preferred_language`, `timezone`, `two_factor_enabled_at`, `created_at`, `updated_at`, `deleted_at` FROM `user`;
-- Drop "user" table after copying rows
DROP TABLE `user`;
-- Rename temporary table "new_user" to "user"
ALTER TABLE `new_user` RENAME TO `user`;
-- Create index "idx_user_email_unique" to table: "user"
CREATE UNIQUE INDEX `idx_user_email_unique` ON `user` (`email`) WHERE deleted_at IS NULL;
-- Create index "idx_user_deleted_at" to table: "user"
CREATE INDEX `idx_user_deleted_at` ON `user` (`deleted_at`) WHERE deleted_at IS NULL;
-- Create "new_user_account" table
CREATE TABLE `new_user_account` (`id` text NOT NULL, `user_id` text NOT NULL, `provider` text NOT NULL, `account_id` text NOT NULL, `_password` text NULL, `_access_token` text NULL, `access_token_expires_at` integer NULL, `_refresh_token` text NULL, `refresh_token_expires_at` integer NULL, `id_token` text NULL, `scope` text NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY (`id`), CONSTRAINT `0` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE, CONSTRAINT `email_requires_password` CHECK (provider != 'email' OR _password IS NOT NULL));
-- Copy rows from old table "user_account" to new temporary table "new_user_account"
INSERT INTO `new_user_account` (`id`, `user_id`, `provider`, `account_id`, `_password`, `_access_token`, `access_token_expires_at`, `_refresh_token`, `refresh_token_expires_at`, `id_token`, `scope`, `created_at`, `updated_at`) SELECT `id`, `user_id`, `provider`, `account_id`, `_password`, `_access_token`, `access_token_expires_at`, `_refresh_token`, `refresh_token_expires_at`, `id_token`, `scope`, `created_at`, `updated_at` FROM `user_account`;
-- Drop "user_account" table after copying rows
DROP TABLE `user_account`;
-- Rename temporary table "new_user_account" to "user_account"
ALTER TABLE `new_user_account` RENAME TO `user_account`;
-- Create index "idx_user_account_provider_unique" to table: "user_account"
CREATE UNIQUE INDEX `idx_user_account_provider_unique` ON `user_account` (`provider`, `account_id`);
-- Create index "idx_user_account_user_id" to table: "user_account"
CREATE INDEX `idx_user_account_user_id` ON `user_account` (`user_id`);
-- Create index "idx_user_account_user_provider" to table: "user_account"
CREATE INDEX `idx_user_account_user_provider` ON `user_account` (`user_id`, `provider`);
-- Create "new_user_oauth_code" table
CREATE TABLE `new_user_oauth_code` (`id` text NOT NULL, `user_id` text NOT NULL, `code` text NOT NULL, `client_id` text NOT NULL, `redirect_uri` text NOT NULL, `scope` text NULL, `code_challenge` text NULL, `code_challenge_method` text NULL, `expires_at` integer NOT NULL, `used_at` integer NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), `deleted_at` integer NULL, PRIMARY KEY (`id`), CONSTRAINT `0` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE, CONSTRAINT `oauth_expiry_valid` CHECK (expires_at > created_at));
-- Copy rows from old table "user_oauth_code" to new temporary table "new_user_oauth_code"
INSERT INTO `new_user_oauth_code` (`id`, `user_id`, `code`, `client_id`, `redirect_uri`, `scope`, `code_challenge`, `code_challenge_method`, `expires_at`, `used_at`, `created_at`, `deleted_at`) SELECT `id`, `user_id`, `code`, `client_id`, `redirect_uri`, `scope`, `code_challenge`, `code_challenge_method`, `expires_at`, `used_at`, `created_at`, `deleted_at` FROM `user_oauth_code`;
-- Drop "user_oauth_code" table after copying rows
DROP TABLE `user_oauth_code`;
-- Rename temporary table "new_user_oauth_code" to "user_oauth_code"
ALTER TABLE `new_user_oauth_code` RENAME TO `user_oauth_code`;
-- Create index "idx_user_oauth_code_deleted_at" to table: "user_oauth_code"
CREATE INDEX `idx_user_oauth_code_deleted_at` ON `user_oauth_code` (`deleted_at`) WHERE deleted_at IS NULL;
-- Create index "idx_user_oauth_code_unique" to table: "user_oauth_code"
CREATE UNIQUE INDEX `idx_user_oauth_code_unique` ON `user_oauth_code` (`code`) WHERE deleted_at IS NULL;
-- Create index "idx_user_oauth_code_user_id" to table: "user_oauth_code"
CREATE INDEX `idx_user_oauth_code_user_id` ON `user_oauth_code` (`user_id`) WHERE deleted_at IS NULL;
-- Create index "idx_user_oauth_code_expires_at" to table: "user_oauth_code"
CREATE INDEX `idx_user_oauth_code_expires_at` ON `user_oauth_code` (`expires_at`);
-- Create "new_user_onboarding" table
CREATE TABLE `new_user_onboarding` (`id` text NOT NULL, `user_id` text NOT NULL, `dismissed_at` integer NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY (`id`), CONSTRAINT `0` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE);
-- Copy rows from old table "user_onboarding" to new temporary table "new_user_onboarding"
INSERT INTO `new_user_onboarding` (`id`, `user_id`, `created_at`, `updated_at`) SELECT `id`, `user_id`, `created_at`, `updated_at` FROM `user_onboarding`;
-- Drop "user_onboarding" table after copying rows
DROP TABLE `user_onboarding`;
-- Rename temporary table "new_user_onboarding" to "user_onboarding"
ALTER TABLE `new_user_onboarding` RENAME TO `user_onboarding`;
-- Create index "idx_user_onboarding_user_id_unique" to table: "user_onboarding"
CREATE UNIQUE INDEX `idx_user_onboarding_user_id_unique` ON `user_onboarding` (`user_id`);
-- Create "new_user_refresh_token" table
CREATE TABLE `new_user_refresh_token` (`id` text NOT NULL, `user_id` text NOT NULL, `token` text NOT NULL, `family_id` text NOT NULL, `parent_token_id` text NULL, `expires_at` integer NOT NULL, `last_used_at` integer NULL, `device_name` text NULL, `ip_address` text NULL, `user_agent` text NULL, `revoked_at` integer NULL, `revoked_reason` text NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY (`id`), CONSTRAINT `0` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE, CONSTRAINT `refresh_token_expiry_valid` CHECK (expires_at > created_at), CONSTRAINT `revoked_fields_integrity` CHECK ((revoked_at IS NULL AND revoked_reason IS NULL) OR (revoked_at IS NOT NULL AND revoked_reason IS NOT NULL)));
-- Copy rows from old table "user_refresh_token" to new temporary table "new_user_refresh_token"
INSERT INTO `new_user_refresh_token` (`id`, `user_id`, `token`, `family_id`, `parent_token_id`, `expires_at`, `last_used_at`, `device_name`, `ip_address`, `user_agent`, `revoked_at`, `revoked_reason`, `created_at`, `updated_at`) SELECT `id`, `user_id`, `token`, `family_id`, `parent_token_id`, `expires_at`, `last_used_at`, `device_name`, `ip_address`, `user_agent`, `revoked_at`, `revoked_reason`, `created_at`, `updated_at` FROM `user_refresh_token`;
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
-- Create "new_user_two_factor" table
CREATE TABLE `new_user_two_factor` (`id` text NOT NULL, `user_id` text NOT NULL, `type` text NOT NULL, `_secret_encrypted` text NOT NULL, `_secret_iv` text NOT NULL, `_backup_codes` text NULL, `phone` text NULL, `verified` integer NOT NULL DEFAULT 0, `verified_at` integer NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY (`id`), CONSTRAINT `0` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE, CONSTRAINT `backup_codes_size` CHECK (_backup_codes IS NULL OR length(_backup_codes) <= 10240), CONSTRAINT `sms_requires_phone` CHECK (type != 'sms' OR phone IS NOT NULL), CONSTRAINT `verified_requires_verified_at` CHECK (verified = 0 OR verified_at IS NOT NULL));
-- Copy rows from old table "user_two_factor" to new temporary table "new_user_two_factor"
INSERT INTO `new_user_two_factor` (`id`, `user_id`, `type`, `_secret_encrypted`, `_secret_iv`, `_backup_codes`, `phone`, `verified`, `verified_at`, `created_at`, `updated_at`) SELECT `id`, `user_id`, `type`, `_secret_encrypted`, `_secret_iv`, `_backup_codes`, `phone`, `verified`, `verified_at`, `created_at`, `updated_at` FROM `user_two_factor`;
-- Drop "user_two_factor" table after copying rows
DROP TABLE `user_two_factor`;
-- Rename temporary table "new_user_two_factor" to "user_two_factor"
ALTER TABLE `new_user_two_factor` RENAME TO `user_two_factor`;
-- Create index "idx_user_two_factor_user_id" to table: "user_two_factor"
CREATE INDEX `idx_user_two_factor_user_id` ON `user_two_factor` (`user_id`);
-- Create index "idx_user_two_factor_user_verified" to table: "user_two_factor"
CREATE INDEX `idx_user_two_factor_user_verified` ON `user_two_factor` (`user_id`, `verified`);
-- Create index "idx_user_two_factor_user_type_unique" to table: "user_two_factor"
CREATE UNIQUE INDEX `idx_user_two_factor_user_type_unique` ON `user_two_factor` (`user_id`, `type`);
-- Create "new_user_verification" table
CREATE TABLE `new_user_verification` (`id` text NOT NULL, `user_id` text NOT NULL, `type` text NOT NULL, `value` text NOT NULL, `expires_at` integer NOT NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY (`id`), CONSTRAINT `0` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE);
-- Copy rows from old table "user_verification" to new temporary table "new_user_verification"
INSERT INTO `new_user_verification` (`id`, `user_id`, `type`, `value`, `expires_at`, `created_at`) SELECT `id`, `user_id`, `type`, `value`, `expires_at`, `created_at` FROM `user_verification`;
-- Drop "user_verification" table after copying rows
DROP TABLE `user_verification`;
-- Rename temporary table "new_user_verification" to "user_verification"
ALTER TABLE `new_user_verification` RENAME TO `user_verification`;
-- Create index "idx_user_verification_expires_at" to table: "user_verification"
CREATE INDEX `idx_user_verification_expires_at` ON `user_verification` (`expires_at`);
-- Create index "idx_user_verification_user_id_type" to table: "user_verification"
CREATE INDEX `idx_user_verification_user_id_type` ON `user_verification` (`user_id`, `type`);
-- Create index "idx_user_verification_value_unique" to table: "user_verification"
CREATE UNIQUE INDEX `idx_user_verification_value_unique` ON `user_verification` (`value`);
-- Create "new_public_profile" table
CREATE TABLE `new_public_profile` (`id` text NOT NULL, `user_id` text NOT NULL, `handle` text NOT NULL, `display_name` text NOT NULL, `use_case` text NULL, `link_url` text NULL, `link_label` text NULL, `is_public` integer NOT NULL DEFAULT 0, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY (`id`), CONSTRAINT `0` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE, CONSTRAINT `link_label_requires_url` CHECK (link_label IS NULL OR link_url IS NOT NULL));
-- Copy rows from old table "public_profile" to new temporary table "new_public_profile"
INSERT INTO `new_public_profile` (`id`, `user_id`, `handle`, `display_name`, `use_case`, `link_url`, `link_label`, `is_public`, `created_at`, `updated_at`) SELECT `id`, `user_id`, `handle`, `display_name`, `use_case`, `link_url`, `link_label`, `is_public`, `created_at`, `updated_at` FROM `public_profile`;
-- Drop "public_profile" table after copying rows
DROP TABLE `public_profile`;
-- Rename temporary table "new_public_profile" to "public_profile"
ALTER TABLE `new_public_profile` RENAME TO `public_profile`;
-- Create index "idx_public_profile_user_id_unique" to table: "public_profile"
CREATE UNIQUE INDEX `idx_public_profile_user_id_unique` ON `public_profile` (`user_id`);
-- Create index "idx_public_profile_handle_unique" to table: "public_profile"
CREATE UNIQUE INDEX `idx_public_profile_handle_unique` ON `public_profile` (`handle`);
-- Create index "idx_public_profile_is_public" to table: "public_profile"
CREATE INDEX `idx_public_profile_is_public` ON `public_profile` (`is_public`) WHERE is_public = 1;
-- Create "platform_admin" table
CREATE TABLE `platform_admin` (`id` text NOT NULL, `user_id` text NOT NULL, `granted_by` text NULL, `allowed_ips` text NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY (`id`), CONSTRAINT `0` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE);
-- Create index "idx_platform_admin_user_id_unique" to table: "platform_admin"
CREATE UNIQUE INDEX `idx_platform_admin_user_id_unique` ON `platform_admin` (`user_id`);
-- Create "referral" table
CREATE TABLE `referral` (`id` text NOT NULL, `referrer_user_id` text NOT NULL, `referred_user_id` text NOT NULL, `organization_id` text NULL, `stripe_customer_id` text NULL, `status` text NOT NULL DEFAULT 'pending', `referrer_reward_amount` integer NULL, `referrer_reward_currency` text NULL, `referee_coupon_id` text NULL, `reward_applied_at` integer NULL, `revoked_at` integer NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY (`id`), CONSTRAINT `0` FOREIGN KEY (`referred_user_id`) REFERENCES `user` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE, CONSTRAINT `1` FOREIGN KEY (`referrer_user_id`) REFERENCES `user` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE);
-- Create index "idx_referral_referred_user_unique" to table: "referral"
CREATE UNIQUE INDEX `idx_referral_referred_user_unique` ON `referral` (`referred_user_id`);
-- Create index "idx_referral_referrer_user_id" to table: "referral"
CREATE INDEX `idx_referral_referrer_user_id` ON `referral` (`referrer_user_id`);
-- Create index "idx_referral_organization_id" to table: "referral"
CREATE INDEX `idx_referral_organization_id` ON `referral` (`organization_id`);
-- Create index "idx_referral_status" to table: "referral"
CREATE INDEX `idx_referral_status` ON `referral` (`status`);
-- Create "referral_code" table
CREATE TABLE `referral_code` (`id` text NOT NULL, `user_id` text NOT NULL, `code` text NOT NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY (`id`), CONSTRAINT `0` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE);
-- Create index "idx_referral_code_user_id_unique" to table: "referral_code"
CREATE UNIQUE INDEX `idx_referral_code_user_id_unique` ON `referral_code` (`user_id`);
-- Create index "idx_referral_code_code_unique" to table: "referral_code"
CREATE UNIQUE INDEX `idx_referral_code_code_unique` ON `referral_code` (`code`);
-- Enable back the enforcement of foreign-keys constraints
PRAGMA foreign_keys = on;
