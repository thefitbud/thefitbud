-- W13-12: one lookup for the templates list "used by" count.
-- Effective plan versions are filtered by source template. Additive index only.
CREATE INDEX `plan_versions_source_template_status_idx` ON `plan_versions` (`source_template_id`, `status`);
