import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRoleOverride } from "@/contexts/RoleOverrideContext";
import { useCurrentUser } from "@/contexts/AuthContext";

export type RoleTag = 'admin' | 'elt' | 'xlt' | 'user' | 'test_user';
export const ALL_ROLE_TAGS: RoleTag[] = ['admin', 'elt', 'xlt', 'user', 'test_user'];

interface RolesState {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isRCDOAdmin: boolean;
  roleTags: RoleTag[];
  loading: boolean;
  error?: string;
}

export function useRoles(): RolesState {
  const [state, setState] = useState<RolesState>({ isAdmin: false, isSuperAdmin: false, isRCDOAdmin: false, roleTags: [], loading: true });
  const { user } = useCurrentUser();

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        if (!user) {
          if (isMounted) setState({ isAdmin: false, isSuperAdmin: false, isRCDOAdmin: false, roleTags: [], loading: false, error: "Not authenticated" });
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("is_admin,is_super_admin,is_rcdo_admin,role_tags")
          .eq("id", user.id)
          .maybeSingle();

        if (error) throw error;

        // Fallback: treat specific emails as super admin and persist flag if missing
        const emailLower = (user.email || "").toLowerCase();
        const emailIsSuperAdmin = emailLower === "agrunwald@clearcompany.com"
          || emailLower.endsWith("@gearcompany.com");

        const row = data as { is_super_admin?: boolean; is_admin?: boolean; is_rcdo_admin?: boolean; role_tags?: string[] } | null;
        const effectiveIsSuperAdmin = Boolean(row?.is_super_admin) || emailIsSuperAdmin;
        const effectiveIsAdmin = Boolean(row?.is_admin) || effectiveIsSuperAdmin;
        const effectiveIsRCDOAdmin = Boolean(row?.is_rcdo_admin) || effectiveIsSuperAdmin;

        // If email implies super admin but DB flag is false, try to persist it (best-effort)
        if (emailIsSuperAdmin && !row?.is_super_admin) {
          try {
            await supabase.from("profiles").update({ is_super_admin: true }).eq("id", user.id);
          } catch {
            // non-fatal
          }
        }

        const rawTags = (row?.role_tags ?? []) as string[];
        const roleTags = rawTags.filter((t): t is RoleTag => ALL_ROLE_TAGS.includes(t as RoleTag));

        if (isMounted) {
          setState({
            isAdmin: effectiveIsAdmin,
            isSuperAdmin: effectiveIsSuperAdmin,
            isRCDOAdmin: effectiveIsRCDOAdmin,
            roleTags,
            loading: false,
          });
        }
      } catch (e: unknown) {
        if (isMounted) setState({ isAdmin: false, isSuperAdmin: false, isRCDOAdmin: false, roleTags: [], loading: false, error: (e as Error).message });
      }
    };

    load();
    return () => { isMounted = false; };
  }, [user]);

  const { override } = useRoleOverride();

  return useMemo(() => {
    if (!override) return state;
    const isAdmin = override === 'admin';
    return {
      ...state,
      isAdmin,
      isSuperAdmin: isAdmin && state.isSuperAdmin,
      isRCDOAdmin: isAdmin && state.isRCDOAdmin,
      // Simulating 'member' should also suppress role-tag-derived capability,
      // otherwise a real admin/elt/xlt tag would leak through the override.
      roleTags: override === 'member' ? [] : state.roleTags,
    };
  }, [state, override]);
}


