-- Hand-written (see 20261003181500): additive only.
-- Passkeys (WebAuthn credentials) and their single-use challenges.
CREATE TABLE `user_passkey` (`id` text NOT NULL, `user_id` text NOT NULL, `credential_id` text NOT NULL, `public_key` text NOT NULL, `counter` integer NOT NULL DEFAULT 0, `transports_json` text NULL, `aaguid` text NULL, `device_type` text NOT NULL, `backed_up` integer NOT NULL DEFAULT 0, `name` text NOT NULL, `last_used_at` integer NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY (`id`), CONSTRAINT `fk_user_passkey_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE);
CREATE UNIQUE INDEX `idx_user_passkey_credential_unique` ON `user_passkey` (`credential_id`);
CREATE INDEX `idx_user_passkey_user_id` ON `user_passkey` (`user_id`);
CREATE TABLE `webauthn_challenge` (`id` text NOT NULL, `challenge` text NOT NULL, `purpose` text NOT NULL, `user_id` text NULL, `expires_at` integer NOT NULL, `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000), PRIMARY KEY (`id`), CONSTRAINT `fk_webauthn_challenge_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE NO ACTION ON DELETE CASCADE);
CREATE UNIQUE INDEX `idx_webauthn_challenge_unique` ON `webauthn_challenge` (`challenge`);
CREATE INDEX `idx_webauthn_challenge_expires_at` ON `webauthn_challenge` (`expires_at`);
