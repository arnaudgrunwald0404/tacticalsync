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
  title?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("VITE_SUPABASE_ANON_KEY");
    const authHeader = req.headers.get("Authorization") ?? "";

    if (!supabaseUrl || (!serviceRoleKey && !anonKey)) {
      return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role if available, otherwise fall back to caller's JWT
    const key = serviceRoleKey ?? anonKey!;
    const clientOptions = serviceRoleKey
      ? {}
      : { global: { headers: { Authorization: authHeader } } };
    const db = createClient(supabaseUrl, key, clientOptions);

    const { rows }: { rows: OrgChartRow[] } = await req.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ error: "No rows provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = { updated: 0, skipped: 0, errors: [] as string[] };

    for (const row of rows) {
      if (!row.email) { results.skipped++; continue; }

      const email = row.email.trim().toLowerCase();
      const { data: existingProfile } = await db
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
      if (row.title !== undefined && row.title) updates.title = row.title;

      if (Object.keys(updates).length === 0) { results.skipped++; continue; }

      const { error: updateError } = await db
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
