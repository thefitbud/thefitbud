-- Z6-1 (v13 B1a): numeric set loads for strength charts.
--
-- Additive: the load labels stay and remain the display source. New sets get
-- the columns from the write paths (Z6-15); this migration backfills every
-- existing row from its labels with the rules of `src/domain/load-parser.ts`
-- (bare numbers stay `text`: no exercise default unit is stored, and the
-- parser never guesses). `migration-chain.test.ts` checks this SQL and the
-- parser agree on every parser test case. Change both together.
--
-- load_kind follows the actual label once one is logged, else the prescribed one.
-- updated_at is not touched: the backfill is not a user edit.
ALTER TABLE `set_executions` ADD COLUMN `prescribed_load_kg` real;
ALTER TABLE `set_executions` ADD COLUMN `actual_load_kg` real;
ALTER TABLE `set_executions` ADD COLUMN `load_kind` text DEFAULT 'text' NOT NULL
  CONSTRAINT `set_executions_load_kind_chk`
  CHECK (`load_kind` IN ('kg', 'bodyweight', 'bodyweight_plus', 'text'));

-- Working table, one row per non-blank label: side 'p' prescribed, 'a' actual.
-- kind NULL = not decided yet.
CREATE TABLE `_z6_1_load_backfill` (
  `set_id` text NOT NULL,
  `side` text NOT NULL,
  `s` text NOT NULL,
  `kind` text,
  `num` text,
  `unit` text,
  `kg` real,
  PRIMARY KEY (`set_id`, `side`)
);

-- normalize(): tabs and line breaks to spaces, ASCII lower-case, trim spaces.
INSERT INTO `_z6_1_load_backfill` (`set_id`, `side`, `s`)
SELECT `id`, 'p', trim(lower(replace(replace(replace(`prescribed_load_label`, char(9), ' '), char(10), ' '), char(13), ' ')), ' ')
FROM `set_executions`
WHERE `prescribed_load_label` IS NOT NULL;

INSERT INTO `_z6_1_load_backfill` (`set_id`, `side`, `s`)
SELECT `id`, 'a', trim(lower(replace(replace(replace(`actual_load_label`, char(9), ' '), char(10), ' '), char(13), ' ')), ' ')
FROM `set_executions`
WHERE `actual_load_label` IS NOT NULL;

DELETE FROM `_z6_1_load_backfill` WHERE `s` = '';

-- One decimal comma ("42,5 kg") becomes a point; any other comma is text.
UPDATE `_z6_1_load_backfill`
SET `s` = replace(`s`, ',', '.')
WHERE length(`s`) - length(replace(`s`, ',', '')) = 1
  AND instr(`s`, '.') = 0
  AND (`s` GLOB '*[0-9],[0-9]'
    OR `s` GLOB '*[0-9],[0-9][0-9]'
    OR `s` GLOB '*[0-9],[0-9][^0-9]*'
    OR `s` GLOB '*[0-9],[0-9][0-9][^0-9]*');

UPDATE `_z6_1_load_backfill` SET `kind` = 'text' WHERE instr(`s`, ',') > 0;

-- Collapse runs of spaces (three passes), reject numbers split by a space, drop spaces.
UPDATE `_z6_1_load_backfill`
SET `s` = replace(replace(replace(`s`, '  ', ' '), '  ', ' '), '  ', ' ')
WHERE `kind` IS NULL;

UPDATE `_z6_1_load_backfill`
SET `kind` = 'text'
WHERE `kind` IS NULL AND `s` GLOB '*[0-9.] [0-9.]*';

UPDATE `_z6_1_load_backfill` SET `s` = replace(`s`, ' ', '') WHERE `kind` IS NULL;

UPDATE `_z6_1_load_backfill`
SET `kind` = 'bodyweight'
WHERE `kind` IS NULL AND `s` IN ('bw', 'bodyweight');

UPDATE `_z6_1_load_backfill`
SET `kind` = 'bodyweight_plus', `num` = substr(`s`, instr(`s`, '+') + 1)
WHERE `kind` IS NULL AND (`s` GLOB 'bw+*' OR `s` GLOB 'bodyweight+*');

UPDATE `_z6_1_load_backfill` SET `kind` = 'kg', `num` = `s` WHERE `kind` IS NULL;

