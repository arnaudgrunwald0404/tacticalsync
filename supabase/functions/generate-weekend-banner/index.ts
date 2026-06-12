import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

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

const ART_STYLES = [
  'Monochrome', 'Color block', 'Runway', 'Risograph', 'Technicolor',
  'Gothic clay', 'Dynamite', 'Salon', 'Sketch', 'Cinematic', 'Steampunk', 'Sunrise',
] as const
type ArtStyle = typeof ART_STYLES[number]

const STYLE_PROMPTS: Record<ArtStyle, string> = {
  'Monochrome':    'monochrome black and white, high contrast, elegant ink illustration',
  'Color block':   'bold color block illustration, flat geometric shapes, modern graphic design',
  'Runway':        'high fashion editorial photography style, dramatic lighting, vogue aesthetic',
  'Risograph':     'risograph print style, halftone dots, limited color palette, vintage print texture',
  'Technicolor':   'vivid technicolor, saturated vintage film colors, dreamlike 1950s cinema palette',
  'Gothic clay':   'gothic clay sculpture style, dark moody lighting, textured clay figures, dramatic shadows',
  'Dynamite':      'explosive pop art, bright neon colors, comic book energy, dynamic composition',
  'Salon':         'classical salon painting style, oil on canvas, warm golden lighting, refined brushwork',
  'Sketch':        'loose pencil sketch style, hand-drawn hatching, sketchbook aesthetic, charcoal and graphite',
  'Cinematic':     'cinematic wide-angle shot, dramatic movie lighting, anamorphic lens flare, film grain',
  'Steampunk':     'steampunk aesthetic, brass gears and clockwork, Victorian industrial, warm copper tones',
  'Sunrise':       'golden hour sunrise, warm pastel gradients, soft ethereal glow, dreamy atmospheric haze',
}

