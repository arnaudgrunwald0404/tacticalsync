import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface InvitationEmailRequest {
  email: string;
  teamName?: string;
  inviterName: string;
  inviteLink: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, teamName, inviterName, inviteLink }: InvitationEmailRequest = await req.json()

    const year = new Date().getFullYear()

    const subject = teamName
      ? `${inviterName} invited you to ${teamName} on TacticalSync`
      : `${inviterName} invited you to TacticalSync`
    const heading = teamName ? `You're invited to ${teamName}` : "You're invited to TacticalSync"
    const introText = teamName
      ? `<strong style="color: #37352A;">${inviterName}</strong> added you to <strong style="color: #37352A;">${teamName}</strong> on TacticalSync. Accept below to get access to your team's agendas, action items, and meeting history.`
      : `<strong style="color: #37352A;">${inviterName}</strong> invited you to TacticalSync. Accept below to get started.`
    const preheaderText = teamName
      ? `${inviterName} added you to ${teamName} — accept your invite to get started.`
      : `${inviterName} invited you to TacticalSync — accept your invite to get started.`

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
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #FAF8F5; margin: 0; padding: 32px 16px;">
              <!-- Preheader (hidden, improves inbox preview text) -->
              <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">
                ${preheaderText}
              </div>

              <div style="max-width: 520px; margin: 0 auto; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px 0 rgba(55, 53, 42, 0.08), 0 4px 12px -2px rgba(55, 53, 42, 0.08);">
                <!-- Accent bar -->
                <div style="height: 4px; background-color: #FF7A52;"></div>

                <!-- Wordmark -->
                <div style="padding: 32px 40px 0 40px; text-align: center;">
                  <span style="font-family: 'Atkinson Hyperlegible', 'Public Sans', -apple-system, sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 0.08em; color: #4A5D5F; text-transform: uppercase;">TacticalSync</span>
                </div>

                <!-- Content -->
                <div style="padding: 24px 40px 40px 40px;">
                  <h1 style="font-family: 'Atkinson Hyperlegible', 'Public Sans', -apple-system, sans-serif; color: #37352A; margin: 0 0 16px 0; font-size: 26px; font-weight: 700; line-height: 1.25; text-align: center;">
                    ${heading}
                  </h1>

                  <p style="color: #525252; font-size: 16px; line-height: 1.6; margin: 0 0 32px 0; text-align: center;">
                    ${introText}
                  </p>

                  <!-- CTA Button -->
                  <div style="text-align: center; margin: 0 0 24px 0;">
                    <a href="${inviteLink}"
                       style="display: inline-block; background-color: #FF7A52; color: #FFFFFF; text-decoration: none; padding: 14px 36px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                      Accept invitation
                    </a>
                  </div>

                  <p style="color: #A3A3A3; font-size: 13px; line-height: 1.6; margin: 0; text-align: center;">
                    This link expires in 7 days.
                  </p>

                  <!-- Link fallback -->
                  <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #E5E5E5;">
                    <p style="color: #A3A3A3; font-size: 12px; line-height: 1.6; margin: 0; text-align: center;">
                      Or paste this link into your browser:<br>
                      <a href="${inviteLink}" style="color: #5B6E7A; word-break: break-all;">${inviteLink}</a>
                    </p>
                  </div>
                </div>

                <!-- Footer -->
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
        `,
      }),
    })

    if (res.ok) {
      const data = await res.json()
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } else {
      const error = await res.text()
      return new Response(JSON.stringify({ error }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

