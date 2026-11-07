-- Z6-8b (D-W6-42, D-W6-34 (b)): the name a trainer knows a client by and a contact
-- phone, both trainer-owned and stored on the coaching relationship only.
--
-- Additive: two nullable ADD COLUMNs with no default, so no table is rebuilt and no
-- row is rewritten; every existing relationship reads NULL ("not set"). SQLite
-- cannot add a table CHECK with ALTER, so each column carries a named column CHECK
-- that mirrors the API's validation (the API answers 400 before a CHECK can fail):
-- - client_display_name: trimmed, 1 to 120 characters.
-- - contact_phone_e164: '+' then 10 to 15 digits, as core normalizeWhatsappE164
--   stores it.
-- The sign-in identifier (user_identities.mobile_e164) and the trainee's own name
-- (trainee_profiles.display_name) are not touched. No goal column: the goal stays
-- in coaching_configurations.

ALTER TABLE `coaching_relationships` ADD COLUMN `client_display_name` text
  CONSTRAINT `coaching_relationships_client_display_name_chk` CHECK (`client_display_name` IS NULL OR (length(`client_display_name`) BETWEEN 1 AND 120 AND trim(`client_display_name`) = `client_display_name`));
ALTER TABLE `coaching_relationships` ADD COLUMN `contact_phone_e164` text
  CONSTRAINT `coaching_relationships_contact_phone_e164_chk` CHECK (`contact_phone_e164` IS NULL OR (length(`contact_phone_e164`) BETWEEN 11 AND 16 AND substr(`contact_phone_e164`, 1, 1) = '+' AND substr(`contact_phone_e164`, 2) NOT GLOB '*[^0-9]*'));
