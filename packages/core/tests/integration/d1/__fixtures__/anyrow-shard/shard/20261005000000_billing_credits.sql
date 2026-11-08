-- Hand-written: additive + a column rename (a generated shard diff would rebuild tables).
-- Billing is metered in credits (1 per PDF page or image, 1 per other file): the usage counter
-- holds credits now; credit packs become per-org grants consumed after the monthly allowance.
ALTER TABLE `usage` RENAME COLUMN `extractions_used` TO `credits_used`;
CREATE TABLE `credit_grant` (`id` text NOT NULL, `organization_id` text NOT NULL, `credits` integer NOT NULL, `credits_used` integer NOT NULL DEFAULT 0, `expires_at` integer NOT NULL, `stripe_checkout_session_id` text NOT NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY (`id`), CONSTRAINT `0` FOREIGN KEY (`organization_id`) REFERENCES `organization` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE, CONSTRAINT `credits_positive` CHECK (credits >= 1), CONSTRAINT `credits_used_in_range` CHECK (credits_used >= 0 AND credits_used <= credits));
CREATE UNIQUE INDEX `idx_credit_grant_checkout_session_unique` ON `credit_grant` (`stripe_checkout_session_id`);
CREATE INDEX `idx_credit_grant_org_expires` ON `credit_grant` (`organization_id`, `expires_at`);
