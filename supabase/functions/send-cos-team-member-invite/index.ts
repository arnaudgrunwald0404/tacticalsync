import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

/**
 * Sends (or resends) an account-linking invite for a cos_team_members row.
 *
 * Called by the manager who owns the cos_team_members row. Verifies the
 * caller via the forwarded JWT (same pattern as exchange-zoom-token), confirms
 * they own the target row, creates/refreshes a cos_team_member_invites row,
 * and emails the invite link via Resend.
 *
 * Anti-enumeration: the API response is uniform regardless of whether the
 * invited email belongs to an existing TacticalSync account or not — only
 * the email copy itself differs (that's not an API-response oracle since it
 * isn't observable by the caller).
 */

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

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

interface SendInviteRequest {
  teamMemberId: string;
  email: string;
}

function buildEmailHtml(opts: { inviterName: string; inviteLink: string }): { subject: string; html: string } {
  const { inviterName, inviteLink } = opts
  const year = new Date().getFullYear()
  const subject = `${inviterName} wants to connect with you on TacticalSync`
  const heading = `${inviterName} wants to connect with you`
  const bodyText = `<strong style="color: #37352A;">${inviterName}</strong> added you to their team in TacticalSync and would like to be able to send you items to work on directly — they'll land in your inbox, and ${inviterName} will be able to see when you mark them done. You'll always be able to see who sent you something and why. This does not give ${inviterName} access to anything else in your account — only items they explicitly send you.`
  const preheaderText = `${inviterName} wants to connect with you on TacticalSync.`

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #FAF8F5; margin: 0; padding: 32px 16px;">
        <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">
          ${preheaderText}
        </div>

        <div style="max-width: 520px; margin: 0 auto; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px 0 rgba(55, 53, 42, 0.08), 0 4px 12px -2px rgba(55, 53, 42, 0.08);">
          <div style="height: 4px; background-color: #FF7A52;"></div>

          <div style="padding: 32px 40px 0 40px; text-align: center;">
            <span style="font-family: 'Atkinson Hyperlegible', 'Public Sans', -apple-system, sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 0.08em; color: #4A5D5F; text-transform: uppercase;">TacticalSync</span>
          </div>

          <div style="padding: 24px 40px 40px 40px;">
            <h1 style="font-family: 'Atkinson Hyperlegible', 'Public Sans', -apple-system, sans-serif; color: #37352A; margin: 0 0 16px 0; font-size: 26px; font-weight: 700; line-height: 1.25; text-align: center;">
              ${heading}
            </h1>

            <p style="color: #525252; font-size: 16px; line-height: 1.6; margin: 0 0 32px 0; text-align: center;">
              ${bodyText}
            </p>

            <div style="text-align: center; margin: 0 0 24px 0;">
              <a href="${inviteLink}"
                 style="display: inline-block; background-color: #FF7A52; color: #FFFFFF; text-decoration: none; padding: 14px 36px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                Connect my account →
              </a>
            </div>

            <p style="color: #A3A3A3; font-size: 13px; line-height: 1.6; margin: 0; text-align: center;">
              If you don't recognize this or don't want to connect, you can safely ignore this email. This link expires in 7 days.
            </p>

            <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #E5E5E5;">
              <p style="color: #A3A3A3; font-size: 12px; line-height: 1.6; margin: 0; text-align: center;">
                Or paste this link into your browser:<br>
                <a href="${inviteLink}" style="color: #5B6E7A; word-break: break-all;">${inviteLink}</a>
              </p>
            </div>
          </div>

          <div style="background-color: #F8F6F2; padding: 20px 40px; text-align: center;">
            <p style="color: #A3A3A3; font-size: 12px; margin: 0;">
              © ${year} TacticalSync
            </p>
            <p style="color: #A3A3A3; font-size: 12px; margin: 6px 0 0 0;">
              Didn't expect this? You can safely ignore this email.
            </p>
          </div>
        </div>
      </body>
    </html>
  `

  return { subject, html }
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
    const callerId = userData.user.id

    const body: SendInviteRequest = await req.json()
    const { teamMemberId, email } = body

    if (!teamMemberId || typeof teamMemberId !== 'string') {
      return jsonResponse({ error: 'invalid_request', details: 'teamMemberId is required' }, 400)
    }
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return jsonResponse({ error: 'invalid_request', details: 'a valid email is required' }, 400)
    }

    // Verify the caller owns the cos_team_members row being invited.
    const { data: teamMember, error: teamMemberErr } = await supabaseAdmin
      .from('cos_team_members')
      .select('id, user_id, name, linked_user_id')
      .eq('id', teamMemberId)
      .maybeSingle()

    if (teamMemberErr) {
      console.error('cos_team_members lookup error:', teamMemberErr)
      return jsonResponse({ error: 'lookup_failed' }, 500)
    }
    if (!teamMember || teamMember.user_id !== callerId) {
      // Uniform 403 regardless of "doesn't exist" vs "not yours" — don't leak row existence.
      return jsonResponse({ error: 'forbidden' }, 403)
    }
    if (teamMember.linked_user_id) {
      return jsonResponse({ error: 'already_linked' }, 409)
    }

    // Look up the inviter's display name for the email copy.
    const { data: inviterProfile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', callerId)
      .maybeSingle()
    const inviterName = inviterProfile?.full_name?.trim() || userData.user.email || 'A TacticalSync user'

    // Cancel any prior pending invite for this team member so there's at most
    // one active invite at a time, then create a fresh one with a new code
    // and expiry (covers both "send" and "resend").
    await supabaseAdmin
      .from('cos_team_member_invites')
      .update({ status: 'cancelled' })
      .eq('team_member_id', teamMemberId)
      .eq('status', 'pending')

    const { data: invite, error: insertErr } = await supabaseAdmin
      .from('cos_team_member_invites')
      .insert({
        team_member_id: teamMemberId,
        inviter_user_id: callerId,
        invited_email: email.toLowerCase().trim(),
      })
      .select('invite_code')
      .single()

    if (insertErr || !invite) {
      console.error('Failed to create invite:', insertErr)
      return jsonResponse({ error: 'invite_creation_failed' }, 500)
    }

    const origin = req.headers.get('origin') || Deno.env.get('APP_ORIGIN') || 'https://app.tacticalsync.com'
    const inviteLink = `${origin}/claim-team-member/${invite.invite_code}`

    if (RESEND_API_KEY) {
      const { subject, html } = buildEmailHtml({ inviterName, inviteLink })
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: 'TacticalSync <noreply@info.tacticalsync.com>',
            to: [email],
            subject,
            html,
          }),
        })
        if (!res.ok) {
          const errText = await res.text()
          console.error('Resend send failed:', errText)
          // Do not leak email-delivery details to the caller (anti-enumeration:
          // the response shape must not reveal whether the recipient's mail
          // provider bounced, rejected, etc.) — the invite row still exists,
          // so "Resend" in the UI can be used to retry.
        }
      } catch (sendErr) {
        console.error('Resend request threw:', sendErr)
      }
    } else {
      console.warn('RESEND_API_KEY not configured — invite created but no email sent')
    }

    // Uniform success response regardless of whether the target email belongs
    // to an existing TacticalSync account.
    return jsonResponse({ success: true }, 200)
  } catch (error) {
    console.error('send-cos-team-member-invite error:', error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'unknown_error' }, 500)
  }
})
