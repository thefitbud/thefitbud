-- Z6-16 (D-W6-7, D-W6-8): archived account state with archive and purge dates.
--
-- Additive: users gains two nullable columns, so existing rows stay 'active' with
-- NULL dates and no table is rebuilt (users is referenced by many foreign keys).
-- account_state has no CHECK today (the allowed values live in schema.ts only), so
-- 'archived' needs no constraint change. SQLite cannot add a table CHECK with ALTER,
-- so each new column carries a column CHECK that reads account_state: the dates are
-- set exactly when the account is archived, and NULL otherwise.
ALTER TABLE `users` ADD COLUMN `archived_at` text
  CONSTRAINT `users_archived_at_chk`
  CHECK ((`account_state` = 'archived') = (`archived_at` IS NOT NULL));
ALTER TABLE `users` ADD COLUMN `purge_after` text
  CONSTRAINT `users_purge_after_chk`
  CHECK ((`account_state` = 'archived') = (`purge_after` IS NOT NULL));

-- The daily purge query selects archived accounts past their purge date.
CREATE INDEX `users_purge_after_idx` ON `users` (`purge_after`);
