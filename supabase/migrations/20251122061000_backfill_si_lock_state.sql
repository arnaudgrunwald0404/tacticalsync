-- Backfill: ensure SIs under already-locked DOs are locked
-- One-time correction so existing data matches new cascade behavior

UPDATE rc_strategic_initiatives AS si
SET
  locked_at = COALESCE(si.locked_at, dobj.locked_at),
  locked_by = COALESCE(si.locked_by, dobj.locked_by)
FROM rc_defining_objectives AS dobj
WHERE si.defining_objective_id = dobj.id
  AND dobj.locked_at IS NOT NULL
  AND si.locked_at IS NULL;
