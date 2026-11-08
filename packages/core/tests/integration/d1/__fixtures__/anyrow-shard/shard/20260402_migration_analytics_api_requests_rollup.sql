-- Materialize rolled-up API request usage off the AE hot path.
ALTER TABLE `usage` ADD COLUMN `api_requests_used` integer NOT NULL DEFAULT 0;
