-- Z6-4 (v13 B4a): daily steps and a per-client steps target.
--
-- Additive: coaching_configurations gains one NOT NULL column with a constant
-- default, so every existing configuration reads 8000 and no table is rebuilt.
-- daily_steps is new and empty.
ALTER TABLE `coaching_configurations` ADD COLUMN `steps_target` integer NOT NULL DEFAULT 8000;

-- One row per client per trainee-local civil day (YYYY-MM-DD). The relationship
-- is the owner; rows go with it (ON DELETE CASCADE), so wiping or purging a
-- relationship needs no separate step-row delete.
CREATE TABLE `daily_steps` (
  `id` text PRIMARY KEY NOT NULL,
  `coaching_relationship_id` text NOT NULL,
  `local_date` text NOT NULL,
  `steps` integer NOT NULL,
  `source` text NOT NULL,
  `synced_at` text NOT NULL,
  FOREIGN KEY (`coaching_relationship_id`) REFERENCES `coaching_relationships`(`id`) ON DELETE CASCADE,
  CONSTRAINT `daily_steps_steps_chk`
    CHECK (typeof(`steps`) = 'integer' AND `steps` BETWEEN 0 AND 200000),
  CONSTRAINT `daily_steps_local_date_chk`
    CHECK (`local_date` GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  CONSTRAINT `daily_steps_source_chk`
    CHECK (`source` IN ('apple_health', 'health_connect', 'manual'))
);
CREATE UNIQUE INDEX `daily_steps_relationship_date_uidx`
  ON `daily_steps` (`coaching_relationship_id`, `local_date`);
