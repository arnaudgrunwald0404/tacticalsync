-- Merges duplicate cos_group_meetings rows caused by Google's "this and
-- following event(s)" fork: editing a recurring series partway through mints a
-- new recurringEventId of the form "<originalId>_R<YYYYMMDDTHHMMSS>[Z]", and
-- the same logical meeting could be forked more than once over time. Before
-- this migration, google-calendar-sync (recurrenceKeyForEvent) keyed group
-- meetings on the raw recurringEventId, so each fork silently created a brand
-- new row instead of updating the existing one — the same recurring meeting
-- would show up 2-3x in the "Group meetings (opt-in)" panel. The application
-- code has been fixed to strip the fork suffix before computing the key; this
-- migration consolidates the duplicate rows already created under the old
-- behavior so future syncs match the surviving canonical row.

CREATE TEMP TABLE group_meeting_merge_map AS
WITH normalized AS (
  SELECT
    id,
    user_id,
    recurrence_key,
    regexp_replace(recurrence_key, '_R\d{8}T\d{6}Z?$', '') AS base_key,
    included,
    subject,
    title,
    last_seen_at
  FROM cos_group_meetings
),
ranked AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, base_key
      ORDER BY last_seen_at DESC NULLS LAST, id
    ) AS rn
  FROM normalized
),
canonical AS (
  SELECT user_id, base_key, id AS canonical_id
  FROM ranked WHERE rn = 1
),
merged_flags AS (
  SELECT
    user_id,
    base_key,
    bool_or(included) AS merged_included,
    -- Prefer a subject the user customized (differs from the calendar title)
    -- over the default title-mirroring subject, most-recent first.
    (array_agg(subject ORDER BY (subject IS DISTINCT FROM title) DESC, last_seen_at DESC)
      FILTER (WHERE subject IS NOT NULL))[1] AS merged_subject
  FROM normalized
  GROUP BY user_id, base_key
)
SELECT n.id, n.user_id, n.base_key, c.canonical_id, mf.merged_included, mf.merged_subject
FROM normalized n
JOIN canonical c USING (user_id, base_key)
JOIN merged_flags mf USING (user_id, base_key);

-- Re-point child/dependent rows from duplicate (non-canonical) meetings onto
-- the canonical one, skipping any that would collide with a row the canonical
-- already has (unique constraints on participant email / source ref, and the
-- date+source uniques on prep) — those leftovers are true duplicates and are
-- fine to drop with the duplicate meeting row below.

UPDATE cos_group_meeting_participants p
SET group_meeting_id = m.canonical_id
FROM group_meeting_merge_map m
WHERE p.group_meeting_id = m.id
  AND m.id <> m.canonical_id
  AND NOT EXISTS (
    SELECT 1 FROM cos_group_meeting_participants existing
    WHERE existing.group_meeting_id = m.canonical_id
      AND existing.email = p.email
  );

UPDATE cos_group_meeting_sources s
SET group_meeting_id = m.canonical_id
FROM group_meeting_merge_map m
WHERE s.group_meeting_id = m.id
  AND m.id <> m.canonical_id
  AND NOT EXISTS (
    SELECT 1 FROM cos_group_meeting_sources existing
    WHERE existing.group_meeting_id = m.canonical_id
      AND existing.source_type = s.source_type
      AND existing.ref = s.ref
  );

UPDATE cos_one_on_one_prep pr
SET group_meeting_id = m.canonical_id
FROM group_meeting_merge_map m
WHERE pr.group_meeting_id = m.id
  AND m.id <> m.canonical_id
  AND NOT EXISTS (
    SELECT 1 FROM cos_one_on_one_prep existing
    WHERE existing.group_meeting_id = m.canonical_id
      AND existing.user_id = pr.user_id
      AND existing.prep_date = pr.prep_date
      AND existing.source = pr.source
  );

UPDATE cos_meeting_actions ma
SET group_meeting_id = m.canonical_id
FROM group_meeting_merge_map m
WHERE ma.group_meeting_id = m.id
  AND m.id <> m.canonical_id;

UPDATE cos_relationship_topics rt
SET group_meeting_id = m.canonical_id
FROM group_meeting_merge_map m
WHERE rt.group_meeting_id = m.id
  AND m.id <> m.canonical_id;

-- Drop the now-redundant duplicate rows first — this must happen before the
-- canonical row is renamed to the stripped key below, since an unforked
-- duplicate (recurrence_key already equal to base_key, i.e. the meeting's very
-- first, pre-fork occurrence) would otherwise collide with the canonical row
-- under the (user_id, recurrence_key) unique constraint while both exist.
-- Any participant/source/prep rows that couldn't be re-pointed above (true
-- duplicates) cascade-delete with their parent row.
DELETE FROM cos_group_meetings gm
USING group_meeting_merge_map m
WHERE gm.id = m.id
  AND m.id <> m.canonical_id;

-- Now safe to rename the canonical row to the normalized key and apply the
-- merged included/subject state (never silently drop a user's opt-in —
-- bool_or keeps included=true if any fork had it set).
UPDATE cos_group_meetings gm
SET recurrence_key = m.base_key,
    included = m.merged_included,
    subject = COALESCE(m.merged_subject, gm.subject)
FROM group_meeting_merge_map m
WHERE gm.id = m.canonical_id;

DROP TABLE group_meeting_merge_map;
