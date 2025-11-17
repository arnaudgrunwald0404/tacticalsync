import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, Plus, Edit2, Trash2, GripVertical, Check, X, Search, Users, Shield, Mail, MoreVertical, Upload, ChevronDown, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import GridBackground from "@/components/ui/grid-background";
import SettingsNavbar from "@/components/ui/settings-navbar";
import Logo from "@/components/Logo";
import { useRoles } from "@/hooks/useRoles";

interface TemplateItem {
  id: string;
  title: string;
  duration_minutes: number;
  order_index: number;
  isEditing?: boolean;
  editTitle?: string;
  editDuration?: number;
}

interface Template {
  id: string;
  name: string;
  description?: string;
  is_system?: boolean;
  items?: TemplateItem[];
}

const Settings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateItems, setTemplateItems] = useState<TemplateItem[]>([]);
  // Set default section: Admin Management first if available, otherwise Agenda Templates
  const [activeSection, setActiveSection] = useState("agenda-templates");
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemDuration, setNewItemDuration] = useState(5);
  const [saving, setSaving] = useState(false);
  const { isSuperAdmin, isAdmin, loading: rolesLoading } = useRoles();
  const [adminSearchEmail, setAdminSearchEmail] = useState("");
  const [adminList, setAdminList] = useState<Array<{ id: string; email: string }>>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [dbVerifiedSuperAdmin, setDbVerifiedSuperAdmin] = useState(false);
  const [allUsers, setAllUsers] = useState<Array<{ id: string; email: string }>>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  
  // User Management state
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [usersWithDetails, setUsersWithDetails] = useState<Array<{
    id: string;
    email: string;
    full_name?: string;
    is_admin?: boolean;
    is_super_admin?: boolean;
    is_rcdo_admin?: boolean;
    has_logged_in?: boolean;
    last_active?: string | null;
    teams?: Array<{ team_id: string; team_name: string; role: string }>;
  }>>([]);
  const [loadingUsersWithDetails, setLoadingUsersWithDetails] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBulkImportDialog, setShowBulkImportDialog] = useState(false);
  const [showBulkReinviteDialog, setShowBulkReinviteDialog] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [bulkImportFile, setBulkImportFile] = useState<File | null>(null);
  const [bulkImportSkipEmail, setBulkImportSkipEmail] = useState(false);
  const [bulkImportLoading, setBulkImportLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{
    id: string;
    email: string;
    full_name?: string;
    teams?: Array<{ team_id: string; team_name: string; role: string }>;
  } | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteTeamId, setInviteTeamId] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [availableTeams, setAvailableTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [editingUserEmail, setEditingUserEmail] = useState("");
  const [editingUserName, setEditingUserName] = useState("");
  const [editingUserIsAdmin, setEditingUserIsAdmin] = useState(false);
  const [editingUserIsRCDOAdmin, setEditingUserIsRCDOAdmin] = useState(false);
  const [editingUserTeams, setEditingUserTeams] = useState<Set<string>>(new Set());
  const [removingFromTeamId, setRemovingFromTeamId] = useState("");
  
  // Testing mode state
  const [userEmail, setUserEmail] = useState("");
  const [testingMode, setTestingMode] = useState<"admin" | "member">("admin");
  const [switchingRole, setSwitchingRole] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }
      
      // Get user email for testing mode check
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      setUserEmail(user.email || "");

      // Re-check super admin using DB flag to avoid relying on hard-coded email
      let dbIsSuperAdmin = isSuperAdmin;
      try {
        const { data: profileRow, error: profileErr } = await supabase
          .from("profiles")
          .select("is_super_admin")
          .eq("id", user.id)
          .maybeSingle();
        if (!profileErr) {
          dbIsSuperAdmin = Boolean((profileRow as any)?.is_super_admin);
        }
      } catch (e) {
        // keep existing value
      }

      setDbVerifiedSuperAdmin(Boolean(dbIsSuperAdmin));

      // Check if user is an org-level admin (is_admin or is_super_admin)
      // Also check using the profile data we just fetched
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("is_admin, is_super_admin")
        .eq("id", user.id)
        .maybeSingle();

      const isOrgAdmin = Boolean(profileData?.is_admin) || Boolean(profileData?.is_super_admin);

      if (!isOrgAdmin && !isAdmin && !isSuperAdmin && !dbIsSuperAdmin) {
        toast({
          title: "Access Denied",
          description: "You need organization admin privileges to access settings",
          variant: "destructive",
        });
        navigate("/dashboard");
        return;
      }

      // Set default section based on permissions
      if (Boolean(dbIsSuperAdmin) || isSuperAdmin) {
        setActiveSection("user-management");
      } else {
        setActiveSection("agenda-templates");
      }
      
      await fetchTemplates();
      setLoading(false);
    } catch (error: unknown) {
      console.error("Error checking auth:", error);
      toast({
        title: "Error",
        description: "Failed to verify access permissions",
        variant: "destructive",
      });
      navigate("/dashboard");
    }
  };

  const fetchTemplates = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch user's own templates AND system templates
      const { data: templatesData, error } = await supabase
        .from("agenda_templates")
        .select(`
          *,
          items:agenda_template_items(*)
        `)
        .or(`user_id.eq.${user.id},is_system.eq.true`)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching templates:", error);
        toast({
          title: "Error loading templates",
          description: error instanceof Error ? error.message : "An error occurred",
          variant: "destructive",
        });
        return;
      }

      // Sort items by order_index and sort templates (user templates first, then system)
      const templatesWithSortedItems = (templatesData || [])
        .map(template => ({
          ...template,
          items: (template.items || []).sort((a: TemplateItem, b: TemplateItem) => a.order_index - b.order_index),
        }))
        .sort((a: Template, b: Template) => {
          // User templates first (is_system = false), then system templates
          if (a.is_system === b.is_system) return 0;
          return a.is_system ? 1 : -1;
        });

      setTemplates(templatesWithSortedItems);
    } catch (error: unknown) {
      console.error("Error in fetchTemplates:", error);
    }
  };

  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setTemplateName("");
    setTemplateItems([]);
    setShowTemplateDialog(true);
  };

  const fetchAdmins = async () => {
    if (!isSuperAdmin && !dbVerifiedSuperAdmin) return;
    setLoadingAdmins(true);
    try {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("id,email")
        .eq("is_admin", true);
      if (error) throw error;
      setAdminList((data || []).map((p: any) => ({ id: p.id, email: p.email })));
    } catch (e) {
      // noop toast minimal
    } finally {
      setLoadingAdmins(false);
    }
  };

  const fetchAllUsers = async () => {
    if (!isSuperAdmin && !dbVerifiedSuperAdmin) return;
    setLoadingUsers(true);
    try {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("id,email")
        .order("email", { ascending: true });
      if (error) throw error;
      setAllUsers((data || []).map((p: any) => ({ id: p.id, email: p.email })));
    } catch (e) {
      console.error("Error fetching users:", e);
      toast({
        title: "Error",
        description: "Failed to load users",
        variant: "destructive",
      });
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin || dbVerifiedSuperAdmin) {
      fetchAdmins();
      fetchAllUsers();
      fetchUsersWithDetails();
      fetchAvailableTeams();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, dbVerifiedSuperAdmin]);

  const fetchAvailableTeams = async () => {
    if (!isSuperAdmin && !dbVerifiedSuperAdmin) return;
    setLoadingTeams(true);
    try {
      const { data, error } = await supabase
        .from("teams")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) throw error;
      setAvailableTeams(data || []);
    } catch (e) {
      console.error("Error fetching teams:", e);
    } finally {
      setLoadingTeams(false);
    }
  };

  const fetchUsersWithDetails = async () => {
    if (!isSuperAdmin && !dbVerifiedSuperAdmin) return;
    setLoadingUsersWithDetails(true);
    try {
      // Fetch all users with their admin status
      // We'll use a database function to get login info since we can't directly query auth.users
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name, is_admin, is_super_admin, is_rcdo_admin, created_at, updated_at")
        .order("email", { ascending: true });
      
      if (profilesError) throw profilesError;
      if (!profiles) return;

      // For each user, fetch their team memberships and login info
      const usersWithTeams = await Promise.all(
        profiles.map(async (profile: any) => {
          const { data: memberships, error: membershipsError } = await supabase
            .from("team_members")
            .select(`
              team_id,
              role,
              teams:team_id (
                id,
                name
              )
            `)
            .eq("user_id", profile.id);

          const teams = memberships?.map((m: any) => ({
            team_id: m.team_id,
            team_name: m.teams?.name || "Unknown Team",
            role: m.role,
          })) || [];

          // Try to get login info from database function, fallback to profile timestamps
          let hasLoggedIn = false;
          let lastActive: string | null = null;

          try {
            const { data: loginInfo, error: rpcError } = await (supabase as any)
              .rpc('get_user_login_info', { user_id: profile.id });
            
            if (!rpcError && loginInfo && loginInfo.length > 0) {
              const info = loginInfo[0] as any;
              hasLoggedIn = Boolean(info.has_logged_in);
              lastActive = info.last_active || null;
            } else {
              // Fallback: use profile timestamps
              hasLoggedIn = Boolean(profile.created_at);
              lastActive = profile.updated_at || profile.created_at || null;
            }
          } catch (e) {
            // Function might not exist yet, use fallback
            hasLoggedIn = Boolean(profile.created_at);
            lastActive = profile.updated_at || profile.created_at || null;
          }

          return {
            id: profile.id,
            email: profile.email || "",
            full_name: profile.full_name || undefined,
            is_admin: Boolean(profile.is_admin),
            is_super_admin: Boolean(profile.is_super_admin),
            has_logged_in: hasLoggedIn,
            last_active: lastActive,
            teams,
          };
        })
      );

      setUsersWithDetails(usersWithTeams);
    } catch (e) {
      console.error("Error fetching users with details:", e);
      toast({
        title: "Error",
        description: "Failed to load users",
        variant: "destructive",
      });
    } finally {
      setLoadingUsersWithDetails(false);
    }
  };

  const grantAdminByEmail = async (email: string) => {
    if (!email.trim()) return;
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const { data: target, error: findErr } = await supabase
        .from("profiles")
        .select("id, email")
        .eq("email", email.trim())
        .maybeSingle();
      if (findErr) throw findErr;
      if (!target) {
        toast({ title: "User not found", description: "No profile with that email." , variant: "destructive"});
        return;
      }

      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ is_admin: true } as any)
        .eq("id", target.id);
      if (updateErr) throw updateErr;

      // Send notification email via Edge Function (best-effort)
      try {
        const granterName = userEmail || currentUser?.email || "A super admin";
        await fetch(`${(supabase as any)._restUrl?.replace('/rest/v1','') || ''}/functions/v1/send-admin-granted-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`,
          },
          body: JSON.stringify({ email: target.email, granterName }),
        });
      } catch (e) {
        // non-fatal
        console.warn('Failed to trigger admin granted email:', e);
      }
      toast({ title: "Admin granted", description: `${target.email} is now an admin.` });
      setAdminSearchEmail("");
      fetchAdmins();
      fetchAllUsers();
    } catch (e: any) {
      toast({ title: "Failed to grant admin", description: e.message || String(e), variant: "destructive" });
    }
  };

  const revokeAdmin = async (id: string) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_admin: false } as any)
        .eq("id", id);
      if (error) throw error;
      toast({ title: "Admin removed", description: "The user no longer has admin rights." });
      fetchAdmins();
      fetchAllUsers();
      fetchUsersWithDetails();
    } catch (e: any) {
      toast({ title: "Failed to remove admin", description: e.message || String(e), variant: "destructive" });
    }
  };

  // User Management functions
  const handleInviteUser = async () => {
    if (!inviteEmail.trim() || !inviteTeamId) {
      toast({
        title: "Missing information",
        description: "Please provide email and select a team",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) throw new Error("Not authenticated");

      // Get user's name for the email
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", currentUser.id)
        .single();

      // Get team invite code
      const { data: team, error: teamError } = await supabase
        .from("teams")
        .select("invite_code, name")
        .eq("id", inviteTeamId)
        .single();

      if (teamError || !team) throw new Error("Team not found");

      // Create invitation
      const { error: inviteError } = await supabase
        .from("invitations")
        .insert({
          team_id: inviteTeamId,
          email: inviteEmail.toLowerCase().trim(),
          invited_by: currentUser.id,
          role: inviteRole,
          status: "pending",
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });

      if (inviteError) throw inviteError;

      // Send invitation email via Edge Function
      const inviteLink = `${window.location.origin}/join/${team.invite_code}`;
      try {
        await supabase.functions.invoke("send-invitation-email", {
          body: {
            email: inviteEmail.toLowerCase().trim(),
            teamName: team.name,
            inviterName: profile?.full_name || "A super admin",
            inviteLink,
          },
        });
      } catch (e) {
        console.warn("Failed to send invitation email:", e);
      }

      toast({
        title: "Invitation sent",
        description: `${inviteEmail} has been invited to ${team.name}`,
      });

      setShowInviteDialog(false);
      setInviteEmail("");
      setInviteTeamId("");
      setInviteRole("member");
      fetchUsersWithDetails();
    } catch (e: any) {
      toast({
        title: "Failed to invite user",
        description: e.message || String(e),
        variant: "destructive",
      });
    }
  };

  const handleEditUser = async () => {
    if (!selectedUser) return;

    try {
      const updates: any = {};
      if (editingUserEmail.trim() && editingUserEmail !== selectedUser.email) {
        updates.email = editingUserEmail.trim();
      }
      if (editingUserName.trim() !== (selectedUser.full_name || "")) {
        updates.full_name = editingUserName.trim() || null;
      }
      
      // Update admin status if changed
      const currentUser = usersWithDetails.find(u => u.id === selectedUser.id);
      if (currentUser && editingUserIsAdmin !== Boolean(currentUser.is_admin)) {
        updates.is_admin = editingUserIsAdmin;
      }
      
      // Update RCDO admin status if changed
      if (currentUser && editingUserIsRCDOAdmin !== Boolean(currentUser.is_rcdo_admin)) {
        updates.is_rcdo_admin = editingUserIsRCDOAdmin;
      }

      // Update profile first
      if (Object.keys(updates).length > 0) {
        const { error } = await supabase
          .from("profiles")
          .update(updates)
          .eq("id", selectedUser.id);

        if (error) throw error;
      }

      // Handle team memberships
      const currentTeamIds = new Set((selectedUser.teams || []).map(t => t.team_id));
      const newTeamIds = editingUserTeams;
      
      // Teams to add
      const teamsToAdd = Array.from(newTeamIds).filter(id => !currentTeamIds.has(id));
      // Teams to remove
      const teamsToRemove = Array.from(currentTeamIds).filter(id => !newTeamIds.has(id));

      // Ensure user has at least one team
      if (newTeamIds.size === 0 && currentTeamIds.size > 0) {
        toast({
          title: "Cannot remove all teams",
          description: "User must be part of at least one team",
          variant: "destructive",
        });
        return;
      }

      // Add user to new teams (use member role by default, admin if user is admin)
      if (teamsToAdd.length > 0) {
        const { error: addError } = await supabase
          .from("team_members")
          .insert(
            teamsToAdd.map(teamId => ({
              team_id: teamId,
              user_id: selectedUser.id,
              role: editingUserIsAdmin ? 'admin' : 'member',
            }))
          );

        if (addError) throw addError;
      }

      // Remove user from teams
      if (teamsToRemove.length > 0) {
        const { error: removeError } = await supabase
          .from("team_members")
          .delete()
          .eq("user_id", selectedUser.id)
          .in("team_id", teamsToRemove);

        if (removeError) throw removeError;
      }

      toast({
        title: "User updated",
        description: "User information has been updated",
      });

      setShowEditDialog(false);
      setSelectedUser(null);
      fetchUsersWithDetails();
      fetchAllUsers();
      fetchAdmins();
    } catch (e: any) {
      toast({
        title: "Failed to update user",
        description: e.message || String(e),
        variant: "destructive",
      });
    }
  };

  const handleRemoveUserFromTeam = async () => {
    if (!selectedUser || !removingFromTeamId) return;

    try {
      // Check if user would have at least one team remaining
      const remainingTeams = (selectedUser.teams || []).filter(
        (t) => t.team_id !== removingFromTeamId
      );

      if (remainingTeams.length === 0) {
        toast({
          title: "Cannot remove user",
          description: "User must be part of at least one team",
          variant: "destructive",
        });
        return;
      }

      // Remove user from team
      const { error } = await supabase
        .from("team_members")
        .delete()
        .eq("user_id", selectedUser.id)
        .eq("team_id", removingFromTeamId);

      if (error) throw error;

      const teamName = selectedUser.teams?.find((t) => t.team_id === removingFromTeamId)?.team_name || "team";

      toast({
        title: "User removed",
        description: `${selectedUser.email} has been removed from ${teamName}`,
      });

      setShowRemoveDialog(false);
      setSelectedUser(null);
      setRemovingFromTeamId("");
      fetchUsersWithDetails();
    } catch (e: any) {
      toast({
        title: "Failed to remove user",
        description: e.message || String(e),
        variant: "destructive",
      });
    }
  };

  const handleToggleAdmin = async (userId: string, currentAdminStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_admin: !currentAdminStatus } as any)
        .eq("id", userId);

      if (error) throw error;

      toast({
        title: currentAdminStatus ? "Admin revoked" : "Admin granted",
        description: `User ${currentAdminStatus ? "no longer has" : "now has"} admin privileges`,
      });

      fetchAdmins();
      fetchAllUsers();
      fetchUsersWithDetails();
    } catch (e: any) {
      toast({
        title: "Failed to update admin status",
        description: e.message || String(e),
        variant: "destructive",
      });
    }
  };

  const openEditDialog = (user: typeof usersWithDetails[0]) => {
    setSelectedUser(user);
    setEditingUserEmail(user.email);
    setEditingUserName(user.full_name || "");
    setEditingUserIsAdmin(user.is_admin || false);
    setEditingUserIsRCDOAdmin(user.is_rcdo_admin || false);
    setEditingUserTeams(new Set((user.teams || []).map(t => t.team_id)));
    setShowEditDialog(true);
  };

  const openRemoveDialog = (user: typeof usersWithDetails[0], teamId: string) => {
    setSelectedUser(user);
    setRemovingFromTeamId(teamId);
    setShowRemoveDialog(true);
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    setDeleteLoading(true);
    try {
      // Delete user completely via Edge Function
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: {
          userIds: [selectedUser.id],
        },
      });

      if (error) {
        console.error('Delete user error:', error);
        // Check if it's a network/function not found error
        if (error.message?.includes('Failed to send a request') || error.message?.includes('Function not found')) {
          throw new Error('Edge Function not deployed. Please deploy the delete-user function to Supabase.');
        }
        throw new Error(error.message || 'Failed to invoke delete function');
      }

      // Check if the response contains an error
      if (data?.error) {
        throw new Error(data.error + (data.details ? `: ${data.details}` : ''));
      }

      if (data?.errors && data.errors.length > 0) {
        throw new Error(data.errors[0].error || 'Failed to delete user');
      }

      toast({
        title: "User deleted",
        description: `${selectedUser.email} has been permanently deleted from the system`,
      });

      setShowDeleteDialog(false);
      setSelectedUser(null);
      setSelectedUserIds(new Set());
      fetchUsersWithDetails();
    } catch (e: any) {
      console.error('Delete user exception:', e);
      toast({
        title: "Failed to delete user",
        description: e.message || String(e),
        variant: "destructive",
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedUserIds.size === 0) return;

    setDeleteLoading(true);
    try {
      // Delete all selected users completely via Edge Function
      const userIdsArray = Array.from(selectedUserIds);
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: {
          userIds: userIdsArray,
        },
      });

      if (error) {
        console.error('Bulk delete error:', error);
        // Check if it's a network/function not found error
        if (error.message?.includes('Failed to send a request') || error.message?.includes('Function not found')) {
          throw new Error('Edge Function not deployed. Please deploy the delete-user function to Supabase.');
        }
        throw new Error(error.message || 'Failed to invoke delete function');
      }

      // Check if the response contains an error
      if (data?.error) {
        throw new Error(data.error + (data.details ? `: ${data.details}` : ''));
      }

      if (data?.errors && data.errors.length > 0) {
        const errorMessages = data.errors.map((e: any) => e.error).join(', ');
        throw new Error(`Some users failed to delete: ${errorMessages}`);
      }

      const deletedCount = data?.deletedCount || userIdsArray.length;
      toast({
        title: "Users deleted",
        description: `${deletedCount} user${deletedCount > 1 ? 's' : ''} permanently deleted from the system`,
      });

      setShowDeleteDialog(false);
      setSelectedUserIds(new Set());
      fetchUsersWithDetails();
    } catch (e: any) {
      console.error('Bulk delete exception:', e);
      toast({
        title: "Failed to delete users",
        description: e.message || String(e),
        variant: "destructive",
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const toggleUserSelection = (userId: string) => {
    const newSelection = new Set(selectedUserIds);
    if (newSelection.has(userId)) {
      newSelection.delete(userId);
    } else {
      newSelection.add(userId);
    }
    setSelectedUserIds(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedUserIds.size === filteredUsers.length && filteredUsers.length > 0) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(filteredUsers.map(u => u.id)));
    }
  };

  const handleBulkReinvite = async () => {
    if (selectedUserIds.size === 0) return;

    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) throw new Error("Not authenticated");

      // Get user's name for the email
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", currentUser.id)
        .single();

      const inviterName = profile?.full_name || "A super admin";

      // Get selected users who haven't logged in
      const usersToReinvite = filteredUsers.filter(
        user => selectedUserIds.has(user.id) && !user.has_logged_in
      );

      if (usersToReinvite.length === 0) {
        toast({
          title: "No users to reinvite",
          description: "All selected users have already logged in",
          variant: "destructive",
        });
        return;
      }

      // Get teams for invitations
      const { data: teams } = await supabase
        .from("teams")
        .select("id, name, invite_code")
        .limit(1)
        .single();

      if (!teams) {
        toast({
          title: "No teams available",
          description: "Please create a team before sending invitations",
          variant: "destructive",
        });
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      // Process each user
      for (const user of usersToReinvite) {
        try {
          // Check if there's already a pending invitation
          const { data: existingInvitation } = await supabase
            .from("invitations")
            .select("id")
            .eq("email", user.email)
            .eq("status", "pending")
            .maybeSingle();

          if (!existingInvitation) {
            // Create new invitation
            await supabase
              .from("invitations")
              .insert({
                team_id: teams.id,
                email: user.email,
                invited_by: currentUser.id,
                role: user.is_admin ? 'admin' : 'member',
                status: "pending",
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              });
          }

          // Send invitation email
          try {
            await supabase.functions.invoke("send-invitation-email", {
              body: {
                email: user.email,
                teamName: teams.name,
                inviterName,
                inviteLink: `${window.location.origin}/join/${teams.invite_code}`,
              },
            });
            successCount++;
          } catch (e) {
            console.warn(`Failed to send email to ${user.email}:`, e);
            errorCount++;
          }
        } catch (e: any) {
          errorCount++;
          console.error(`Failed to reinvite ${user.email}:`, e);
        }
      }

      toast({
        title: "Reinvitation completed",
        description: `Sent ${successCount} invitation${successCount !== 1 ? 's' : ''}${errorCount > 0 ? `. ${errorCount} error${errorCount !== 1 ? 's' : ''} occurred.` : ''}`,
        variant: errorCount > 0 ? "destructive" : "default",
      });

      setShowBulkReinviteDialog(false);
      setSelectedUserIds(new Set());
      fetchUsersWithDetails();
    } catch (e: any) {
      toast({
        title: "Failed to reinvite users",
        description: e.message || String(e),
        variant: "destructive",
      });
    }
  };

  const openBulkReinviteDialog = () => {
    const usersToReinvite = filteredUsers.filter(
      user => selectedUserIds.has(user.id) && !user.has_logged_in
    );
    
    if (usersToReinvite.length === 0) {
      toast({
        title: "No users to reinvite",
        description: "All selected users have already logged in",
        variant: "destructive",
      });
      return;
    }
    
    setShowBulkReinviteDialog(true);
  };

  const openBulkDeleteDialog = () => {
    setShowDeleteDialog(true);
  };

  const openDeleteDialog = (user: typeof usersWithDetails[0]) => {
    setSelectedUser(user);
    setShowDeleteDialog(true);
  };

  const parseCSV = (csvText: string): Array<{ email: string; firstName: string; lastName: string; status: string }> => {
    const lines = csvText.split('\n').filter(line => line.trim());
    const results: Array<{ email: string; firstName: string; lastName: string; status: string }> = [];
    
    // Skip header row if it exists
    const startIndex = lines[0]?.toLowerCase().includes('email') ? 1 : 0;
    
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Handle CSV with quotes and commas
      const parts = line.split(',').map(part => part.trim().replace(/^"|"$/g, ''));
      
      if (parts.length >= 1) {
        const email = parts[0].toLowerCase().trim();
        const firstName = (parts[1] || '').trim();
        const lastName = (parts[2] || '').trim();
        const status = (parts[3] || 'member').toLowerCase().trim();
        
        // Validate email format
        if (email && email.includes('@')) {
          results.push({ email, firstName, lastName, status });
        }
      }
    }
    
    return results;
  };

  const handleBulkImport = async () => {
    if (!bulkImportFile) {
      toast({
        title: "No file selected",
        description: "Please select a CSV file",
        variant: "destructive",
      });
      return;
    }

    setBulkImportLoading(true);
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) throw new Error("Not authenticated");

      // Read CSV file
      const text = await bulkImportFile.text();
      const users = parseCSV(text);

      if (users.length === 0) {
        toast({
          title: "No valid users found",
          description: "The CSV file is empty or has no valid email addresses",
          variant: "destructive",
        });
        setBulkImportLoading(false);
        return;
      }

      // Get user's name for emails
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", currentUser.id)
        .single();

      const inviterName = profile?.full_name || "A super admin";

      // Get all teams for invitations (we'll need to assign users to teams)
      // For now, we'll create invitations to the first available team or skip if no teams
      const { data: teams } = await supabase
        .from("teams")
        .select("id, name, invite_code")
        .limit(1)
        .single();

      if (!teams) {
        toast({
          title: "No teams available",
          description: "Please create a team before importing users",
          variant: "destructive",
        });
        setBulkImportLoading(false);
        return;
      }

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      // Process each user
      for (const userData of users) {
        try {
          // Combine first and last name
          const fullName = [userData.firstName, userData.lastName].filter(Boolean).join(' ').trim() || null;

          // Check if user already exists
          const { data: existingProfile, error: profileError } = await supabase
            .from("profiles")
            .select("id, email, is_admin, full_name")
            .eq("email", userData.email)
            .maybeSingle();

          if (profileError) {
            throw profileError;
          }

          if (existingProfile) {
            // Update profile with name and admin status if needed
            const shouldBeAdmin = userData.status === 'admin';
            const profile = existingProfile as any;
            const updates: any = {};
            
            if (fullName && profile.full_name !== fullName) {
              updates.full_name = fullName;
            }
            
            if (profile.is_admin !== shouldBeAdmin) {
              updates.is_admin = shouldBeAdmin;
            }

            if (Object.keys(updates).length > 0) {
              await supabase
                .from("profiles")
                .update(updates)
                .eq("id", profile.id);
            }

            // Check if user is already in the team
            const { data: existingMember } = await supabase
              .from("team_members")
              .select("id")
              .eq("user_id", profile.id)
              .eq("team_id", teams.id)
              .maybeSingle();

            if (!existingMember) {
              // Add user to team
              await supabase
                .from("team_members")
                .insert({
                  team_id: teams.id,
                  user_id: profile.id,
                  role: userData.status === 'admin' ? 'admin' : 'member',
                });
            }

            // Send invitation email if not skipped
            if (!bulkImportSkipEmail) {
              try {
                await supabase.functions.invoke("send-invitation-email", {
                  body: {
                    email: userData.email,
                    teamName: teams.name,
                    inviterName,
                    inviteLink: `${window.location.origin}/join/${teams.invite_code}`,
                  },
                });
              } catch (e) {
                console.warn(`Failed to send email to ${userData.email}:`, e);
              }
            }

            successCount++;
          } else {
            // Create invitation for new user
            await supabase
              .from("invitations")
              .insert({
                team_id: teams.id,
                email: userData.email,
                invited_by: currentUser.id,
                role: userData.status === 'admin' ? 'admin' : 'member',
                status: "pending",
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              });

            // Create profile entry if it doesn't exist (will be created when user signs up, but we can pre-populate name)
            // Note: We can't create auth.users directly, so we'll just create the invitation
            // The profile will be created when the user accepts the invitation and signs up

            // Send invitation email if not skipped
            if (!bulkImportSkipEmail) {
              try {
                await supabase.functions.invoke("send-invitation-email", {
                  body: {
                    email: userData.email,
                    teamName: teams.name,
                    inviterName,
                    inviteLink: `${window.location.origin}/join/${teams.invite_code}`,
                  },
                });
              } catch (e) {
                console.warn(`Failed to send email to ${userData.email}:`, e);
              }
            }

            successCount++;
          }
        } catch (e: any) {
          errorCount++;
          errors.push(`${userData.email}: ${e.message || String(e)}`);
        }
      }

      toast({
        title: "Bulk import completed",
        description: `Successfully processed ${successCount} user${successCount !== 1 ? 's' : ''}${errorCount > 0 ? `. ${errorCount} error${errorCount !== 1 ? 's' : ''} occurred.` : ''}`,
        variant: errorCount > 0 ? "destructive" : "default",
      });

      if (errors.length > 0) {
        console.error("Bulk import errors:", errors);
      }

      setShowBulkImportDialog(false);
      setBulkImportFile(null);
      setBulkImportSkipEmail(false);
      fetchUsersWithDetails();
      fetchAvailableTeams();
    } catch (e: any) {
      toast({
        title: "Bulk import failed",
        description: e.message || String(e),
        variant: "destructive",
      });
    } finally {
      setBulkImportLoading(false);
    }
  };

  const filteredUsers = usersWithDetails.filter((user) => {
    const query = userSearchQuery.toLowerCase();
    return (
      user.email.toLowerCase().includes(query) ||
      (user.full_name || "").toLowerCase().includes(query)
    );
  });

  const handleEditTemplate = (template: Template) => {
    // Check if user is trying to edit a system template without superadmin privileges
    if ((template as any).is_system && !isSuperAdmin) {
      toast({
        title: "Access Denied",
        description: "Only superadmin can edit system templates",
        variant: "destructive",
      });
      return;
    }
    
    setEditingTemplate(template);
    setTemplateName(template.name);
    setTemplateItems(template.items || []);
    setShowTemplateDialog(true);
  };

  const handleAddItem = () => {
    if (!newItemTitle.trim()) {
      toast({
        title: "Item title required",
        description: "Please enter a title for the agenda item",
        variant: "destructive",
      });
      return;
    }

    const newItem: TemplateItem = {
      id: crypto.randomUUID(),
      title: newItemTitle,
      duration_minutes: newItemDuration,
      order_index: templateItems.length,
    };

    setTemplateItems([...templateItems, newItem]);
    setNewItemTitle("");
    setNewItemDuration(5);
  };

  const handleRemoveItem = (itemId: string) => {
    const updatedItems = templateItems
      .filter(item => item.id !== itemId)
      .map((item, index) => ({ ...item, order_index: index }));
    setTemplateItems(updatedItems);
  };

  const handleMoveItem = (index: number, direction: "up" | "down") => {
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === templateItems.length - 1)
    ) {
      return;
    }

    const newItems = [...templateItems];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    [newItems[index], newItems[swapIndex]] = [newItems[swapIndex], newItems[index]];
    
    const reorderedItems = newItems.map((item, idx) => ({
      ...item,
      order_index: idx,
    }));
    
    setTemplateItems(reorderedItems);
  };

  const handleEditItem = (itemId: string) => {
    const updatedItems = templateItems.map(item => 
      item.id === itemId 
        ? { 
            ...item, 
            isEditing: true, 
            editTitle: item.title, 
            editDuration: item.duration_minutes 
          }
        : { ...item, isEditing: false }
    );
    setTemplateItems(updatedItems);
  };

  const handleSaveItemEdit = (itemId: string) => {
    const updatedItems = templateItems.map(item => {
      if (item.id === itemId && item.isEditing) {
        const title = item.editTitle?.trim();
        const duration = item.editDuration;
        
        if (!title || !duration || duration < 1) {
          toast({
            title: "Invalid input",
            description: "Please enter a valid title and duration",
            variant: "destructive",
          });
          return item;
        }
        
        return {
          ...item,
          title,
          duration_minutes: duration,
          isEditing: false,
          editTitle: undefined,
          editDuration: undefined,
        };
      }
      return item;
    });
    setTemplateItems(updatedItems);
  };

  const handleCancelItemEdit = (itemId: string) => {
    const updatedItems = templateItems.map(item => 
      item.id === itemId 
        ? { 
            ...item, 
            isEditing: false, 
            editTitle: undefined, 
            editDuration: undefined 
          }
        : item
    );
    setTemplateItems(updatedItems);
  };

  const handleUpdateEditField = (itemId: string, field: 'title' | 'duration', value: string | number) => {
    const updatedItems = templateItems.map(item => 
      item.id === itemId 
        ? { 
            ...item, 
            [field === 'title' ? 'editTitle' : 'editDuration']: value 
          }
        : item
    );
    setTemplateItems(updatedItems);
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      toast({
        title: "Template name required",
        description: "Please enter a name for the template",
        variant: "destructive",
      });
      return;
    }

    if (templateItems.length === 0) {
      toast({
        title: "Add at least one item",
        description: "Please add at least one agenda item to the template",
        variant: "destructive",
      });
      return;
    }

    // Check if any items are currently being edited
    const hasEditingItems = templateItems.some(item => item.isEditing);
    if (hasEditingItems) {
      toast({
        title: "Finish editing items",
        description: "Please finish editing all items before saving the template",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (editingTemplate) {
        // Update existing template
        const { error: templateError } = await supabase
          .from("agenda_templates")
          .update({
            name: templateName,
          })
          .eq("id", editingTemplate.id);

        if (templateError) throw templateError;

        // Delete existing items
        const { error: deleteError } = await supabase
          .from("agenda_template_items")
          .delete()
          .eq("template_id", editingTemplate.id);

        if (deleteError) throw deleteError;

        // Insert new items
        const itemsToInsert = templateItems.map(item => ({
          template_id: editingTemplate.id,
          title: item.title,
          duration_minutes: item.duration_minutes,
          order_index: item.order_index,
        }));

        const { error: itemsError } = await supabase
          .from("agenda_template_items")
          .insert(itemsToInsert);

        if (itemsError) throw itemsError;

        toast({
          title: "Template updated",
          description: `${templateName} has been updated successfully`,
        });
      } else {
        // Create new template
        const { data: newTemplate, error: templateError } = await supabase
          .from("agenda_templates")
          .insert({
            user_id: user.id,
            name: templateName,
          })
          .select()
          .single();

        if (templateError) throw templateError;

        // Insert items
        const itemsToInsert = templateItems.map(item => ({
          template_id: newTemplate.id,
          title: item.title,
          duration_minutes: item.duration_minutes,
          order_index: item.order_index,
        }));

        const { error: itemsError } = await supabase
          .from("agenda_template_items")
          .insert(itemsToInsert);

        if (itemsError) throw itemsError;

        toast({
          title: "Template created",
          description: `${templateName} has been created successfully`,
        });
      }

      setShowTemplateDialog(false);
      await fetchTemplates();
    } catch (error: unknown) {
      toast({
        title: "Error saving template",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const [templateToDelete, setTemplateToDelete] = useState<Template | null>(null);

  const handleDeleteTemplate = async (template: Template) => {
    // Check if user is trying to delete a system template without superadmin privileges
    if ((template as any).is_system && !isSuperAdmin) {
      toast({
        title: "Access Denied",
        description: "Only superadmin can delete system templates",
        variant: "destructive",
      });
      return;
    }
    
    setTemplateToDelete(template);
  };

  const confirmDeleteTemplate = async () => {
    if (!templateToDelete) return;

    try {
      const { error } = await supabase
        .from("agenda_templates")
        .delete()
        .eq("id", templateToDelete.id);

      if (error) throw error;

      toast({
        title: "Template deleted",
        description: `${templateToDelete.name} has been deleted`,
      });

      await fetchTemplates();
    } catch (error: unknown) {
      toast({
        title: "Error deleting template",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setTemplateToDelete(null);
    }
  };

  const getTotalDuration = (items: TemplateItem[]) => {
    return items.reduce((total, item) => total + item.duration_minutes, 0);
  };

  const handleSwitchRole = async () => {
    setSwitchingRole(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const newRole = testingMode === "admin" ? "member" : "admin";

      // Get all teams where user is a member
      const { data: memberships, error: fetchError } = await supabase
        .from("team_members")
        .select("id, team_id, role")
        .eq("user_id", user.id);

      if (fetchError) throw fetchError;

      if (!memberships || memberships.length === 0) {
        toast({
          title: "No teams found",
          description: "You are not a member of any teams",
          variant: "destructive",
        });
        return;
      }

      // Update all memberships to new role
      const { error: updateError } = await supabase
        .from("team_members")
        .update({ role: newRole })
        .eq("user_id", user.id);

      if (updateError) throw updateError;

      setTestingMode(newRole);
      toast({
        title: "Role switched successfully",
        description: `You are now a ${newRole} on all ${memberships.length} team(s)`,
      });
    } catch (error: unknown) {
      toast({
        title: "Error switching role",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setSwitchingRole(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const isTestUser = userEmail === "agrunwald@clearcompany.com";

  return (
    <GridBackground inverted className="min-h-screen bg-blue-50 overscroll-none">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Logo variant="minimal" size="lg" />
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Home
            </Button>

          </div>
        </div>
      </header>
      
      <div className="flex">
        <SettingsNavbar 
          activeSection={activeSection} 
          onSectionChange={setActiveSection}
          userEmail={userEmail}
          showAdminManagement={dbVerifiedSuperAdmin || isSuperAdmin}
        />

        <main className="flex-1 px-8 py-8 max-w-7xl">
        {activeSection === "user-management" && (dbVerifiedSuperAdmin || isSuperAdmin) ? (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">User Management</h2>
                <p className="text-muted-foreground">Manage users, invite to teams, edit profiles, and grant admin privileges.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setShowBulkImportDialog(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Bulk Import
                </Button>
                <Button onClick={() => setShowInviteDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Invite User
                </Button>
              </div>
            </div>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  Search Users
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or email..."
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      All Users ({filteredUsers.length})
                    </CardTitle>
                    <CardDescription>View and manage all users in the system</CardDescription>
                  </div>
                  {selectedUserIds.size > 0 && (
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="default"
                        onClick={openBulkReinviteDialog}
                      >
                        <Mail className="h-4 w-4 mr-2" />
                        Reinvite {filteredUsers.filter(u => selectedUserIds.has(u.id) && !u.has_logged_in).length} Not Logged In
                      </Button>
                      <Button 
                        variant="outline"
                        className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                        onClick={openBulkDeleteDialog}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete {selectedUserIds.size} user{selectedUserIds.size > 1 ? 's' : ''}
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {loadingUsersWithDetails ? (
                  <div className="text-sm text-muted-foreground py-8 text-center">Loading users...</div>
                ) : filteredUsers.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-8 text-center">
                    {userSearchQuery ? "No users found matching your search" : "No users found"}
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[50px]">
                            <Checkbox
                              checked={filteredUsers.length > 0 && selectedUserIds.size === filteredUsers.length}
                              onCheckedChange={toggleSelectAll}
                              className="rounded-none"
                            />
                          </TableHead>
                          <TableHead className="w-[280px]">User</TableHead>
                          <TableHead className="w-[200px]">Has logged in / Last login</TableHead>
                          <TableHead className="w-[120px]">Status</TableHead>
                          <TableHead>Teams</TableHead>
                          <TableHead className="w-[60px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers.map((user) => (
                          <TableRow key={user.id}>
                            <TableCell>
                              <Checkbox
                                checked={selectedUserIds.has(user.id)}
                                onCheckedChange={() => toggleUserSelection(user.id)}
                                className="rounded-none"
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-medium">{user.full_name || "No name"}</span>
                                <span className="text-sm text-muted-foreground">{user.email}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                {user.has_logged_in ? (
                                  <>
                                    <span className="text-xs text-green-600">Yes</span>
                                    {user.last_active && (
                                      <span className="text-xs text-muted-foreground">
                                        {new Date(user.last_active).toLocaleDateString()} {new Date(user.last_active).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-xs text-muted-foreground">No</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                {user.is_super_admin && (
                                  <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">Super Admin</span>
                                )}
                                {user.is_admin && !user.is_super_admin && (
                                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">Admin</span>
                                )}
                                {!user.is_admin && !user.is_super_admin && (
                                  <span className="text-xs text-muted-foreground">Member</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {user.teams && user.teams.length > 0 ? (
                                  <>
                                    {user.teams.map((team) => (
                                      <div
                                        key={team.team_id}
                                        className="flex items-center gap-1 bg-muted px-2 py-0.5 rounded text-xs"
                                      >
                                        <span>{team.team_name}</span>
                                        <span className="text-muted-foreground">({team.role})</span>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-3 w-3 p-0 hover:bg-destructive/20"
                                          onClick={() => openRemoveDialog(user, team.team_id)}
                                        >
                                          <X className="h-2.5 w-2.5" />
                                        </Button>
                                      </div>
                                    ))}
                                  </>
                                ) : (
                                  <span className="text-xs text-muted-foreground italic">No teams</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                    <MoreVertical className="h-4 w-4" />
                                    <span className="sr-only">Open menu</span>
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => openEditDialog(user)}>
                                    <Edit2 className="h-4 w-4 mr-2" />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                    onClick={() => openDeleteDialog(user)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : activeSection === "testing-mode" && isTestUser ? (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold mb-2">🧪 Testing Mode</h2>
                <p className="text-muted-foreground">
                  Switch between admin and member roles on all teams for testing purposes
                </p>
              </div>
            </div>

            <Card className="border-orange-200 bg-orange-50/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <span className="text-2xl">⚠️</span>
                  Role Switcher
                </CardTitle>
                <CardDescription>
                  This feature is only available for testing purposes and will change your role on ALL teams you're a member of.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-white rounded-lg border">
                  <div>
                    <div className="font-semibold">Current Role</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      You are currently set as: <span className="font-bold text-primary">{testingMode}</span>
                    </div>
                  </div>
                  <Button
                    onClick={handleSwitchRole}
                    disabled={switchingRole}
                    variant="outline"
                    size="lg"
                  >
                    {switchingRole ? "Switching..." : `Switch to ${testingMode === "admin" ? "Member" : "Admin"}`}
                  </Button>
                </div>
                
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-900">
                    <strong>Note:</strong> Switching roles will immediately change your permissions on all teams. 
                    You may need to refresh pages to see the updated UI based on your new role.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold mb-2">Agenda Templates</h2>
                <p className="text-muted-foreground">
                  Create reusable agenda templates for your meetings
                </p>
              </div>
              <Button onClick={handleCreateTemplate}>
                <Plus className="h-4 w-4 mr-2" />
                Create Template
              </Button>
            </div>
            <Card>
              <CardContent className="p-6">
                <div className="grid gap-4 md:grid-cols-2">
            {templates.length === 0 ? (
              <Card className="col-span-2 border-dashed border-2">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <p className="text-muted-foreground mb-4">No templates yet</p>
                  <Button onClick={handleCreateTemplate} variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Your First Template
                  </Button>
                </CardContent>
              </Card>
            ) : (
              templates.map((template) => (
                <Card key={template.id} className={`hover:shadow-lg transition-all ${(template as any).is_system ? 'border-primary/30 bg-primary/5' : ''}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg flex items-center gap-2">
                          {template.name}
                          {(template as any).is_system && (
                            <span className="text-xs font-normal bg-primary/10 text-primary px-2 py-1 rounded-full">
                              System
                            </span>
                          )}
                        </CardTitle>
                        {(template as any).description && (
                          <p className="text-sm text-muted-foreground mt-1">{(template as any).description}</p>
                        )}
                      </div>
                      {(!(template as any).is_system || isSuperAdmin) && (
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditTemplate(template)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteTemplate(template)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground">
                        {template.items?.length || 0} item{template.items?.length !== 1 ? 's' : ''} · {getTotalDuration(template.items || [])} minutes total
                      </div>
                      {template.items && template.items.length > 0 && (
                        <div className="space-y-1 text-sm">
                          {template.items.map((item) => (
                            <div key={item.id} className="flex justify-between text-muted-foreground">
                              <span className="truncate flex-1">{item.title}</span>
                              <span className="ml-2">{item.duration_minutes}m</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        </main>
      </div>

      {/* Debug badge for role detection (visible only to super admins to aid local dev) */}
      {(dbVerifiedSuperAdmin || isSuperAdmin) && (
        <div className="fixed bottom-3 right-3 text-xs text-muted-foreground bg-card/80 border rounded px-2 py-1">
          SA hook: {isSuperAdmin ? "true" : "false"} · SA db: {dbVerifiedSuperAdmin ? "true" : "false"}
        </div>
      )}

      {/* Bulk Reinvite Dialog */}
      <Dialog open={showBulkReinviteDialog} onOpenChange={setShowBulkReinviteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reinvite Users</DialogTitle>
            <DialogDescription>
              Send invitation emails to selected users who haven't logged in yet.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {(() => {
              const usersToReinvite = filteredUsers.filter(
                user => selectedUserIds.has(user.id) && !user.has_logged_in
              );
              return (
                <>
                  <p className="text-sm text-muted-foreground mb-4">
                    You are about to send invitation emails to <strong>{usersToReinvite.length}</strong> user{usersToReinvite.length !== 1 ? 's' : ''} who haven't logged in yet.
                  </p>
                  {usersToReinvite.length > 0 && (
                    <div className="max-h-48 overflow-y-auto border rounded-md p-3 bg-muted/50">
                      <p className="text-xs font-medium mb-2">Users to reinvite:</p>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        {usersToReinvite.slice(0, 10).map((user) => (
                          <li key={user.id}>• {user.email}</li>
                        ))}
                        {usersToReinvite.length > 10 && (
                          <li className="text-muted-foreground italic">
                            ...and {usersToReinvite.length - 10} more
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowBulkReinviteDialog(false)}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleBulkReinvite}
            >
              <Mail className="h-4 w-4 mr-2" />
              Send Invitations
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Import Dialog */}
      <Dialog open={showBulkImportDialog} onOpenChange={setShowBulkImportDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Bulk Import Users</DialogTitle>
            <DialogDescription>
              Upload a CSV file to import multiple users at once. Users will be added to the first available team.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-muted rounded-lg border">
              <h4 className="font-semibold text-sm mb-2">Expected CSV Format:</h4>
              <div className="space-y-1 text-sm">
                <p className="text-muted-foreground">Your CSV file should have 4 columns in this exact order:</p>
                <div className="mt-2 space-y-1 font-mono text-xs">
                  <div className="flex gap-4">
                    <span className="font-semibold w-20">Column 1:</span>
                    <span>Email</span>
                  </div>
                  <div className="flex gap-4">
                    <span className="font-semibold w-20">Column 2:</span>
                    <span>First Name</span>
                  </div>
                  <div className="flex gap-4">
                    <span className="font-semibold w-20">Column 3:</span>
                    <span>Last Name</span>
                  </div>
                  <div className="flex gap-4">
                    <span className="font-semibold w-20">Column 4:</span>
                    <span>Status (admin or member)</span>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t">
                  <p className="text-xs text-muted-foreground mb-1">Example:</p>
                  <code className="text-xs bg-background px-2 py-1 rounded block">
                    john.doe@example.com,John,Doe,admin<br />
                    jane.smith@example.com,Jane,Smith,member<br />
                    bob@example.com,Bob,,member
                  </code>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  <strong>Note:</strong> First Name and Last Name are optional. If omitted, leave the column empty but keep the comma separator.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="csvFile">CSV File</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="csvFile"
                  type="file"
                  accept=".csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setBulkImportFile(file);
                    }
                  }}
                  disabled={bulkImportLoading}
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="skipEmail"
                checked={bulkImportSkipEmail}
                onCheckedChange={(checked) => setBulkImportSkipEmail(checked === true)}
                disabled={bulkImportLoading}
              />
              <Label htmlFor="skipEmail" className="text-sm font-normal cursor-pointer">
                Skip sending invitation emails
              </Label>
            </div>
            {bulkImportFile && (
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm">
                  <strong>Selected file:</strong> {bulkImportFile.name}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowBulkImportDialog(false);
                setBulkImportFile(null);
                setBulkImportSkipEmail(false);
              }}
              disabled={bulkImportLoading}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleBulkImport} 
              disabled={!bulkImportFile || bulkImportLoading}
            >
              {bulkImportLoading ? "Importing..." : "Import Users"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite User Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite User to Team</DialogTitle>
            <DialogDescription>
              Send an invitation email to a user to join a team
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="inviteEmail">Email Address</Label>
              <Input
                id="inviteEmail"
                type="email"
                placeholder="user@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inviteTeam">Team</Label>
              <Select value={inviteTeamId} onValueChange={setInviteTeamId} disabled={loadingTeams}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingTeams ? "Loading teams..." : "Select a team"} />
                </SelectTrigger>
                <SelectContent>
                  {availableTeams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inviteRole">Role</Label>
              <Select value={inviteRole} onValueChange={(value: "admin" | "member") => setInviteRole(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInviteDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleInviteUser} disabled={!inviteEmail.trim() || !inviteTeamId}>
              Send Invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user information
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editEmail">Email Address</Label>
              <Input
                id="editEmail"
                type="email"
                value={editingUserEmail}
                onChange={(e) => setEditingUserEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editName">Full Name</Label>
              <Input
                id="editName"
                value={editingUserName}
                onChange={(e) => setEditingUserName(e.target.value)}
                placeholder="Enter full name"
              />
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <Checkbox
                id="editIsAdmin"
                checked={editingUserIsAdmin}
                onCheckedChange={(checked) => setEditingUserIsAdmin(checked === true)}
                className="rounded-none"
              />
              <Label htmlFor="editIsAdmin" className="text-sm font-normal cursor-pointer flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Admin privileges
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="editIsRCDOAdmin"
                checked={editingUserIsRCDOAdmin}
                onCheckedChange={(checked) => setEditingUserIsRCDOAdmin(checked === true)}
                className="rounded-none"
              />
              <Label htmlFor="editIsRCDOAdmin" className="text-sm font-normal cursor-pointer flex items-center gap-2">
                <Shield className="h-4 w-4" />
                RCDO Admin (can finalize cycles & objectives)
              </Label>
            </div>
            <div className="space-y-2 pt-2">
              <Label>Teams</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between"
                  >
                    <span className="truncate">
                      {editingUserTeams.size === 0
                        ? "Select teams..."
                        : editingUserTeams.size === 1
                        ? availableTeams.find(t => editingUserTeams.has(t.id))?.name
                        : `${editingUserTeams.size} teams selected`}
                    </span>
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                  <div className="max-h-60 overflow-y-auto p-2">
                    {availableTeams.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-4 text-center">
                        No teams available
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {availableTeams.map((team) => (
                          <div
                            key={team.id}
                            className="flex items-center space-x-2 p-2 hover:bg-muted rounded-md cursor-pointer"
                            onClick={() => {
                              const newTeams = new Set(editingUserTeams);
                              if (newTeams.has(team.id)) {
                                // Don't allow removing if it's the last team
                                if (newTeams.size > 1) {
                                  newTeams.delete(team.id);
                                  setEditingUserTeams(newTeams);
                                }
                              } else {
                                newTeams.add(team.id);
                                setEditingUserTeams(newTeams);
                              }
                            }}
                          >
                            <Checkbox
                              checked={editingUserTeams.has(team.id)}
                              onCheckedChange={(checked) => {
                                const newTeams = new Set(editingUserTeams);
                                if (checked) {
                                  newTeams.add(team.id);
                                } else {
                                  // Don't allow removing if it's the last team
                                  if (newTeams.size > 1) {
                                    newTeams.delete(team.id);
                                  } else {
                                    toast({
                                      title: "Cannot remove all teams",
                                      description: "User must be part of at least one team",
                                      variant: "destructive",
                                    });
                                    return;
                                  }
                                }
                                setEditingUserTeams(newTeams);
                              }}
                              className="rounded-none"
                            />
                            <Label className="text-sm font-normal cursor-pointer flex-1">
                              {team.name}
                            </Label>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">
                User must be part of at least one team
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditUser}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove User from Team Dialog */}
      <Dialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove User from Team</DialogTitle>
            <DialogDescription>
              {selectedUser && removingFromTeamId && (
                <>
                  Are you sure you want to remove <strong>{selectedUser.email}</strong> from{" "}
                  <strong>{selectedUser.teams?.find((t) => t.team_id === removingFromTeamId)?.team_name || "this team"}</strong>?
                  {selectedUser.teams && selectedUser.teams.length === 1 && (
                    <div className="mt-2 text-destructive">
                      Warning: This user is only in one team. They must be part of at least one team.
                    </div>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRemoveDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemoveUserFromTeam}>
              Remove from Team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={(open) => {
        if (!deleteLoading) {
          setShowDeleteDialog(open);
          if (!open) {
            if (selectedUserIds.size > 0) {
              setSelectedUserIds(new Set());
            } else {
              setSelectedUser(null);
            }
          }
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedUserIds.size > 0 ? 'Users' : 'User'}</DialogTitle>
            <DialogDescription>
              {selectedUserIds.size > 0 ? (
                <>
                  Are you sure you want to permanently delete <strong>{selectedUserIds.size} user{selectedUserIds.size > 1 ? 's' : ''}</strong>?
                  <div className="mt-2 text-destructive font-medium">
                    This action cannot be undone. This will permanently delete the user account, profile, and remove them from all teams.
                  </div>
                </>
              ) : selectedUser && (
                <>
                  Are you sure you want to permanently delete <strong>{selectedUser.email}</strong>?
                  <div className="mt-2 text-destructive font-medium">
                    This action cannot be undone. This will permanently delete the user account, profile, and remove them from all teams.
                  </div>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {deleteLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                Deleting {selectedUserIds.size > 0 ? `${selectedUserIds.size} user${selectedUserIds.size > 1 ? 's' : ''}` : 'user'}...
              </span>
            </div>
          )}
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowDeleteDialog(false);
                if (selectedUserIds.size > 0) {
                  setSelectedUserIds(new Set());
                } else {
                  setSelectedUser(null);
                }
              }}
              disabled={deleteLoading}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                if (selectedUserIds.size > 0) {
                  handleBulkDelete();
                } else {
                  handleDeleteUser();
                }
              }}
              disabled={deleteLoading}
            >
              {deleteLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Permanently'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!templateToDelete} onOpenChange={(open) => !open && setTemplateToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{templateToDelete?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTemplateToDelete(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteTemplate}
            >
              Delete Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Edit Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Edit Template" : "Create Template"}
            </DialogTitle>
            <DialogDescription>
              Create a reusable agenda template for your meetings
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="templateName">Template Name</Label>
              <Input
                id="templateName"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g., Weekly Tactical, Monthly Review"
              />
            </div>

            <div className="border-t pt-4">
              <h4 className="font-semibold mb-3">Agenda Items</h4>
              
              {templateItems.length > 0 && (
                <div className="space-y-2 mb-4">
                  {templateItems.map((item, index) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg"
                    >
                      <div className="flex flex-col gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-4 p-0 hover:bg-transparent"
                          onClick={() => handleMoveItem(index, "up")}
                          disabled={index === 0 || item.isEditing}
                        >
                          ▲
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-4 p-0 hover:bg-transparent"
                          onClick={() => handleMoveItem(index, "down")}
                          disabled={index === templateItems.length - 1 || item.isEditing}
                        >
                          ▼
                        </Button>
                      </div>
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      
                      {item.isEditing ? (
                        <div className="flex-1 space-y-2">
                          <Input
                            value={item.editTitle || ''}
                            onChange={(e) => handleUpdateEditField(item.id, 'title', e.target.value)}
                            placeholder="Item title"
                            className="text-sm"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleSaveItemEdit(item.id);
                              } else if (e.key === 'Escape') {
                                handleCancelItemEdit(item.id);
                              }
                            }}
                            autoFocus
                          />
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min="1"
                              max="180"
                              value={item.editDuration || 5}
                              onChange={(e) => handleUpdateEditField(item.id, 'duration', parseInt(e.target.value) || 5)}
                              className="text-sm w-20"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleSaveItemEdit(item.id);
                                } else if (e.key === 'Escape') {
                                  handleCancelItemEdit(item.id);
                                }
                              }}
                            />
                            <span className="text-sm text-muted-foreground">minutes</span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1">
                          <div className="font-medium">{item.title}</div>
                          <div className="text-sm text-muted-foreground">
                            {item.duration_minutes} minute{item.duration_minutes !== 1 ? 's' : ''}
                          </div>
                        </div>
                      )}
                      
                      <div className="flex gap-1">
                        {item.isEditing ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSaveItemEdit(item.id)}
                            >
                              <Check className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCancelItemEdit(item.id)}
                            >
                              <X className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditItem(item.id)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveItem(item.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="text-sm text-muted-foreground text-right">
                    Total duration: {getTotalDuration(templateItems)} minutes
                  </div>
                </div>
              )}

              <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
                <h5 className="text-sm font-medium">Add New Item</h5>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 sm:col-span-1">
                    <Label htmlFor="newItemTitle" className="text-xs">Item Title</Label>
                    <Input
                      id="newItemTitle"
                      value={newItemTitle}
                      onChange={(e) => setNewItemTitle(e.target.value)}
                      placeholder="e.g., Team Updates"
                      onKeyPress={(e) => e.key === 'Enter' && handleAddItem()}
                    />
                  </div>
                  <div>
                    <Label htmlFor="newItemDuration" className="text-xs">Duration (minutes)</Label>
                    <Input
                      id="newItemDuration"
                      type="number"
                      min="1"
                      max="180"
                      value={newItemDuration}
                      onChange={(e) => setNewItemDuration(parseInt(e.target.value) || 5)}
                    />
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddItem}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowTemplateDialog(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveTemplate}
              disabled={saving || !templateName.trim() || templateItems.length === 0}
            >
              {saving ? "Saving..." : editingTemplate ? "Update Template" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </GridBackground>
  );
};

export default Settings;

