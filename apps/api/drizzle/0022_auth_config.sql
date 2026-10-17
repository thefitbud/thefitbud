PRAGMA defer_foreign_keys = true;

CREATE TABLE IF NOT EXISTS `user_identities` (
  `user_id` text PRIMARY KEY NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `email` text,
  `email_norm` text UNIQUE,
  `mobile_e164` text UNIQUE,
  `password_hash` text,
  `password_updated_at` text,
  `failed_login_count` integer NOT NULL DEFAULT 0,
  `locked_until` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

CREATE TABLE IF NOT EXISTS `auth_otps` (
  `id` text PRIMARY KEY NOT NULL,
  `identifier_hash` text NOT NULL,
  `code_hash` text NOT NULL,
  `purpose` text NOT NULL CHECK (`purpose` IN ('login', 'reset', 'invite')),
  `expires_at` text NOT NULL,
  `attempts` integer NOT NULL DEFAULT 0,
  `channels_sent` text NOT NULL DEFAULT '[]',
  `consumed_at` text,
  `invalidated_at` text,
  `created_at` text NOT NULL,
  `ip_hash` text
);
CREATE INDEX IF NOT EXISTS `auth_otps_identifier_idx` ON `auth_otps` (`identifier_hash`, `purpose`, `created_at`);

CREATE TABLE IF NOT EXISTS `auth_rate_limits` (
  `bucket_key` text PRIMARY KEY NOT NULL,
  `window_start` text NOT NULL,
  `count` integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS `feature_flags` (
  `key` text PRIMARY KEY NOT NULL,
  `enabled` integer NOT NULL DEFAULT 0,
  `updated_at` text NOT NULL,
  `updated_by` text
);

CREATE TABLE IF NOT EXISTS `dev_mail_outbox` (
  `id` text PRIMARY KEY NOT NULL,
  `to_address` text NOT NULL,
  `template` text NOT NULL,
  `subject` text NOT NULL,
  `text_body` text NOT NULL,
  `html_body` text,
  `created_at` text NOT NULL
);
CREATE INDEX IF NOT EXISTS `dev_mail_outbox_to_idx` ON `dev_mail_outbox` (`to_address`, `created_at`);

INSERT OR IGNORE INTO `feature_flags` (`key`, `enabled`, `updated_at`) VALUES
  ('wa_otp', 0, '2026-01-01T00:00:00.000Z'),
  ('wa_automation', 0, '2026-01-01T00:00:00.000Z'),
  ('steps_enabled', 0, '2026-01-01T00:00:00.000Z');
