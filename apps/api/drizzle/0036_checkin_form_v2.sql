-- Z6-2 (v13 B2a, D2 option A, D-W6-17): global check-in form v2 with a standard key per question.
--
-- Insert-only. Version 1 and every check-in pinned to it are untouched, and the
-- insert-only trigger from 0019 stays in place. New assignments pin v2 through
-- DEFAULT_CHECKIN_FORM_VERSION_ID in packages/core; schedules that explicitly
-- prefer a version keep it.
INSERT INTO `checkin_form_versions` (
	`id`,
	`template_id`,
	`key`,
	`version`,
	`scope`,
	`trainer_user_id`,
	`schema_json`,
	`created_at`
) VALUES (
	'c1000001-0000-4000-8000-000000000012',
	'c1000001-0000-4000-8000-000000000001',
	'mvp',
	2,
	'global',
	NULL,
	'{"fields":[{"key":"weight","id":"weight","label":"Body weight","type":"measurement","measurementType":"body_weight_kg","required":false},{"key":"waist","id":"waist","label":"Waist","type":"measurement","measurementType":"waist_cm","required":false},{"key":"hips","id":"hips","label":"Hips","type":"measurement","measurementType":"hip_cm","required":false},{"key":"chest","id":"chest","label":"Chest","type":"measurement","measurementType":"chest_cm","required":false},{"key":"arm","id":"arm","label":"Arm","type":"measurement","measurementType":"other","unit":"cm","required":false},{"key":"thigh","id":"thigh","label":"Thigh","type":"measurement","measurementType":"other","unit":"cm","required":false},{"key":"photo_front","id":"photo_front","label":"Front","type":"photo_intent","photoSlot":"front","required":false},{"key":"photo_side","id":"photo_side","label":"Side","type":"photo_intent","photoSlot":"side","required":false},{"key":"photo_back","id":"photo_back","label":"Back","type":"photo_intent","photoSlot":"back","required":false},{"key":"energy","id":"energy","label":"Energy","type":"scale_1_5","required":false},{"key":"sleep_quality","id":"sleep_quality","label":"Sleep quality","type":"scale_1_5","required":false},{"key":"stress","id":"stress","label":"Stress","type":"scale_1_5","required":false},{"key":"hunger","id":"hunger","label":"Hunger","type":"scale_1_5","required":false},{"key":"notes","id":"notes","label":"Notes","type":"long_text","required":false,"maxLength":2000}]}',
	'2026-11-06T00:00:00.000Z'
);
