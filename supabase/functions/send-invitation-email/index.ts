import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface InvitationEmailRequest {
  email: string;
  teamName: string;
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

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'TacticalSync <onboarding@resend.dev>', // You can update this later with your domain
        to: [email],
        subject: `${inviterName} invited you to join ${teamName} on TacticalSync`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px;">
              <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <!-- Header with gradient -->
                <div style="background: linear-gradient(135deg, #ec4899 0%, #3b82f6 100%); padding: 40px 20px; text-align: center;">
                  <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">TacticalSync</h1>
                </div>
                
                <!-- Content -->
                <div style="padding: 40px 30px;">
                  <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px;">You're Invited to Join a Team!</h2>
                  
                  <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                    <strong>${inviterName}</strong> has invited you to join <strong>${teamName}</strong> on TacticalSync.
                  </p>
                  
                  <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                    Click the button below to accept the invitation and start collaborating with your team.
                  </p>
                  
                  <!-- CTA Button -->
                  <div style="text-align: center; margin: 40px 0;">
                    <a href="${inviteLink}" 
                       style="display: inline-block; background: linear-gradient(135deg, #ec4899 0%, #3b82f6 100%); color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                      Accept Invitation
                    </a>
                  </div>
                  
                  <p style="color: #9ca3af; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0; text-align: center;">
                    This invitation link will expire in 7 days for security reasons.
                  </p>
                  
                  <!-- Link fallback -->
                  <div style="margin-top: 30px; padding-top: 30px; border-top: 1px solid #e5e7eb;">
                    <p style="color: #9ca3af; font-size: 12px; line-height: 1.6; margin: 0;">
                      If the button doesn't work, copy and paste this link into your browser:<br>
                      <a href="${inviteLink}" style="color: #3b82f6; word-break: break-all;">${inviteLink}</a>
                    </p>
                  </div>
                  
                  <!-- Info box -->
                  <div style="margin-top: 30px; padding: 16px; background-color: #f0f9ff; border-left: 4px solid #3b82f6; border-radius: 4px;">
                    <p style="color: #1e40af; font-size: 14px; line-height: 1.6; margin: 0;">
                      <strong>💡 What is TacticalSync?</strong><br>
                      TacticalSync helps teams run more effective tactical meetings with:
                    </p>
                    <ul style="color: #1e40af; font-size: 14px; line-height: 1.6; margin: 10px 0 0 20px; padding: 0;">
                      <li>Structured meeting agendas</li>
                      <li>Time tracking and metrics</li>
                      <li>Action item management</li>
                      <li>Team collaboration tools</li>
                    </ul>
                  </div>
                </div>
                
                <!-- Footer -->
                <div style="background-color: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                  <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                    © 2025 TacticalSync. All rights reserved.
                  </p>
                  <p style="color: #9ca3af; font-size: 12px; margin: 10px 0 0 0;">
                    If you didn't expect this invitation, you can safely ignore this email.
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

