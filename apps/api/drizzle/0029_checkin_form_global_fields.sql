-- Align the seeded global check-in form (version 1) with GLOBAL_CHECKIN_FORM_FIELDS.
-- Versions stay insert-only after this one-time correction. Do not add a second global version.
DROP TRIGGER IF EXISTS `checkin_form_versions_insert_only`;

UPDATE `checkin_form_versions`
SET `schema_json` = '{"fields":[{"id":"body_weight","label":"Body weight","type":"measurement","measurementType":"body_weight_kg","required":false},{"id":"waist","label":"Waist","type":"measurement","measurementType":"waist_cm","required":false},{"id":"photo_front","label":"Front","type":"photo_intent","photoSlot":"front","required":false},{"id":"photo_side","label":"Side","type":"photo_intent","photoSlot":"side","required":false},{"id":"photo_back","label":"Back","type":"photo_intent","photoSlot":"back","required":false},{"id":"wellbeing","label":"Wellbeing","type":"short_text","required":true,"maxLength":1000},{"id":"notes","label":"Notes","type":"long_text","required":false,"maxLength":2000}]}'
WHERE `id` = 'c1000001-0000-4000-8000-000000000011';

CREATE TRIGGER `checkin_form_versions_insert_only`
BEFORE UPDATE ON `checkin_form_versions`
BEGIN
	SELECT RAISE(ABORT, 'check-in form versions are insert-only');
END;
