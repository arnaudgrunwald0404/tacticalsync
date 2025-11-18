import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AdminGrantedEmailRequest {
  email: string;
  granterName: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email, granterName }: AdminGrantedEmailRequest = await req.json();

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'TacticalSync <noreply@info.tacticalsync.com>',
        to: [email],
        subject: `You now have admin privileges on TacticalSync`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px;">
              <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <div style="background: linear-gradient(135deg, #3b82f6 0%, #ec4899 100%); padding: 32px 20px; text-align: center;">
                  <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">TacticalSync</h1>
                </div>

                <div style="padding: 32px 30px; color: #111827;">
                  <h2 style="margin: 0 0 16px 0; font-size: 22px;">Admin Access Granted</h2>
                  <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.6; color: #374151;">
                    ${granterName} just granted you <strong>admin</strong> privileges in TacticalSync.
                  </p>

                  <div style="margin: 16px 0; padding: 16px; background: #f0f9ff; border-left: 4px solid #3b82f6; border-radius: 6px; color: #1e40af;">
                    <p style="margin: 0 0 8px 0; font-weight: 600;">What you can do as an admin:</p>
                    <ul style="margin: 0 0 0 18px; padding: 0;">
                      <li>Create new teams</li>
                      <li>Create new recurring meetings for teams you belong to</li>
                      <li>Invite and manage team members</li>
                    </ul>
                  </div>

                  <p style="margin: 16px 0 0 0; font-size: 14px; color: #6b7280;">If this was unexpected, please contact your super admin.</p>
                </div>

                <div style="background-color: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
                  <p style="color: #9ca3af; font-size: 12px; margin: 0;">© 2025 TacticalSync. All rights reserved.</p>
                </div>
              </div>
            </body>
          </html>
        `,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const error = await res.text();
    return new Response(JSON.stringify({ error }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});





