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

    // Regular db client (service role if available, else caller JWT)
    const dbKey = serviceRoleKey ?? anonKey!;
    const dbOptions = serviceRoleKey
      ? {}
      : { global: { headers: { Authorization: authHeader } } };
    const db = createClient(supabaseUrl, dbKey, dbOptions);

    // Admin auth client — only usable if service role key is present
    const adminClient = serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey)
      : null;

    const { rows }: { rows: OrgChartRow[] } = await req.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ error: "No rows provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedRows = rows
      .filter(r => r.email)
      .map(r => ({ ...r, email: r.email.trim().toLowerCase() }));

    const emails = normalizedRows.map(r => r.email);

    const { data: existingProfiles, error: fetchError } = await db
      .from("profiles")
      .select("id, email")
      .in("email", emails);

    if (fetchError) {
      return new Response(JSON.stringify({ error: `Failed to fetch profiles: ${fetchError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const existingByEmail = new Map<string, string>(
      (existingProfiles ?? []).map(p => [p.email, p.id])
    );

    const results = { updated: 0, created: 0, skipped: 0, errors: [] as string[] };

    const toUpdate: Array<{ id: string; updates: Record<string, string | undefined> }> = [];
    const toCreate: Array<{ email: string; firstName: string; lastName: string; fullName: string; orgFields: Record<string, string | undefined> }> = [];

    for (const row of normalizedRows) {
      const firstName = row.first_name?.trim() ?? "";
      const lastName = row.last_name?.trim() ?? "";
      const fullName = [firstName, lastName].filter(Boolean).join(" ") || row.email;

      const orgFields: Record<string, string | undefined> = {};
      if (row.department !== undefined) orgFields.department = row.department || undefined;
      if (row.manager_email !== undefined) orgFields.manager_email = row.manager_email?.trim().toLowerCase() || undefined;
      if (row.title) orgFields.title = row.title;

      const nameFields: Record<string, string> = {};
      if (firstName) nameFields.first_name = firstName;
      if (lastName) nameFields.last_name = lastName;

      if (existingByEmail.has(row.email)) {
        const updates = { ...orgFields, ...nameFields };
        if (Object.keys(updates).length > 0) {
          toUpdate.push({ id: existingByEmail.get(row.email)!, updates });
        } else {
          results.skipped++;
        }
      } else {
        toCreate.push({ email: row.email, firstName, lastName, fullName, orgFields });
      }
    }

    // Update existing profiles
    for (const { id, updates } of toUpdate) {
      const { error: updateError } = await db
        .from("profiles")
        .update(updates)
        .eq("id", id);

      if (updateError) {
        results.errors.push(`Failed to update ${id}: ${updateError.message}`);
        results.skipped++;
      } else {
        results.updated++;
      }
    }

    // Create new auth users (trigger handle_new_user auto-creates the profile row)
    if (toCreate.length > 0) {
      if (!adminClient) {
        results.errors.push(`Cannot create ${toCreate.length} new users: service role key not available`);
        results.skipped += toCreate.length;
      } else {
        for (const { email, firstName, lastName, fullName, orgFields } of toCreate) {
          const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
            email,
            email_confirm: true,
            user_metadata: {
              full_name: fullName,
              first_name: firstName,
              last_name: lastName,
            },
          });

          if (createError) {
            results.errors.push(`Failed to create user ${email}: ${createError.message}`);
            results.skipped++;
            continue;
          }

          // Update org fields that the trigger doesn't populate
          const hasOrgFields = Object.keys(orgFields).length > 0;
          if (hasOrgFields) {
            const { error: orgUpdateError } = await adminClient
              .from("profiles")
              .update(orgFields)
              .eq("id", newUser.user.id);

            if (orgUpdateError) {
              results.errors.push(`Created ${email} but failed to set org data: ${orgUpdateError.message}`);
            }
          }

          results.created++;
        }
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
