-- Hand-written (see 20261003181500): additive only.
-- The dashboard's per-browser device id on security events (new-sign-in alerts recognize devices by it).
ALTER TABLE `user_security_event` ADD COLUMN `device_id` text NULL;
