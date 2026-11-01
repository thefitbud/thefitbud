-- X4i / D-W3-8: push delivery is at-most-once. The attempt marker is written
-- immediately before the provider call, so a queue retry that finds a marker
-- with no recorded outcome records the delivery as `uncertain` instead of
-- sending the same reminder a second time.
--
-- Additive and nullable, with no backfill: existing rows keep NULL, which reads
-- as "no attempt in flight", exactly the state every delivery written before
-- this migration is in. `provider_status` is a plain text column, so the new
-- `uncertain` value needs no schema change.
ALTER TABLE `notification_deliveries` ADD COLUMN `attempt_started_at` text;
