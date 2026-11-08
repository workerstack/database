-- Hand-written (see 20261003181500): additive only.
-- Step-up re-authentication stamp on the session (copied across rotations).
ALTER TABLE `user_refresh_token` ADD COLUMN `reauthenticated_at` integer NULL;
