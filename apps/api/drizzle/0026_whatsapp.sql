PRAGMA defer_foreign_keys = true;

CREATE TABLE IF NOT EXISTS `whatsapp_templates` (
  `key` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `category` text NOT NULL,
  `language` text NOT NULL DEFAULT 'en',
  `status` text NOT NULL,
  `version` integer NOT NULL DEFAULT 1,
  `body_json` text NOT NULL,
  `updated_at` text NOT NULL
);

CREATE TABLE IF NOT EXISTS `whatsapp_messages` (
  `id` text PRIMARY KEY NOT NULL,
  `template_key` text NOT NULL,
  `to_hash` text NOT NULL,
  `wamid` text,
  `status` text NOT NULL,
  `error_code` text,
  `relationship_id` text REFERENCES `coaching_relationships`(`id`),
  `trainee_user_id` text REFERENCES `users`(`id`),
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

CREATE TABLE IF NOT EXISTS `whatsapp_ledger` (
  `id` text PRIMARY KEY NOT NULL,
  `month_key` text NOT NULL,
  `template_key` text NOT NULL,
  `message_id` text REFERENCES `whatsapp_messages`(`id`),
  `est_cost_paise` integer NOT NULL,
  `cost_paise` integer,
  `status` text NOT NULL,
  `created_at` text NOT NULL
);
CREATE INDEX IF NOT EXISTS `whatsapp_ledger_month_idx` ON `whatsapp_ledger` (`month_key`);

CREATE TABLE IF NOT EXISTS `whatsapp_webhook_events` (
  `id` text PRIMARY KEY NOT NULL,
  `received_at` text NOT NULL,
  `kind` text NOT NULL
);

CREATE TABLE IF NOT EXISTS `whatsapp_opt_outs` (
  `user_id` text PRIMARY KEY NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `at` text NOT NULL,
  `source` text NOT NULL
);

INSERT OR IGNORE INTO `whatsapp_templates` (`key`, `name`, `category`, `status`, `version`, `body_json`, `updated_at`) VALUES
  ('W-OTP', 'FitBud login code', 'authentication', 'draft', 1, '{}', '2026-01-01T00:00:00.000Z'),
  ('W-FB', 'FitBud reminder fallback', 'utility', 'draft', 1, '{}', '2026-01-01T00:00:00.000Z'),
  ('W-CHK', 'Check-in reminder', 'utility', 'draft', 1, '{}', '2026-01-01T00:00:00.000Z'),
  ('W-PLAN', 'Plan published', 'utility', 'draft', 1, '{}', '2026-01-01T00:00:00.000Z'),
  ('W-RENEW', 'Renewal reminder', 'utility', 'draft', 1, '{}', '2026-01-01T00:00:00.000Z');
