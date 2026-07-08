import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

/**
 * Delegates an inbox item to a linked teammate.
 *
 * Per PLAN_idea8_people_delegation.md §3 and §6: creates one
 * inbox_item_delegations row plus a brand-new inbox_items row owned by the
 * delegatee (their "copy" of the task), in one transaction-ish sequence.
 * Runs as service role because the delegator's own RLS grant cannot insert a
 * row owned by someone else's user_id — that's precisely the boundary this
 * function is trusted to cross, under its own authorization checks:
 *
 *   1. Caller must be authenticated (verified via JWT, same pattern as
 *      send-cos-team-member-invite).
 *   2. team_member_id must be a cos_team_members row OWNED by the caller.
 *   3. That row's linked_user_id must be set (the account-linking
 *      prerequisite) — if not, this is a hard failure that should prompt the
 *      client to show the "invite them first" flow (PLAN §8.1B), not a
 *      silent no-op.
 *   4. source_item_id must be an inbox_items row OWNED by the caller.
 *
 * The DB also re-checks (1)+(3) via fn_validate_inbox_item_delegation
 * (20260723000000) as defense in depth — this function's checks are not the
 * only enforcement layer.
 *
 * Per PLAN §7.2: only `text` and an explicit delegator `note` are copied to
 * the delegatee's item — NOT `body` (the delegator's private working notes)
 * and NOT tags, to avoid leaking anything the delegator didn't explicitly
 * intend to share.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface DelegateRequest {
  sourceItemId: string;
  teamMemberId: string;
  note?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    if (!serviceRoleKey) {
      console.error('Missing SUPABASE_SERVICE_ROLE_KEY')
      return jsonResponse({ error: 'server_misconfigured' }, 500)
    }

    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!jwt) {
      return jsonResponse({ error: 'missing_authorization' }, 401)
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(jwt)
    if (userErr || !userData?.user) {
      return jsonResponse({ error: 'invalid_token' }, 401)
    }
    const delegatorId = userData.user.id

    const body: DelegateRequest = await req.json()
    const { sourceItemId, teamMemberId, note } = body

    if (!sourceItemId || typeof sourceItemId !== 'string') {
      return jsonResponse({ error: 'invalid_request', details: 'sourceItemId is required' }, 400)
    }
    if (!teamMemberId || typeof teamMemberId !== 'string') {
      return jsonResponse({ error: 'invalid_request', details: 'teamMemberId is required' }, 400)
    }
    if (note !== undefined && (typeof note !== 'string' || note.length > 2000)) {
      return jsonResponse({ error: 'invalid_request', details: 'note must be a string under 2000 chars' }, 400)
    }

    // ── Authorization checks (belt) ──────────────────────────────────────────

    const { data: teamMember, error: teamMemberErr } = await supabaseAdmin
      .from('cos_team_members')
      .select('id, user_id, name, linked_user_id')
      .eq('id', teamMemberId)
      .maybeSingle()

    if (teamMemberErr) {
      console.error('cos_team_members lookup error:', teamMemberErr)
      return jsonResponse({ error: 'lookup_failed' }, 500)
    }
    // Uniform 403 for "doesn't exist" vs "not yours" — don't leak row existence.
    if (!teamMember || teamMember.user_id !== delegatorId) {
      return jsonResponse({ error: 'forbidden' }, 403)
    }
    if (!teamMember.linked_user_id) {
      // Not a generic error — the client should read this and route the user
      // into the invite flow (PLAN §8.1B), not just show a toast.
      return jsonResponse({ error: 'not_linked', details: 'This team member has not linked their account yet.' }, 409)
    }
    const delegateeId: string = teamMember.linked_user_id

    const { data: sourceItem, error: sourceItemErr } = await supabaseAdmin
      .from('inbox_items')
      .select('id, user_id, text, status, active_delegation_id')
      .eq('id', sourceItemId)
      .maybeSingle()

    if (sourceItemErr) {
      console.error('inbox_items lookup error:', sourceItemErr)
      return jsonResponse({ error: 'lookup_failed' }, 500)
    }
    if (!sourceItem || sourceItem.user_id !== delegatorId) {
      return jsonResponse({ error: 'forbidden' }, 403)
    }
    if (sourceItem.active_delegation_id) {
      return jsonResponse({ error: 'already_delegated', details: 'This item already has an active delegation.' }, 409)
    }

    // ── Create the delegatee's copy (owned by delegateeId) ──────────────────
    // Per PLAN §7.2: copy only `text` — never `body` or tags — plus the
    // delegator's explicit note, kept separate from the copied text.

    const { data: delegateeItem, error: delegateeItemErr } = await supabaseAdmin
      .from('inbox_items')
      .insert({
        user_id: delegateeId,
        type: 'task',
        text: sourceItem.text,
        body: note ? `_From ${teamMember.name ? 'your manager' : 'a colleague'}:_ ${note}` : null,
        status: 'open',
      })
      .select('id')
      .single()

    if (delegateeItemErr || !delegateeItem) {
      console.error('Failed to create delegatee item:', delegateeItemErr)
      return jsonResponse({ error: 'delegatee_item_creation_failed' }, 500)
    }

    // ── Create the delegation link row ───────────────────────────────────────
    // fn_validate_inbox_item_delegation (DB trigger) re-checks the
    // team_member_id/delegator/delegatee relationship independently — if this
    // insert fails that check, something is inconsistent between this
    // function's view and the DB's, and we should fail loudly, not silently.

    const { data: delegation, error: delegationErr } = await supabaseAdmin
      .from('inbox_item_delegations')
      .insert({
        source_item_id: sourceItemId,
        delegator_user_id: delegatorId,
        delegatee_user_id: delegateeId,
        delegatee_item_id: delegateeItem.id,
        team_member_id: teamMemberId,
        status: 'pending',
        note: note ?? null,
      })
      .select('id')
      .single()

    if (delegationErr || !delegation) {
      console.error('Failed to create delegation:', delegationErr)
      // Roll back the orphaned delegatee item so it doesn't sit in their inbox
      // with no paper trail behind it.
      await supabaseAdmin.from('inbox_items').delete().eq('id', delegateeItem.id)
      return jsonResponse({ error: 'delegation_creation_failed' }, 500)
    }

    // ── Point the delegator's source item at the new delegation ─────────────

    const { error: updateErr } = await supabaseAdmin
      .from('inbox_items')
      .update({
        active_delegation_id: delegation.id,
        workflow_status: 'Waiting on someone',
      })
      .eq('id', sourceItemId)

    if (updateErr) {
      console.error('Failed to update source item with active_delegation_id:', updateErr)
      // Non-fatal: the delegation exists and the delegatee's item is real;
      // the delegator's "Waiting on" chip just won't render until this is
      // retried. Report success=true but flag it for follow-up.
      return jsonResponse({ success: true, delegationId: delegation.id, warning: 'source_item_update_failed' }, 200)
    }

    return jsonResponse({ success: true, delegationId: delegation.id, delegateeItemId: delegateeItem.id }, 200)
  } catch (error) {
    console.error('delegate-inbox-item-to-person error:', error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'unknown_error' }, 500)
  }
})
