import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DeleteUserRequest {
  userIds: string[];
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Create Supabase client with service role key for admin operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    
    if (!supabaseServiceKey) {
      console.error('Missing SUPABASE_SERVICE_ROLE_KEY')
      return new Response(JSON.stringify({ error: 'Service role key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Verify the requesting user is authenticated and is a super admin
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    
    if (authError || !user) {
      console.error('Auth error:', authError)
      return new Response(JSON.stringify({ error: 'Unauthorized', details: authError?.message }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check if user is super admin
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('is_super_admin')
      .eq('id', user.id)
      .single()

    if (profileError) {
      console.error('Profile error:', profileError)
      return new Response(JSON.stringify({ error: 'Failed to check admin status', details: profileError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!profile?.is_super_admin) {
      return new Response(JSON.stringify({ error: 'Forbidden: Super admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Parse request body
    const { userIds }: DeleteUserRequest = await req.json()

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid request: userIds array required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // UUID validation regex
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    // Filter out invalid UUIDs (including pending invitations)
    const validUserIds: string[] = []
    const invalidUserIds: string[] = []

    for (const userId of userIds) {
      if (userId.startsWith('pending-')) {
        invalidUserIds.push(userId)
      } else if (uuidRegex.test(userId)) {
        validUserIds.push(userId)
      } else {
        invalidUserIds.push(userId)
      }
    }

    // If all IDs are invalid, return early
    if (validUserIds.length === 0) {
      const errorMessage = invalidUserIds.length === 1
        ? `Invalid user ID: ${invalidUserIds[0]}. Pending invitations cannot be deleted through this endpoint.`
        : `All user IDs are invalid. ${invalidUserIds.length} invalid ID(s) provided, including pending invitations which cannot be deleted through this endpoint.`
      
      return new Response(JSON.stringify({ 
        error: errorMessage,
        invalidIds: invalidUserIds
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const deletedUsers: string[] = []
    const errors: Array<{ userId: string; error: string }> = []

    // Add errors for invalid IDs
    for (const invalidId of invalidUserIds) {
      errors.push({ 
        userId: invalidId, 
        error: invalidId.startsWith('pending-') 
          ? 'Pending invitations cannot be deleted through this endpoint. Use the invitations table instead.'
          : 'Invalid UUID format'
      })
    }

    // Delete each valid user
    for (const userId of validUserIds) {
      try {
        // First, delete from team_members (cascade should handle this, but being explicit)
        const { error: teamMembersError } = await supabaseAdmin
          .from('team_members')
          .delete()
          .eq('user_id', userId)

        if (teamMembersError) {
          console.error(`Failed to delete team members for ${userId}:`, teamMembersError)
          errors.push({ userId, error: `Failed to delete team members: ${teamMembersError.message}` })
          continue
        }

        // Delete from profiles
        const { error: profileDeleteError } = await supabaseAdmin
          .from('profiles')
          .delete()
          .eq('id', userId)

        if (profileDeleteError) {
          console.error(`Failed to delete profile for ${userId}:`, profileDeleteError)
          errors.push({ userId, error: `Failed to delete profile: ${profileDeleteError.message}` })
          continue
        }

        // Delete from auth.users using Admin API
        const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

        if (authDeleteError) {
          console.error(`Failed to delete auth user ${userId}:`, authDeleteError)
          errors.push({ userId, error: `Failed to delete auth user: ${authDeleteError.message}` })
          continue
        }

        deletedUsers.push(userId)
      } catch (error) {
        console.error(`Error deleting user ${userId}:`, error)
        errors.push({ userId, error: error instanceof Error ? error.message : String(error) })
      }
    }

    return new Response(JSON.stringify({
      success: true,
      deletedCount: deletedUsers.length,
      deletedUsers,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : String(error),
      details: error instanceof Error ? error.stack : undefined
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

