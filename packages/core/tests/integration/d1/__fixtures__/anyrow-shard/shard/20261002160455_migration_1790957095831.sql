-- Add column "scheduled_plan_id" to table: "subscription"
ALTER TABLE `subscription` ADD COLUMN `scheduled_plan_id` text NULL;
-- Add column "scheduled_price_id" to table: "subscription"
ALTER TABLE `subscription` ADD COLUMN `scheduled_price_id` text NULL;
-- Add column "scheduled_at" to table: "subscription"
ALTER TABLE `subscription` ADD COLUMN `scheduled_at` integer NULL;
