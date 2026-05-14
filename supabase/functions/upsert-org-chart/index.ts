import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OrgChartRow {
  email: string;
  first_name?: string;
  last_name?: string;
  department?: string;
  manager_email?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify the calling user is authenticated and is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin or superadmin role
    const { data: roleData } = await userClient
      .from("team_members")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!roleData || !["admin", "superadmin"].includes(roleData.role)) {
      return new Response(JSON.stringify({ error: "Forbidden: admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { rows }: { rows: OrgChartRow[] } = await req.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ error: "No rows provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role client for upsert (bypasses RLS)
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const results = { updated: 0, skipped: 0, errors: [] as string[] };

    for (const row of rows) {
      if (!row.email) {
        results.skipped++;
        continue;
      }

      const email = row.email.trim().toLowerCase();

      // Find existing profile by email
      const { data: existingProfile } = await adminClient
        .from("profiles")
        .select("id")
        .eq("email", email)
        .single();

      if (!existingProfile) {
        results.skipped++;
        results.errors.push(`No profile found for ${email}`);
        continue;
      }

      const updates: Record<string, string | undefined> = {};
      if (row.department !== undefined) updates.department = row.department || undefined;
      if (row.manager_email !== undefined) updates.manager_email = row.manager_email?.trim().toLowerCase() || undefined;
      if (row.first_name !== undefined && row.first_name) updates.first_name = row.first_name;
      if (row.last_name !== undefined && row.last_name) updates.last_name = row.last_name;

      if (Object.keys(updates).length === 0) {
        results.skipped++;
        continue;
      }

      const { error: updateError } = await adminClient
        .from("profiles")
        .update(updates)
        .eq("id", existingProfile.id);

      if (updateError) {
        results.errors.push(`Failed to update ${email}: ${updateError.message}`);
        results.skipped++;
      } else {
        results.updated++;
      }
    }

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