-- Unit suffix (same order as UNIT_SUFFIXES in the parser).
UPDATE `_z6_1_load_backfill`
SET
  `unit` = CASE
    WHEN `num` GLOB '*kilograms' OR `num` GLOB '*kilogram' OR `num` GLOB '*kilos'
      OR `num` GLOB '*kilo' OR `num` GLOB '*kgs' OR `num` GLOB '*kg' THEN 'kg'
    WHEN `num` GLOB '*pounds' OR `num` GLOB '*pound' OR `num` GLOB '*lbs'
      OR `num` GLOB '*lb' THEN 'lb'
  END,
  `num` = CASE
    WHEN `num` GLOB '*kilograms' THEN substr(`num`, 1, length(`num`) - 9)
    WHEN `num` GLOB '*kilogram' THEN substr(`num`, 1, length(`num`) - 8)
    WHEN `num` GLOB '*kilos' THEN substr(`num`, 1, length(`num`) - 5)
    WHEN `num` GLOB '*kilo' THEN substr(`num`, 1, length(`num`) - 4)
    WHEN `num` GLOB '*kgs' THEN substr(`num`, 1, length(`num`) - 3)
    WHEN `num` GLOB '*kg' THEN substr(`num`, 1, length(`num`) - 2)
    WHEN `num` GLOB '*pounds' THEN substr(`num`, 1, length(`num`) - 6)
    WHEN `num` GLOB '*pound' THEN substr(`num`, 1, length(`num`) - 5)
    WHEN `num` GLOB '*lbs' THEN substr(`num`, 1, length(`num`) - 3)
    WHEN `num` GLOB '*lb' THEN substr(`num`, 1, length(`num`) - 2)
    ELSE `num`
  END
WHERE `kind` IN ('kg', 'bodyweight_plus');

-- "BW+10" reads kg; a bare "40" has no exercise default here, so it stays text.
UPDATE `_z6_1_load_backfill` SET `unit` = 'kg' WHERE `kind` = 'bodyweight_plus' AND `unit` IS NULL;
UPDATE `_z6_1_load_backfill` SET `kind` = 'text' WHERE `kind` = 'kg' AND `unit` IS NULL;

-- The number: 1-4 digits, optionally a point and 1-2 digits.
UPDATE `_z6_1_load_backfill`
SET `kind` = 'text'
WHERE `kind` IN ('kg', 'bodyweight_plus')
  AND NOT (
    `num` GLOB '[0-9]*'
    AND `num` NOT GLOB '*[^0-9.]*'
    AND length(`num`) - length(replace(`num`, '.', '')) <= 1
    AND (
      (instr(`num`, '.') = 0 AND length(`num`) <= 4)
      OR (instr(`num`, '.') BETWEEN 2 AND 5 AND length(`num`) - instr(`num`, '.') BETWEEN 1 AND 2)
    )
  );

-- kg from exact hundredths: kg = h / 100; lb = floor(h * 0.45359237 + 0.5) / 100.
UPDATE `_z6_1_load_backfill`
SET `kg` = CASE `unit`
  WHEN 'kg' THEN `h` / 100.0
  WHEN 'lb' THEN CAST(`h` * 0.45359237 + 0.5 AS INTEGER) / 100.0
END
FROM (
  SELECT `set_id` AS `h_set_id`, `side` AS `h_side`,
    CAST(CASE
      WHEN instr(`num`, '.') = 0 THEN `num` || '00'
      WHEN length(`num`) - instr(`num`, '.') = 1 THEN replace(`num`, '.', '') || '0'
      ELSE replace(`num`, '.', '')
    END AS INTEGER) AS `h`
  FROM `_z6_1_load_backfill`
  WHERE `kind` IN ('kg', 'bodyweight_plus')
)
WHERE `set_id` = `h_set_id` AND `side` = `h_side`;

UPDATE `set_executions`
SET
  `prescribed_load_kg` = (
    SELECT `kg` FROM `_z6_1_load_backfill` b
    WHERE b.`set_id` = `set_executions`.`id` AND b.`side` = 'p'
  ),
  `actual_load_kg` = (
    SELECT `kg` FROM `_z6_1_load_backfill` b
    WHERE b.`set_id` = `set_executions`.`id` AND b.`side` = 'a'
  ),
  `load_kind` = coalesce(
    (SELECT `kind` FROM `_z6_1_load_backfill` b
      WHERE b.`set_id` = `set_executions`.`id` AND b.`side` = 'a'),
    (SELECT `kind` FROM `_z6_1_load_backfill` b
      WHERE b.`set_id` = `set_executions`.`id` AND b.`side` = 'p'),
    'text'
  )
WHERE `id` IN (SELECT `set_id` FROM `_z6_1_load_backfill`);

DROP TABLE `_z6_1_load_backfill`;
