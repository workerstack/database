-- Hand-written: additive only (a generated shard diff would rebuild tables).
-- The SIGNUP_PLAN_MODE an org was created under at signup, for the Free vs Pro-trial A/B analysis.
ALTER TABLE `organization` ADD COLUMN `signup_plan_mode` text NULL;