function pickArtStyle(activity: number, teamSize: number): ArtStyle {
  if (activity > 30 && teamSize > 8) return (['Technicolor', 'Dynamite', 'Runway'] as const)[activity % 3]
  if (activity > 20) return (['Cinematic', 'Steampunk', 'Salon'] as const)[activity % 3]
  if (activity > 10) return (['Color block', 'Risograph', 'Sunrise'] as const)[activity % 3]
  return (['Monochrome', 'Sketch', 'Gothic clay'] as const)[activity % 3]
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const googleApiKey = Deno.env.get('GOOGLE_AI_API_KEY') ?? ''

    if (!googleApiKey) {
      return jsonResponse({ error: 'google_ai_api_key_not_configured' }, 500)
    }

    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!jwt) return jsonResponse({ error: 'missing_authorization' }, 401)

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
    if (userErr || !userData?.user) return jsonResponse({ error: 'invalid_token' }, 401)
    const userId = userData.user.id

    const body = await req.json()
    const prompt = (body.prompt ?? '').trim()
    const weekOf = body.week_of ?? ''
    const requestedStyle = (body.art_style ?? '').trim()
    if (!prompt) return jsonResponse({ error: 'prompt_required' }, 400)
    if (!weekOf) return jsonResponse({ error: 'week_of_required' }, 400)

    console.log('Step 1: auth OK, userId:', userId)

    let artStyle: ArtStyle
    if (requestedStyle && ART_STYLES.includes(requestedStyle as ArtStyle)) {
      artStyle = requestedStyle as ArtStyle
    } else {
      let activity = 3
      let teamSize = 0
      try {
        const [m, e, p, l] = await Promise.all([
          supabase.from('cos_team_members').select('id', { count: 'exact', head: true }).eq('user_id', userId),
          supabase.from('cos_one_on_one_events').select('id', { count: 'exact', head: true }).eq('user_id', userId),
          supabase.from('cos_one_on_one_prep').select('id', { count: 'exact', head: true }).eq('user_id', userId),
          supabase.from('cos_dci_logs').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        ])
        teamSize = m.count ?? 0
        activity = (e.count ?? 0) + (p.count ?? 0) * 2 + (l.count ?? 0)
      } catch (metricErr) {
        console.warn('Metrics fetch failed, using defaults:', metricErr)
      }
      artStyle = pickArtStyle(activity, teamSize)
    }
    const styleDesc = STYLE_PROMPTS[artStyle]
    console.log('Step 2: art style:', artStyle)

    const imagePrompt = [
      `Create a wide panoramic banner image in ${styleDesc} style.`,
      `The scene depicts: ${prompt}.`,
      `Make it feel warm, celebratory, and weekend-spirited.`,
      `No text or words in the image.`,
    ].join(' ')

    console.log('Step 3: calling Gemini...')
    const geminiRes = await fetch(
      'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash-image:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': googleApiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: imagePrompt }] }],
        }),
      },
    )

    console.log('Step 4: Gemini status:', geminiRes.status)
    if (!geminiRes.ok) {
      const errBody = await geminiRes.text()
      console.error('Gemini API error body:', errBody.slice(0, 500))
      return jsonResponse({ error: 'image_generation_failed', detail: errBody.slice(0, 300) }, 502)
    }

    const geminiText = await geminiRes.text()
    console.log('Step 5: Gemini response length:', geminiText.length)

    let geminiData: Record<string, unknown>
    try {
      geminiData = JSON.parse(geminiText)
    } catch {
      console.error('Failed to parse Gemini JSON:', geminiText.slice(0, 500))
      return jsonResponse({ error: 'invalid_gemini_response' }, 502)
    }

    // deno-lint-ignore no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parts = (geminiData as any)?.candidates?.[0]?.content?.parts ?? []
    // deno-lint-ignore no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imagePart = parts.find((p: any) => p.inline_data?.data || p.inlineData?.data)
    if (!imagePart) {
      console.error('No image part in response. Keys:', JSON.stringify(Object.keys(geminiData)))
      // deno-lint-ignore no-explicit-any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const textPart = parts.find((p: any) => p.text)
      return jsonResponse({
        error: 'no_image_returned',
        parts_count: parts.length,
        text_response: textPart?.text?.slice(0, 200) ?? null,
      }, 502)
    }

    const inlineData = imagePart.inline_data ?? imagePart.inlineData
    const mimeType: string = inlineData.mime_type ?? inlineData.mimeType ?? 'image/png'
    const base64Data: string = inlineData.data
    console.log('Step 6: got image, mime:', mimeType, 'base64 length:', base64Data.length)

    const raw = atob(base64Data)
    const imageBytes = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) imageBytes[i] = raw.charCodeAt(i)

    const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png'
    const storagePath = `${userId}/${weekOf}.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('weekend-banners')
      .upload(storagePath, imageBytes, { contentType: mimeType, upsert: true })

    if (uploadErr) {
      console.error('Storage upload error:', JSON.stringify(uploadErr))
      return jsonResponse({ error: 'upload_failed', detail: uploadErr.message }, 500)
    }

    const { data: urlData } = supabase.storage.from('weekend-banners').getPublicUrl(storagePath)
    const imageUrl = urlData.publicUrl
    console.log('Step 7: uploaded to', imageUrl)

    const { error: upsertErr } = await supabase
      .from('cos_weekend_vibes')
      .upsert({
        user_id: userId,
        week_of: weekOf,
        friday_prompt: prompt,
        art_style: artStyle,
        image_url: imageUrl,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,week_of' })

    if (upsertErr) {
      console.error('Upsert error:', JSON.stringify(upsertErr))
      return jsonResponse({ error: 'save_failed', detail: upsertErr.message }, 500)
    }

    console.log('Step 8: done!')
    return jsonResponse({ image_url: imageUrl, art_style: artStyle, friday_prompt: prompt, week_of: weekOf }, 200)

  } catch (err) {
    console.error('Top-level crash:', String(err), err instanceof Error ? err.stack : '')
    return jsonResponse({ error: 'internal_error', detail: String(err) }, 500)
  }
})
