-- Preferred check-in form version per coaching configuration schedule (TW-25.1 / TW-11).
ALTER TABLE `checkin_schedules`
  ADD COLUMN `preferred_checkin_form_version_id` text
  REFERENCES `checkin_form_versions`(`id`);
