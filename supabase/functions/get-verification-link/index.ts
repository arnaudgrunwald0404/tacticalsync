import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { userId, email, type = 'signup', redirectTo } = await req.json()

    if (!userId && !email) {
      return new Response(JSON.stringify({ error: 'userId or email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get service role key from environment
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('VITE_SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Create admin client
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Find user and get email if only userId provided
    let targetEmail = email
    let userInfo: any = null
    
    if (!targetEmail && userId) {
      const { data: user, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId)
      if (userError) throw userError
      if (!user.user?.email) {
        return new Response(JSON.stringify({ error: 'User email not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      targetEmail = user.user.email
      userInfo = user.user
    } else if (email) {
      // Try to find user by email to get more info
      targetEmail = email
      console.log('[DEBUG] Using provided email directly:', email)
      
      try {
        const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        })
        
        if (!listError && usersData?.users) {
          const user = usersData.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
          if (user) {
            userInfo = user
            console.log('[DEBUG] User found in database:', {
              id: user.id,
              email: user.email,
              confirmed: !!user.email_confirmed_at,
              created: user.created_at,
              providers: user.app_metadata?.providers || [],
              provider: user.app_metadata?.provider || 'unknown'
            })
          } else {
            console.log('[DEBUG] User not found in first 1000 users')
            console.log('[DEBUG] Total users in first page:', usersData.users.length)
            if (usersData.total) {
              console.log('[DEBUG] Total users in database:', usersData.total)
            }
          }
        } else if (listError) {
          console.log('[DEBUG] Error listing users:', listError)
        }
      } catch (checkError: any) {
        console.log('[DEBUG] Could not check user existence:', checkError?.message || checkError)
      }
      
      console.log('[DEBUG] Will attempt to generate link - generateLink will validate if user exists')
    }

    // For password reset, Supabase already sends the email via resetPasswordForEmail
    // So we don't need to generate a link - the user should check their email
    if (type === 'reset') {
      console.log('[DEBUG] Password reset requested - Supabase already sent the email')
      return new Response(JSON.stringify({ 
        note: 'Password reset email has been sent by Supabase. Please check your email inbox.',
        email: targetEmail
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Generate verification link only for signup/email verification
    // If redirectTo is provided and contains a path, use it as-is
    // Otherwise, construct it from siteUrl + /dashboard
    let redirectUrl: string
    if (redirectTo) {
      // redirectTo from client already includes the full path (e.g., http://localhost:8080/dashboard)
      redirectUrl = redirectTo
    } else {
      const siteUrl = Deno.env.get('SITE_URL') || 'http://localhost:8089'
      redirectUrl = `${siteUrl}/dashboard`
    }

    console.log('[DEBUG] Generating link with redirectTo:', redirectUrl)
    console.log('[DEBUG] Site URL from env:', Deno.env.get('SITE_URL'))
    console.log('[DEBUG] RedirectTo from request:', redirectTo)
    console.log('[DEBUG] Final redirect URL:', redirectUrl)
    console.log('[DEBUG] Type:', type)
    console.log('[DEBUG] Target email:', targetEmail)
    if (userInfo) {
      console.log('[DEBUG] User info:', {
        id: userInfo.id,
        confirmed: !!userInfo.email_confirmed_at,
        providers: userInfo.app_metadata?.providers || []
      })
    }

    // Try different link types based on user status
    // 'email' works for both new and existing users
    // 'magiclink' can also work for existing users
    let linkType = 'email'
    let lastError: any = null
    
    // If user exists and is already confirmed, try magiclink instead
    if (userInfo && userInfo.email_confirmed_at) {
      console.log('[DEBUG] User is already confirmed, trying magiclink type')
      linkType = 'magiclink'
    }
    
    console.log('[DEBUG] Using link type:', linkType)

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: linkType,
      email: targetEmail,
      options: {
        redirectTo: redirectUrl,
      },
    })

    if (error) {
      console.error('Error generating link with type', linkType, ':', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
      
      // If email type failed and user exists, try magiclink as fallback
      if (linkType === 'email' && userInfo) {
        console.log('[DEBUG] Trying magiclink as fallback...')
        const { data: magicData, error: magicError } = await supabaseAdmin.auth.admin.generateLink({
          type: 'magiclink',
          email: targetEmail,
          options: {
            redirectTo: redirectUrl,
          },
        })
        
        if (!magicError && magicData) {
          console.log('[DEBUG] Successfully generated magiclink')
          let finalLink = magicData.properties.action_link
          if (redirectUrl && finalLink.includes('redirect_to=')) {
            const url = new URL(finalLink)
            url.searchParams.set('redirect_to', redirectUrl)
            finalLink = url.toString()
            console.log('[DEBUG] Updated link redirect_to to:', redirectUrl)
          }
          
          return new Response(JSON.stringify({ 
            success: true, 
            link: finalLink,
            email: magicData.properties.email,
            linkType: 'magiclink',
            note: userInfo.email_confirmed_at ? 'User is already confirmed - this is a magic link for sign-in' : 'Verification link generated'
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }
      
      return new Response(JSON.stringify({ 
        error: error.message,
        details: error.toString(),
        linkType,
        targetEmail,
        userExists: !!userInfo,
        userConfirmed: userInfo ? !!userInfo.email_confirmed_at : undefined,
        userProviders: userInfo?.app_metadata?.providers || []
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // If the generated link has a different redirect_to, replace it with the one we want
    let finalLink = data.properties.action_link
    if (redirectUrl && finalLink.includes('redirect_to=')) {
      // Replace the redirect_to parameter in the URL
      const url = new URL(finalLink)
      url.searchParams.set('redirect_to', redirectUrl)
      finalLink = url.toString()
      console.log('[DEBUG] Updated link redirect_to to:', redirectUrl)
    }

    return new Response(JSON.stringify({ 
      success: true, 
      link: finalLink,
      email: data.properties.email,
      linkType: linkType,
      userConfirmed: userInfo ? !!userInfo.email_confirmed_at : undefined
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Unexpected error:', error)
    console.error('Error stack:', error.stack)
    console.error('Error name:', error.name)
    return new Response(JSON.stringify({ 
      error: error.message || 'Internal server error',
      errorName: error.name,
      errorStack: error.stack,
      errorString: error.toString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

