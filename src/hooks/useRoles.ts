import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface RolesState {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isRCDOAdmin: boolean;
  loading: boolean;
  error?: string;
}

export function useRoles(): RolesState {
  const [state, setState] = useState<RolesState>({ isAdmin: false, isSuperAdmin: false, isRCDOAdmin: false, loading: true });

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!user) {
          if (isMounted) setState({ isAdmin: false, isSuperAdmin: false, isRCDOAdmin: false, loading: false, error: "Not authenticated" });
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("is_admin,is_super_admin,is_rcdo_admin")
          .eq("id", user.id)
          .maybeSingle();

        if (error) throw error;

        // Fallback: treat specific email as super admin and persist flag if missing
        const emailIsSuperAdmin = (user.email || "").toLowerCase() === "agrunwald@clearcompany.com";

        const row: any = data as any;
        let effectiveIsSuperAdmin = Boolean(row?.is_super_admin) || emailIsSuperAdmin;
        let effectiveIsAdmin = Boolean(row?.is_admin) || effectiveIsSuperAdmin;
        let effectiveIsRCDOAdmin = Boolean(row?.is_rcdo_admin) || effectiveIsSuperAdmin;

        // If email implies super admin but DB flag is false, try to persist it (best-effort)
        if (emailIsSuperAdmin && !Boolean(row?.is_super_admin)) {
          try {
            await supabase.from("profiles").update({ is_super_admin: true } as any).eq("id", user.id);
          } catch {
            // non-fatal
          }
        }

        if (isMounted) {
          setState({
            isAdmin: effectiveIsAdmin,
            isSuperAdmin: effectiveIsSuperAdmin,
            isRCDOAdmin: effectiveIsRCDOAdmin,
            loading: false,
          });
        }
      } catch (e: unknown) {
        if (isMounted) setState({ isAdmin: false, isSuperAdmin: false, isRCDOAdmin: false, loading: false, error: (e as Error).message });
      }
    };

    load();
    return () => { isMounted = false; };
  }, []);

  return state;
}


