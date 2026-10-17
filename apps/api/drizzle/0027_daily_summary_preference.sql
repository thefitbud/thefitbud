-- Migration: dedicated daily summary notification preference (TR-16)
ALTER TABLE `notification_preferences` ADD COLUMN `daily_summary_reminder` integer NOT NULL DEFAULT 1;
