-- Disable the enforcement of foreign-keys constraints
PRAGMA foreign_keys = off;
-- Create "new_api_key" table
CREATE TABLE `new_api_key` (`id` text NOT NULL, `_search` text NOT NULL DEFAULT '', `project_id` text NOT NULL, `created_by_user_id` text NULL, `name` text NOT NULL, `key_prefix` text NOT NULL, `_key_hash` text NOT NULL, `scopes_json` text NOT NULL, `rate_limit` integer NULL, `allowed_ips` text NULL, `blocked_ips` text NULL, `expires_at` integer NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), `revoked_at` integer NULL, PRIMARY KEY (`id`), CONSTRAINT `0` FOREIGN KEY (`project_id`) REFERENCES `project` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE);
-- Copy rows from old table "api_key" to new temporary table "new_api_key"
INSERT INTO `new_api_key` (`id`, `_search`, `project_id`, `created_by_user_id`, `name`, `key_prefix`, `_key_hash`, `scopes_json`, `rate_limit`, `expires_at`, `created_at`, `revoked_at`) SELECT `id`, `_search`, `project_id`, `created_by_user_id`, `name`, `key_prefix`, `_key_hash`, `scopes_json`, `rate_limit`, `expires_at`, `created_at`, `revoked_at` FROM `api_key`;
-- Drop "api_key" table after copying rows
DROP TABLE `api_key`;
-- Rename temporary table "new_api_key" to "api_key"
ALTER TABLE `new_api_key` RENAME TO `api_key`;
-- Create index "idx_api_key_hash" to table: "api_key"
CREATE UNIQUE INDEX `idx_api_key_hash` ON `api_key` (`_key_hash`);
-- Create index "idx_api_key_project_id" to table: "api_key"
CREATE INDEX `idx_api_key_project_id` ON `api_key` (`project_id`);
-- Create index "idx_api_key_prefix" to table: "api_key"
CREATE INDEX `idx_api_key_prefix` ON `api_key` (`key_prefix`);
-- Create index "idx_api_key_active" to table: "api_key"
CREATE INDEX `idx_api_key_active` ON `api_key` (`revoked_at`) WHERE revoked_at IS NULL;
-- Create "new_audit_log" table
CREATE TABLE `new_audit_log` (`id` text NOT NULL, `organization_id` text NOT NULL, `project_id` text NULL, `actor_type` text NOT NULL, `actor_id` text NOT NULL, `action` text NOT NULL, `resource_type` text NOT NULL, `resource_id` text NULL, `metadata_json` text NULL, `ip_address` text NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY (`id`), CONSTRAINT `0` FOREIGN KEY (`project_id`) REFERENCES `project` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL, CONSTRAINT `1` FOREIGN KEY (`organization_id`) REFERENCES `organization` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE);
-- Copy rows from old table "audit_log" to new temporary table "new_audit_log"
INSERT INTO `new_audit_log` (`id`, `organization_id`, `project_id`, `actor_type`, `actor_id`, `action`, `resource_type`, `resource_id`, `metadata_json`, `ip_address`, `created_at`) SELECT `id`, `organization_id`, `project_id`, `actor_type`, `actor_id`, `action`, `resource_type`, `resource_id`, `metadata_json`, `ip_address`, `created_at` FROM `audit_log`;
-- Drop "audit_log" table after copying rows
DROP TABLE `audit_log`;
-- Rename temporary table "new_audit_log" to "audit_log"
ALTER TABLE `new_audit_log` RENAME TO `audit_log`;
-- Create index "idx_audit_log_organization_id" to table: "audit_log"
CREATE INDEX `idx_audit_log_organization_id` ON `audit_log` (`organization_id`);
-- Create index "idx_audit_log_actor" to table: "audit_log"
CREATE INDEX `idx_audit_log_actor` ON `audit_log` (`actor_type`, `actor_id`);
-- Create index "idx_audit_log_created_at" to table: "audit_log"
CREATE INDEX `idx_audit_log_created_at` ON `audit_log` (`created_at`);
-- Create "new_batch" table
CREATE TABLE `new_batch` (`id` text NOT NULL, `project_id` text NOT NULL, `table_id` text NULL, `actor_type` text NOT NULL, `actor_id` text NOT NULL, `schema_json` text NOT NULL, `insert_mode` text NULL, `status` text NOT NULL DEFAULT 'uploading', `file_count` integer NOT NULL, `files_done` integer NOT NULL DEFAULT 0, `current_file` text NULL, `csv_key` text NULL, `json_key` text NULL, `xlsx_key` text NULL, `total_rows` integer NULL, `confidence` real NULL, `duration_ms` integer NULL, `error` text NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY (`id`), CONSTRAINT `0` FOREIGN KEY (`table_id`) REFERENCES `table` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL, CONSTRAINT `1` FOREIGN KEY (`project_id`) REFERENCES `project` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE);
-- Copy rows from old table "batch" to new temporary table "new_batch"
INSERT INTO `new_batch` (`id`, `project_id`, `table_id`, `actor_type`, `actor_id`, `schema_json`, `insert_mode`, `status`, `file_count`, `files_done`, `current_file`, `csv_key`, `json_key`, `xlsx_key`, `total_rows`, `confidence`, `duration_ms`, `error`, `created_at`, `updated_at`) SELECT `id`, `project_id`, `table_id`, `actor_type`, `actor_id`, `schema_json`, `insert_mode`, `status`, `file_count`, `files_done`, `current_file`, `csv_key`, `json_key`, `xlsx_key`, `total_rows`, `confidence`, `duration_ms`, `error`, `created_at`, `updated_at` FROM `batch`;
-- Drop "batch" table after copying rows
DROP TABLE `batch`;
-- Rename temporary table "new_batch" to "batch"
ALTER TABLE `new_batch` RENAME TO `batch`;
-- Create index "idx_batch_project_id" to table: "batch"
CREATE INDEX `idx_batch_project_id` ON `batch` (`project_id`);
-- Create index "idx_batch_table_id" to table: "batch"
CREATE INDEX `idx_batch_table_id` ON `batch` (`table_id`);
-- Create index "idx_batch_actor" to table: "batch"
CREATE INDEX `idx_batch_actor` ON `batch` (`actor_type`, `actor_id`);
-- Create index "idx_batch_status" to table: "batch"
CREATE INDEX `idx_batch_status` ON `batch` (`status`);
-- Create "new_billing_event" table
CREATE TABLE `new_billing_event` (`id` text NOT NULL, `subscription_id` text NOT NULL, `organization_id` text NOT NULL, `type` text NOT NULL, `data_json` text NULL, `external_event_id` text NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY (`id`), CONSTRAINT `0` FOREIGN KEY (`organization_id`) REFERENCES `organization` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE, CONSTRAINT `1` FOREIGN KEY (`subscription_id`) REFERENCES `subscription` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE);
-- Copy rows from old table "billing_event" to new temporary table "new_billing_event"
INSERT INTO `new_billing_event` (`id`, `subscription_id`, `organization_id`, `type`, `data_json`, `external_event_id`, `created_at`) SELECT `id`, `subscription_id`, `organization_id`, `type`, `data_json`, `external_event_id`, `created_at` FROM `billing_event`;
-- Drop "billing_event" table after copying rows
DROP TABLE `billing_event`;
-- Rename temporary table "new_billing_event" to "billing_event"
ALTER TABLE `new_billing_event` RENAME TO `billing_event`;
-- Create index "idx_billing_event_external_event_id_unique" to table: "billing_event"
CREATE UNIQUE INDEX `idx_billing_event_external_event_id_unique` ON `billing_event` (`external_event_id`) WHERE external_event_id IS NOT NULL;
-- Create index "idx_billing_event_subscription_id" to table: "billing_event"
CREATE INDEX `idx_billing_event_subscription_id` ON `billing_event` (`subscription_id`);
-- Create index "idx_billing_event_organization_id" to table: "billing_event"
CREATE INDEX `idx_billing_event_organization_id` ON `billing_event` (`organization_id`);
-- Create index "idx_billing_event_type" to table: "billing_event"
CREATE INDEX `idx_billing_event_type` ON `billing_event` (`type`);
-- Create "new_data_export" table
CREATE TABLE `new_data_export` (`id` text NOT NULL, `project_id` text NOT NULL, `table_id` text NULL, `actor_id` text NOT NULL, `checksum` text NOT NULL, `status` text NOT NULL DEFAULT 'processing', `filter_json` text NULL, `row_count` integer NULL, `json_key` text NULL, `csv_key` text NULL, `xlsx_key` text NULL, `error` text NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000), `expires_at` integer NULL, PRIMARY KEY (`id`), CONSTRAINT `0` FOREIGN KEY (`table_id`) REFERENCES `table` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL, CONSTRAINT `1` FOREIGN KEY (`project_id`) REFERENCES `project` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE);
-- Copy rows from old table "data_export" to new temporary table "new_data_export"
INSERT INTO `new_data_export` (`id`, `project_id`, `table_id`, `actor_id`, `checksum`, `status`, `filter_json`, `row_count`, `json_key`, `csv_key`, `xlsx_key`, `error`, `created_at`, `updated_at`, `expires_at`) SELECT `id`, `project_id`, `table_id`, `actor_id`, `checksum`, `status`, `filter_json`, `row_count`, `json_key`, `csv_key`, `xlsx_key`, `error`, `created_at`, `updated_at`, `expires_at` FROM `data_export`;
-- Drop "data_export" table after copying rows
DROP TABLE `data_export`;
-- Rename temporary table "new_data_export" to "data_export"
ALTER TABLE `new_data_export` RENAME TO `data_export`;
-- Create index "idx_data_export_checksum" to table: "data_export"
CREATE UNIQUE INDEX `idx_data_export_checksum` ON `data_export` (`checksum`) WHERE status = 'complete';
-- Create index "idx_data_export_table_id" to table: "data_export"
CREATE INDEX `idx_data_export_table_id` ON `data_export` (`table_id`);
-- Create index "idx_data_export_project_id" to table: "data_export"
CREATE INDEX `idx_data_export_project_id` ON `data_export` (`project_id`);
-- Create "new_extraction" table
CREATE TABLE `new_extraction` (`id` text NOT NULL, `batch_id` text NOT NULL, `table_id` text NULL, `file_key` text NOT NULL, `file_name` text NOT NULL, `file_type` text NULL, `file_checksum` text NULL, `status` text NOT NULL DEFAULT 'pending', `rows_key` text NULL, `row_count` integer NULL, `confidence` real NULL, `error` text NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY (`id`), CONSTRAINT `0` FOREIGN KEY (`table_id`) REFERENCES `table` (`id`) ON UPDATE NO ACTION ON DELETE SET NULL, CONSTRAINT `1` FOREIGN KEY (`batch_id`) REFERENCES `batch` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE);
-- Copy rows from old table "extraction" to new temporary table "new_extraction"
INSERT INTO `new_extraction` (`id`, `batch_id`, `table_id`, `file_key`, `file_name`, `file_type`, `file_checksum`, `status`, `rows_key`, `row_count`, `confidence`, `error`, `created_at`) SELECT `id`, `batch_id`, `table_id`, `file_key`, `file_name`, `file_type`, `file_checksum`, `status`, `rows_key`, `row_count`, `confidence`, `error`, `created_at` FROM `extraction`;
-- Drop "extraction" table after copying rows
DROP TABLE `extraction`;
-- Rename temporary table "new_extraction" to "extraction"
ALTER TABLE `new_extraction` RENAME TO `extraction`;
-- Create index "idx_extraction_batch_id" to table: "extraction"
CREATE INDEX `idx_extraction_batch_id` ON `extraction` (`batch_id`);
-- Create index "idx_extraction_table_id" to table: "extraction"
CREATE INDEX `idx_extraction_table_id` ON `extraction` (`table_id`);
-- Create index "idx_extraction_checksum" to table: "extraction"
CREATE INDEX `idx_extraction_checksum` ON `extraction` (`file_checksum`);
-- Create "new_organization" table
CREATE TABLE `new_organization` (`id` text NOT NULL, `_search` text NOT NULL DEFAULT '', `name` text NOT NULL, `slug` text NOT NULL, `plan` text NOT NULL DEFAULT 'free', `billing_model` text NOT NULL DEFAULT 'free_flat-overage', `status` text NOT NULL DEFAULT 'active', `billing_email` text NULL, `stripe_customer_id` text NULL, `logo_url` text NULL, `default_insert_mode` text NULL, `default_strictness` text NULL, `retention_policy_days` integer NULL, `timezone` text NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000), `deleted_at` integer NULL, PRIMARY KEY (`id`));
-- Copy rows from old table "organization" to new temporary table "new_organization"
INSERT INTO `new_organization` (`id`, `_search`, `name`, `slug`, `plan`, `status`, `billing_email`, `stripe_customer_id`, `logo_url`, `default_insert_mode`, `default_strictness`, `retention_policy_days`, `timezone`, `created_at`, `updated_at`, `deleted_at`) SELECT `id`, `_search`, `name`, `slug`, `plan`, `status`, `billing_email`, `stripe_customer_id`, `logo_url`, `default_insert_mode`, `default_strictness`, `retention_policy_days`, `timezone`, `created_at`, `updated_at`, `deleted_at` FROM `organization`;
-- Drop "organization" table after copying rows
DROP TABLE `organization`;
-- Rename temporary table "new_organization" to "organization"
ALTER TABLE `new_organization` RENAME TO `organization`;
-- Create index "idx_organization_slug_unique" to table: "organization"
CREATE UNIQUE INDEX `idx_organization_slug_unique` ON `organization` (`slug`) WHERE deleted_at IS NULL;
-- Create index "idx_organization_deleted_at" to table: "organization"
CREATE INDEX `idx_organization_deleted_at` ON `organization` (`deleted_at`) WHERE deleted_at IS NULL;
-- Create index "idx_organization_plan" to table: "organization"
CREATE INDEX `idx_organization_plan` ON `organization` (`plan`) WHERE deleted_at IS NULL;
-- Create index "idx_organization_stripe_customer_id" to table: "organization"
CREATE INDEX `idx_organization_stripe_customer_id` ON `organization` (`stripe_customer_id`);
-- Create "new_organization_member" table
CREATE TABLE `new_organization_member` (`id` text NOT NULL, `_search` text NOT NULL DEFAULT '', `organization_id` text NOT NULL, `user_id` text NULL, `role` text NOT NULL DEFAULT 'member', `permissions` integer NOT NULL DEFAULT 0, `invite_email` text NULL, `invite_token` text NULL, `invited_by_user_id` text NULL, `invited_at` integer NULL, `accepted_at` integer NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY (`id`), CONSTRAINT `0` FOREIGN KEY (`organization_id`) REFERENCES `organization` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE);
-- Copy rows from old table "organization_member" to new temporary table "new_organization_member"
INSERT INTO `new_organization_member` (`id`, `_search`, `organization_id`, `user_id`, `role`, `permissions`, `invite_email`, `invite_token`, `invited_by_user_id`, `invited_at`, `accepted_at`, `created_at`, `updated_at`) SELECT `id`, `_search`, `organization_id`, `user_id`, `role`, `permissions`, `invite_email`, `invite_token`, `invited_by_user_id`, `invited_at`, `accepted_at`, `created_at`, `updated_at` FROM `organization_member`;
-- Drop "organization_member" table after copying rows
DROP TABLE `organization_member`;
-- Rename temporary table "new_organization_member" to "organization_member"
ALTER TABLE `new_organization_member` RENAME TO `organization_member`;
-- Create index "idx_organization_member_org_user_unique" to table: "organization_member"
CREATE UNIQUE INDEX `idx_organization_member_org_user_unique` ON `organization_member` (`organization_id`, `user_id`) WHERE user_id IS NOT NULL;
-- Create index "idx_organization_member_invite_token_unique" to table: "organization_member"
CREATE UNIQUE INDEX `idx_organization_member_invite_token_unique` ON `organization_member` (`invite_token`) WHERE invite_token IS NOT NULL;
-- Create index "idx_organization_member_invite_email_unique" to table: "organization_member"
CREATE UNIQUE INDEX `idx_organization_member_invite_email_unique` ON `organization_member` (`organization_id`, `invite_email`) WHERE invite_email IS NOT NULL AND accepted_at IS NULL;
-- Create index "idx_organization_member_owner_unique" to table: "organization_member"
CREATE UNIQUE INDEX `idx_organization_member_owner_unique` ON `organization_member` (`organization_id`) WHERE role = 'owner';
-- Create index "idx_organization_member_organization_id" to table: "organization_member"
CREATE INDEX `idx_organization_member_organization_id` ON `organization_member` (`organization_id`);
-- Create index "idx_organization_member_user_id" to table: "organization_member"
CREATE INDEX `idx_organization_member_user_id` ON `organization_member` (`user_id`);
-- Create "new_project" table
CREATE TABLE `new_project` (`id` text NOT NULL, `_search` text NOT NULL DEFAULT '', `organization_id` text NOT NULL, `name` text NOT NULL, `slug` text NOT NULL, `status` text NOT NULL DEFAULT 'active', `default_insert_mode` text NULL, `default_strictness` text NULL, `retention_policy_days` integer NULL, `timezone` text NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000), `deleted_at` integer NULL, PRIMARY KEY (`id`), CONSTRAINT `0` FOREIGN KEY (`organization_id`) REFERENCES `organization` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE);
-- Copy rows from old table "project" to new temporary table "new_project"
INSERT INTO `new_project` (`id`, `_search`, `organization_id`, `name`, `slug`, `status`, `default_insert_mode`, `default_strictness`, `retention_policy_days`, `timezone`, `created_at`, `updated_at`, `deleted_at`) SELECT `id`, `_search`, `organization_id`, `name`, `slug`, `status`, `default_insert_mode`, `default_strictness`, `retention_policy_days`, `timezone`, `created_at`, `updated_at`, `deleted_at` FROM `project`;
-- Drop "project" table after copying rows
DROP TABLE `project`;
-- Rename temporary table "new_project" to "project"
ALTER TABLE `new_project` RENAME TO `project`;
-- Create index "idx_project_organization_slug_unique" to table: "project"
CREATE UNIQUE INDEX `idx_project_organization_slug_unique` ON `project` (`organization_id`, `slug`) WHERE deleted_at IS NULL;
-- Create index "idx_project_organization_id" to table: "project"
CREATE INDEX `idx_project_organization_id` ON `project` (`organization_id`) WHERE deleted_at IS NULL;
-- Create index "idx_project_deleted_at" to table: "project"
CREATE INDEX `idx_project_deleted_at` ON `project` (`deleted_at`) WHERE deleted_at IS NULL;
-- Create "new_project_member" table
CREATE TABLE `new_project_member` (`id` text NOT NULL, `_search` text NOT NULL DEFAULT '', `project_id` text NOT NULL, `user_id` text NULL, `role` text NOT NULL DEFAULT 'member', `permissions` integer NOT NULL DEFAULT 0, `collaborator` integer NOT NULL DEFAULT 0, `invite_email` text NULL, `invite_token` text NULL, `invited_by_user_id` text NULL, `invited_at` integer NULL, `accepted_at` integer NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY (`id`), CONSTRAINT `0` FOREIGN KEY (`project_id`) REFERENCES `project` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE);
-- Copy rows from old table "project_member" to new temporary table "new_project_member"
INSERT INTO `new_project_member` (`id`, `_search`, `project_id`, `user_id`, `role`, `permissions`, `collaborator`, `invite_email`, `invite_token`, `invited_by_user_id`, `invited_at`, `accepted_at`, `created_at`, `updated_at`) SELECT `id`, `_search`, `project_id`, `user_id`, `role`, `permissions`, `collaborator`, `invite_email`, `invite_token`, `invited_by_user_id`, `invited_at`, `accepted_at`, `created_at`, `updated_at` FROM `project_member`;
-- Drop "project_member" table after copying rows
DROP TABLE `project_member`;
-- Rename temporary table "new_project_member" to "project_member"
ALTER TABLE `new_project_member` RENAME TO `project_member`;
-- Create index "idx_project_member_project_user_unique" to table: "project_member"
CREATE UNIQUE INDEX `idx_project_member_project_user_unique` ON `project_member` (`project_id`, `user_id`) WHERE user_id IS NOT NULL;
-- Create index "idx_project_member_invite_token_unique" to table: "project_member"
CREATE UNIQUE INDEX `idx_project_member_invite_token_unique` ON `project_member` (`invite_token`) WHERE invite_token IS NOT NULL;
-- Create index "idx_project_member_invite_email_unique" to table: "project_member"
CREATE UNIQUE INDEX `idx_project_member_invite_email_unique` ON `project_member` (`project_id`, `invite_email`) WHERE invite_email IS NOT NULL AND accepted_at IS NULL;
-- Create index "idx_project_member_owner_unique" to table: "project_member"
CREATE UNIQUE INDEX `idx_project_member_owner_unique` ON `project_member` (`project_id`) WHERE role = 'owner';
-- Create index "idx_project_member_project_id" to table: "project_member"
CREATE INDEX `idx_project_member_project_id` ON `project_member` (`project_id`);
-- Create index "idx_project_member_user_id" to table: "project_member"
CREATE INDEX `idx_project_member_user_id` ON `project_member` (`user_id`);
-- Create "new_subscription" table
CREATE TABLE `new_subscription` (`id` text NOT NULL, `organization_id` text NOT NULL, `plan_id` text NOT NULL DEFAULT 'free', `status` text NOT NULL DEFAULT 'active', `free` integer NOT NULL DEFAULT 1, `stripe_subscription_id` text NULL, `stripe_customer_id` text NULL, `stripe_price_id` text NULL, `current_period_start` integer NULL, `current_period_end` integer NULL, `cancel_at_period_end` integer NOT NULL DEFAULT 0, `trial_end` integer NULL, `last_payment_intent_id` text NULL, `last_payment_status` text NULL, `last_webhook_event_id` text NULL, `webhook_confirmed_at` integer NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY (`id`), CONSTRAINT `0` FOREIGN KEY (`organization_id`) REFERENCES `organization` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE);
-- Copy rows from old table "subscription" to new temporary table "new_subscription"
INSERT INTO `new_subscription` (`id`, `organization_id`, `plan_id`, `status`, `free`, `stripe_subscription_id`, `stripe_customer_id`, `stripe_price_id`, `current_period_start`, `current_period_end`, `cancel_at_period_end`, `trial_end`, `last_payment_intent_id`, `last_payment_status`, `last_webhook_event_id`, `webhook_confirmed_at`, `created_at`, `updated_at`) SELECT `id`, `organization_id`, `plan_id`, `status`, `free`, `stripe_subscription_id`, `stripe_customer_id`, `stripe_price_id`, `current_period_start`, `current_period_end`, `cancel_at_period_end`, `trial_end`, `last_payment_intent_id`, `last_payment_status`, `last_webhook_event_id`, `webhook_confirmed_at`, `created_at`, `updated_at` FROM `subscription`;
-- Drop "subscription" table after copying rows
DROP TABLE `subscription`;
-- Rename temporary table "new_subscription" to "subscription"
ALTER TABLE `new_subscription` RENAME TO `subscription`;
-- Create index "idx_subscription_organization_id_unique" to table: "subscription"
CREATE UNIQUE INDEX `idx_subscription_organization_id_unique` ON `subscription` (`organization_id`);
-- Create index "idx_subscription_stripe_subscription_id" to table: "subscription"
CREATE INDEX `idx_subscription_stripe_subscription_id` ON `subscription` (`stripe_subscription_id`);
-- Create index "idx_subscription_stripe_customer_id" to table: "subscription"
CREATE INDEX `idx_subscription_stripe_customer_id` ON `subscription` (`stripe_customer_id`);
-- Create index "idx_subscription_status" to table: "subscription"
CREATE INDEX `idx_subscription_status` ON `subscription` (`status`);
-- Create "new_table" table
CREATE TABLE `new_table` (`id` text NOT NULL, `_search` text NOT NULL DEFAULT '', `project_id` text NOT NULL, `name` text NOT NULL, `slug` text NOT NULL, `columns_json` text NOT NULL, `instruction` text NULL, `strictness` text NOT NULL DEFAULT 'strict', `insert_mode` text NOT NULL DEFAULT 'append', `merge_columns_json` text NULL, `default_sort` text NULL, `row_count` integer NOT NULL DEFAULT 0, `usage_count` integer NOT NULL DEFAULT 0, `data_version` integer NOT NULL DEFAULT 0, `fts_version` integer NOT NULL DEFAULT 0, `last_used_at` integer NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000), `deleted_at` integer NULL, PRIMARY KEY (`id`), CONSTRAINT `0` FOREIGN KEY (`project_id`) REFERENCES `project` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE, CONSTRAINT `merge_requires_merge_mode` CHECK (insert_mode != 'merge' OR merge_columns_json IS NOT NULL));
-- Copy rows from old table "table" to new temporary table "new_table"
INSERT INTO `new_table` (`id`, `_search`, `project_id`, `name`, `slug`, `columns_json`, `instruction`, `strictness`, `insert_mode`, `merge_columns_json`, `row_count`, `usage_count`, `data_version`, `fts_version`, `last_used_at`, `created_at`, `updated_at`, `deleted_at`) SELECT `id`, `_search`, `project_id`, `name`, `slug`, `columns_json`, `instruction`, `strictness`, `insert_mode`, `merge_columns_json`, `row_count`, `usage_count`, `data_version`, `fts_version`, `last_used_at`, `created_at`, `updated_at`, `deleted_at` FROM `table`;
-- Drop "table" table after copying rows
DROP TABLE `table`;
-- Rename temporary table "new_table" to "table"
ALTER TABLE `new_table` RENAME TO `table`;
-- Create index "idx_table_project_slug_unique" to table: "table"
CREATE UNIQUE INDEX `idx_table_project_slug_unique` ON `table` (`project_id`, `slug`) WHERE deleted_at IS NULL;
-- Create index "idx_table_project_id" to table: "table"
CREATE INDEX `idx_table_project_id` ON `table` (`project_id`) WHERE deleted_at IS NULL;
-- Create index "idx_table_deleted_at" to table: "table"
CREATE INDEX `idx_table_deleted_at` ON `table` (`deleted_at`) WHERE deleted_at IS NULL;
-- Create index "idx_table_last_used" to table: "table"
CREATE INDEX `idx_table_last_used` ON `table` (`last_used_at`);
-- Create "new_usage" table
CREATE TABLE `new_usage` (`id` text NOT NULL, `organization_id` text NOT NULL, `period` integer NOT NULL, `api_requests_used` integer NOT NULL DEFAULT 0, `extractions_used` integer NOT NULL DEFAULT 0, `export_rows_used` integer NOT NULL DEFAULT 0, PRIMARY KEY (`id`), CONSTRAINT `0` FOREIGN KEY (`organization_id`) REFERENCES `organization` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE);
-- Copy rows from old table "usage" to new temporary table "new_usage"
INSERT INTO `new_usage` (`id`, `organization_id`, `period`, `api_requests_used`, `extractions_used`, `export_rows_used`) SELECT `id`, `organization_id`, `period`, `api_requests_used`, `extractions_used`, `export_rows_used` FROM `usage`;
-- Drop "usage" table after copying rows
DROP TABLE `usage`;
-- Rename temporary table "new_usage" to "usage"
ALTER TABLE `new_usage` RENAME TO `usage`;
-- Create index "idx_usage_organization_period" to table: "usage"
CREATE UNIQUE INDEX `idx_usage_organization_period` ON `usage` (`organization_id`, `period`);
-- Create "new_webhook" table
CREATE TABLE `new_webhook` (`id` text NOT NULL, `_search` text NOT NULL DEFAULT '', `name` text NULL, `organization_id` text NOT NULL, `url` text NOT NULL, `_secret` text NOT NULL, `_secret_previous` text NULL, `secret_rotated_at` integer NULL, `events_json` text NOT NULL, `active` integer NOT NULL DEFAULT 1, `failure_count` integer NOT NULL DEFAULT 0, `last_triggered_at` integer NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY (`id`), CONSTRAINT `0` FOREIGN KEY (`organization_id`) REFERENCES `organization` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE);
-- Copy rows from old table "webhook" to new temporary table "new_webhook"
INSERT INTO `new_webhook` (`id`, `_search`, `name`, `organization_id`, `url`, `_secret`, `_secret_previous`, `secret_rotated_at`, `events_json`, `active`, `failure_count`, `last_triggered_at`, `created_at`, `updated_at`) SELECT `id`, `_search`, `name`, `organization_id`, `url`, `_secret`, `_secret_previous`, `secret_rotated_at`, `events_json`, `active`, `failure_count`, `last_triggered_at`, `created_at`, `updated_at` FROM `webhook`;
-- Drop "webhook" table after copying rows
DROP TABLE `webhook`;
-- Rename temporary table "new_webhook" to "webhook"
ALTER TABLE `new_webhook` RENAME TO `webhook`;
-- Create index "idx_webhook_organization_id" to table: "webhook"
CREATE INDEX `idx_webhook_organization_id` ON `webhook` (`organization_id`);
-- Create "new_webhook_delivery" table
CREATE TABLE `new_webhook_delivery` (`id` text NOT NULL, `webhook_id` text NOT NULL, `event` text NOT NULL, `payload_json` text NOT NULL, `status` text NOT NULL DEFAULT 'pending', `http_status` integer NULL, `response_body` text NULL, `attempt` integer NOT NULL DEFAULT 1, `next_retry_at` integer NULL, `delivered_at` integer NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY (`id`), CONSTRAINT `0` FOREIGN KEY (`webhook_id`) REFERENCES `webhook` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE);
-- Copy rows from old table "webhook_delivery" to new temporary table "new_webhook_delivery"
INSERT INTO `new_webhook_delivery` (`id`, `webhook_id`, `event`, `payload_json`, `status`, `http_status`, `response_body`, `attempt`, `next_retry_at`, `delivered_at`, `created_at`) SELECT `id`, `webhook_id`, `event`, `payload_json`, `status`, `http_status`, `response_body`, `attempt`, `next_retry_at`, `delivered_at`, `created_at` FROM `webhook_delivery`;
-- Drop "webhook_delivery" table after copying rows
DROP TABLE `webhook_delivery`;
-- Rename temporary table "new_webhook_delivery" to "webhook_delivery"
ALTER TABLE `new_webhook_delivery` RENAME TO `webhook_delivery`;
-- Create index "idx_webhook_delivery_webhook_id" to table: "webhook_delivery"
CREATE INDEX `idx_webhook_delivery_webhook_id` ON `webhook_delivery` (`webhook_id`);
-- Create index "idx_webhook_delivery_status" to table: "webhook_delivery"
CREATE INDEX `idx_webhook_delivery_status` ON `webhook_delivery` (`status`) WHERE status = 'pending';
-- Create index "idx_webhook_delivery_next_retry" to table: "webhook_delivery"
CREATE INDEX `idx_webhook_delivery_next_retry` ON `webhook_delivery` (`next_retry_at`) WHERE status = 'pending';
-- Create "lifecycle_email_log" table
CREATE TABLE `lifecycle_email_log` (`id` text NOT NULL, `organization_id` text NOT NULL, `user_id` text NOT NULL, `email_type` text NOT NULL, `period` integer NOT NULL DEFAULT 0, `sent_at` integer NOT NULL, PRIMARY KEY (`id`), CONSTRAINT `0` FOREIGN KEY (`organization_id`) REFERENCES `organization` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE);
-- Create index "idx_lifecycle_email_log_dedup" to table: "lifecycle_email_log"
CREATE UNIQUE INDEX `idx_lifecycle_email_log_dedup` ON `lifecycle_email_log` (`organization_id`, `email_type`, `period`);
-- Create index "idx_lifecycle_email_log_org" to table: "lifecycle_email_log"
CREATE INDEX `idx_lifecycle_email_log_org` ON `lifecycle_email_log` (`organization_id`);
-- Create index "idx_lifecycle_email_log_sent_at" to table: "lifecycle_email_log"
CREATE INDEX `idx_lifecycle_email_log_sent_at` ON `lifecycle_email_log` (`sent_at`);
-- Enable back the enforcement of foreign-keys constraints
PRAGMA foreign_keys = on;
