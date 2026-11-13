-- The game systems and the game master's role get CozyVTT's own names.
--
-- Every row keeps its value under the new name:
--   GameSystem: DND_5E becomes FIFTH_EDITION, PATHFINDER_2E becomes
--   FANTASY_D20, CALL_OF_CTHULHU_7E becomes HORROR_D100.
--   CampaignRole, MessageType and DrawingAudience: DM becomes GM.
--
-- 1. The values are renamed in place. RENAME VALUE changes only the
--    catalogue, so no row is rewritten.
-- 2. A row whose game system is none of the three holds the value of an
--    unreleased system that never shipped, and is given no system, as the
--    app already treats it.
-- 3. GameSystem is replaced by a type holding only the three, so that value
--    can never be stored again. Nothing is dropped until every column has
--    moved to the new type.
-- 4. The game system a stat block names inside its JSON (creatures, token
--    templates, the tokens on maps and in saved sessions) is renamed the same
--    way, so initiative still reads an SRD creature's DEX at a 5E table.
--
-- Each step looks before it changes anything, so a second run changes
-- nothing. The file runs as one transaction: a failure leaves the database
-- as it was.

-- 1. Rename the values.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('GameSystem', 'DND_5E', 'FIFTH_EDITION'),
      ('GameSystem', 'PATHFINDER_2E', 'FANTASY_D20'),
      ('GameSystem', 'CALL_OF_CTHULHU_7E', 'HORROR_D100'),
      ('CampaignRole', 'DM', 'GM'),
      ('MessageType', 'DM', 'GM'),
      ('DrawingAudience', 'DM', 'GM')
    ) AS v(type_name, old_label, new_label)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumtypid = to_regtype(format('%I', r.type_name)) AND enumlabel = r.old_label
    ) THEN
      EXECUTE format('ALTER TYPE %I RENAME VALUE %L TO %L', r.type_name, r.old_label, r.new_label);
    END IF;
  END LOOP;
END $$;

-- 2. No system for a row holding none of the three.
UPDATE "Campaign" SET "gameSystem" = NULL
WHERE "gameSystem"::text NOT IN ('FIFTH_EDITION', 'FANTASY_D20', 'HORROR_D100');
UPDATE "Character" SET "gameSystem" = NULL
WHERE "gameSystem"::text NOT IN ('FIFTH_EDITION', 'FANTASY_D20', 'HORROR_D100');
UPDATE "CharacterTemplate" SET "gameSystem" = NULL
WHERE "gameSystem"::text NOT IN ('FIFTH_EDITION', 'FANTASY_D20', 'HORROR_D100');
UPDATE "CreatureTemplate" SET "gameSystem" = NULL
WHERE "gameSystem"::text NOT IN ('FIFTH_EDITION', 'FANTASY_D20', 'HORROR_D100');

-- 3. A GameSystem type holding only the three.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = to_regtype('"GameSystem"')
      AND enumlabel NOT IN ('FIFTH_EDITION', 'FANTASY_D20', 'HORROR_D100')
  ) THEN
    CREATE TYPE "GameSystem_new" AS ENUM ('FIFTH_EDITION', 'FANTASY_D20', 'HORROR_D100');
    ALTER TABLE "Campaign" ALTER COLUMN "gameSystem" TYPE "GameSystem_new" USING ("gameSystem"::text::"GameSystem_new");
    ALTER TABLE "Character" ALTER COLUMN "gameSystem" TYPE "GameSystem_new" USING ("gameSystem"::text::"GameSystem_new");
    ALTER TABLE "CharacterTemplate" ALTER COLUMN "gameSystem" TYPE "GameSystem_new" USING ("gameSystem"::text::"GameSystem_new");
    ALTER TABLE "CreatureTemplate" ALTER COLUMN "gameSystem" TYPE "GameSystem_new" USING ("gameSystem"::text::"GameSystem_new");
    DROP TYPE "GameSystem";
    ALTER TYPE "GameSystem_new" RENAME TO "GameSystem";
  END IF;
END $$;

-- 4. The game system named inside stat blocks. Each statement looks its
-- labels up in the same list of old names and new.
WITH n AS (
  SELECT '{"DND_5E": "FIFTH_EDITION", "PATHFINDER_2E": "FANTASY_D20", "CALL_OF_CTHULHU_7E": "HORROR_D100"}'::jsonb AS names
)
UPDATE "CreatureTemplate" c
SET "statBlock" = jsonb_set(c."statBlock", '{gameSystem}', n.names -> (c."statBlock" ->> 'gameSystem'))
FROM n
WHERE jsonb_typeof(c."statBlock") = 'object' AND n.names ? (c."statBlock" ->> 'gameSystem');

WITH n AS (
  SELECT '{"DND_5E": "FIFTH_EDITION", "PATHFINDER_2E": "FANTASY_D20", "CALL_OF_CTHULHU_7E": "HORROR_D100"}'::jsonb AS names
)
UPDATE "TokenTemplate" t
SET "statBlock" = jsonb_set(t."statBlock", '{gameSystem}', n.names -> (t."statBlock" ->> 'gameSystem'))
FROM n
WHERE jsonb_typeof(t."statBlock") = 'object' AND n.names ? (t."statBlock" ->> 'gameSystem');

-- Each token in a map's list, kept in its place.
WITH n AS (
  SELECT '{"DND_5E": "FIFTH_EDITION", "PATHFINDER_2E": "FANTASY_D20", "CALL_OF_CTHULHU_7E": "HORROR_D100"}'::jsonb AS names
)
UPDATE "Map" m
SET tokens = (
  SELECT jsonb_agg(
    CASE
      WHEN jsonb_typeof(e.token -> 'statBlock') = 'object' AND n.names ? (e.token #>> '{statBlock,gameSystem}')
        THEN jsonb_set(e.token, '{statBlock,gameSystem}', n.names -> (e.token #>> '{statBlock,gameSystem}'))
      ELSE e.token
    END
    ORDER BY e.place
  )
  FROM jsonb_array_elements(m.tokens) WITH ORDINALITY AS e(token, place)
)
FROM n
WHERE jsonb_typeof(m.tokens) = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(m.tokens) AS e(token)
    WHERE jsonb_typeof(e.token -> 'statBlock') = 'object' AND n.names ? (e.token #>> '{statBlock,gameSystem}')
  );

-- Each token in a saved session's list, kept in its place.
WITH n AS (
  SELECT '{"DND_5E": "FIFTH_EDITION", "PATHFINDER_2E": "FANTASY_D20", "CALL_OF_CTHULHU_7E": "HORROR_D100"}'::jsonb AS names
)
UPDATE "Session" s
SET "savedState" = jsonb_set(s."savedState", '{tokens}', (
  SELECT jsonb_agg(
    CASE
      WHEN jsonb_typeof(e.token -> 'statBlock') = 'object' AND n.names ? (e.token #>> '{statBlock,gameSystem}')
        THEN jsonb_set(e.token, '{statBlock,gameSystem}', n.names -> (e.token #>> '{statBlock,gameSystem}'))
      ELSE e.token
    END
    ORDER BY e.place
  )
  FROM jsonb_array_elements(s."savedState" -> 'tokens') WITH ORDINALITY AS e(token, place)
))
FROM n
WHERE jsonb_typeof(s."savedState" -> 'tokens') = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(s."savedState" -> 'tokens') AS e(token)
    WHERE jsonb_typeof(e.token -> 'statBlock') = 'object' AND n.names ? (e.token #>> '{statBlock,gameSystem}')
  );
