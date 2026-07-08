-- Idea #8: "People delegation with a paper trail" — cross-user inbox item
-- delegation. Per PLAN_idea8_people_delegation.md §3, this uses a dedicated
-- linking table (Approach 2) rather than a delegated_to_user_id column on
-- inbox_items, to keep inbox_items' trust boundary at "user_id is the only
-- writer/reader" and push all cross-user complexity into one narrow,
-- auditable table. Requires the account-linking prerequisite
-- (cos_team_members.linked_user_id, 20260722000000) to already exist.
--
-- Naming: deliberately "inbox_item_delegations" (NOT "inbox_delegations",
-- which already exists as the AI-agent delegation table from
-- 20260713000003_inbox_delegations.sql — a different feature entirely).

-- ── 1. inbox_item_delegations ────────────────────────────────────────────────

CREATE TABLE inbox_item_delegations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_item_id      uuid NOT NULL REFERENCES inbox_items(id) ON DELETE CASCADE,
  delegator_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delegatee_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delegatee_item_id   uuid REFERENCES inbox_items(id) ON DELETE SET NULL,
  team_member_id      uuid REFERENCES cos_team_members(id) ON DELETE SET NULL,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'accepted', 'done', 'cancelled')),
  note                text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz,
  CONSTRAINT inbox_item_delegations_not_self CHECK (delegator_user_id <> delegatee_user_id)
);

CREATE INDEX idx_inbox_item_delegations_source_item ON inbox_item_delegations(source_item_id);
CREATE INDEX idx_inbox_item_delegations_delegatee_item ON inbox_item_delegations(delegatee_item_id);
CREATE INDEX idx_inbox_item_delegations_delegator ON inbox_item_delegations(delegator_user_id, status);
CREATE INDEX idx_inbox_item_delegations_delegatee ON inbox_item_delegations(delegatee_user_id, status);
CREATE INDEX idx_inbox_item_delegations_team_member ON inbox_item_delegations(team_member_id);

-- Only one live (non-terminal) delegation per source item at a time — avoids
-- ambiguity in "who is this waiting on" and in the sync triggers below.
CREATE UNIQUE INDEX idx_inbox_item_delegations_one_active_per_source
  ON inbox_item_delegations(source_item_id)
  WHERE status IN ('pending', 'accepted');

ALTER TABLE inbox_item_delegations ENABLE ROW LEVEL SECURITY;

-- Delegator can see/manage delegations they created.
CREATE POLICY "delegator can manage their outgoing delegations"
  ON inbox_item_delegations FOR ALL TO authenticated
  USING (auth.uid() = delegator_user_id)
  WITH CHECK (auth.uid() = delegator_user_id);

-- Delegatee can see delegations addressed to them.
CREATE POLICY "delegatee can view their incoming delegations"
  ON inbox_item_delegations FOR SELECT TO authenticated
  USING (auth.uid() = delegatee_user_id);

-- Delegatee can update status on their incoming delegations (e.g. accept /
-- cancel from their side). The actual "mark done" transition is normally
-- driven by the delegatee completing their own inbox_items copy, which the
-- sync trigger (20260723000100) propagates here via SECURITY DEFINER —
-- this direct-update policy exists for the delegatee-initiated cancel path
-- and defense-in-depth, not as the primary write path.
CREATE POLICY "delegatee can update status on their incoming delegations"
  ON inbox_item_delegations FOR UPDATE TO authenticated
  USING (auth.uid() = delegatee_user_id)
  WITH CHECK (auth.uid() = delegatee_user_id);

-- ── 2. inbox_items: narrow additive policy + delegator-side pointer column ──

-- The delegator's row gets a live pointer to its active delegation so the UI
-- can render "Waiting on Alex · 3d" without a join in the common case.
ALTER TABLE inbox_items
  ADD COLUMN active_delegation_id uuid REFERENCES inbox_item_delegations(id) ON DELETE SET NULL;

-- Exactly one additive SELECT policy: the delegatee can read (never write)
-- the original item's content, scoped tightly through the delegation link,
-- and only while the delegation is live. This is the only cross-user
-- exception to inbox_items' base "own rows" policy (20260713000001) — see
-- PLAN_idea8_people_delegation.md §3 and §7 for the reasoning and the
-- required re-review discipline for any future inbox_items column.
CREATE POLICY "inbox_items: delegatee can view delegated source item"
  ON inbox_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM inbox_item_delegations d
      WHERE d.source_item_id = inbox_items.id
        AND d.delegatee_user_id = auth.uid()
        AND d.status IN ('pending', 'accepted')
    )
  );

-- ── 3. Relationship-legitimacy guard (defense in depth beyond RLS) ──────────
-- RLS on inbox_item_delegations only checks "are you the delegator/delegatee
-- named on this row" — it cannot check "was this relationship consensual."
-- That's a business-logic check the delegate-inbox-item-to-person edge
-- function performs before insert, but per PLAN §9 (testing) we also enforce
-- it at the DB layer as defense in depth: reject any insert where the
-- delegatee is not the linked_user_id of the given team_member_id, owned by
-- the delegator, matching that delegatee_user_id.
CREATE OR REPLACE FUNCTION fn_validate_inbox_item_delegation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.team_member_id IS NULL THEN
    RAISE EXCEPTION 'inbox_item_delegations.team_member_id is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM cos_team_members tm
    WHERE tm.id = NEW.team_member_id
      AND tm.user_id = NEW.delegator_user_id
      AND tm.linked_user_id = NEW.delegatee_user_id
  ) THEN
    RAISE EXCEPTION 'delegatee is not a linked team member of the delegator (team_member_id=%, delegator=%, delegatee=%)',
      NEW.team_member_id, NEW.delegator_user_id, NEW.delegatee_user_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_inbox_item_delegation
  BEFORE INSERT ON inbox_item_delegations
  FOR EACH ROW EXECUTE FUNCTION fn_validate_inbox_item_delegation();

COMMENT ON FUNCTION fn_validate_inbox_item_delegation() IS
  'Defense-in-depth check: a delegation may only be created when team_member_id '
  'is a cos_team_members row owned by delegator_user_id AND its linked_user_id '
  'equals delegatee_user_id. RLS alone cannot enforce relationship legitimacy '
  '(it only checks who the row names as delegator/delegatee), so this trigger '
  'closes that gap at the DB layer, independent of the edge function''s own check.';

-- updated_at trigger, matching the cos_* convention.
CREATE TRIGGER inbox_item_delegations_updated_at
  BEFORE UPDATE ON inbox_item_delegations
  FOR EACH ROW EXECUTE FUNCTION cos_set_updated_at();
