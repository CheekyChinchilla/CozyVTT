-- Migrate light sources from old format (radius + intensity) to new format (brightRadius + dimRadius).
-- Old: { id, x, y, radius, intensity, color, enabled }
-- New: { id, x, y, brightRadius, dimRadius, color, enabled }
--
-- Conversion: brightRadius = radius * 0.5, dimRadius = radius (preserving total visible area).
-- Idempotent: only transforms elements that have "radius" but NOT "brightRadius".

UPDATE "Map"
SET lights = (
  SELECT jsonb_agg(
    CASE
      WHEN elem ? 'radius' AND NOT (elem ? 'brightRadius') THEN
        (elem - 'radius' - 'intensity')
        || jsonb_build_object(
             'brightRadius', ROUND((elem->>'radius')::numeric * 0.5, 1),
             'dimRadius',    (elem->>'radius')::numeric
           )
      ELSE elem
    END
  )
  FROM jsonb_array_elements(lights::jsonb) AS elem
)
WHERE jsonb_typeof(lights::jsonb) = 'array'
  AND jsonb_array_length(lights::jsonb) > 0
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(lights::jsonb) AS el
    WHERE el ? 'radius' AND NOT (el ? 'brightRadius')
  );
