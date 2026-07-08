import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import GridBackground from "@/components/ui/grid-background";
import Logo from "@/components/Logo";
import { UserProfileHeader } from "@/components/ui/user-profile-header";
import { Loader2, Link2, CheckCircle2, XCircle } from "lucide-react";

interface InvitePreview {
  team_member_name: string;
  inviter_name: string;
  invited_email: string;
  status: string;
  expires_at: string;
}

type ViewState =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "preview"; preview: InvitePreview }
  | { kind: "claiming" }
  | { kind: "error"; message: string };

const ERROR_MESSAGES: Record<string, string> = {
  invite_not_found: "This invite link is not valid.",
  already_claimed: "This invite has already been used.",
  invite_cancelled: "This invite has been cancelled.",
  invite_expired: "This invite has expired. Ask them to send you a new one.",
  email_mismatch: "This invite was sent to a different email address than the one you're signed in with.",
  already_linked_to_other_user: "This person's profile is already linked to a different account.",
  not_authenticated: "You need to be signed in to accept this invite.",
};

const ClaimTeamMemberInvite = () => {
  const { inviteCode } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [state, setState] = useState<ViewState>({ kind: "loading" });

  useEffect(() => {
    checkAuthAndLoadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteCode]);

  const checkAuthAndLoadPreview = async () => {
    if (!inviteCode) {
      setState({ kind: "invalid" });
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      localStorage.setItem('pendingCosInviteCode', inviteCode);
      navigate(`/auth?cosInvite=${inviteCode}`);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('get_cos_team_member_invite_preview', {
      p_invite_code: inviteCode,
    });

    if (error || !data || (Array.isArray(data) && data.length === 0)) {
      setState({ kind: "invalid" });
      return;
    }

    const preview = (Array.isArray(data) ? data[0] : data) as InvitePreview | null;

    if (!preview || !preview.team_member_name) {
      setState({ kind: "invalid" });
      return;
    }

    if (preview.status !== 'pending' || new Date(preview.expires_at) < new Date()) {
      setState({
        kind: "error",
        message: preview.status === 'claimed'
          ? ERROR_MESSAGES.already_claimed
          : preview.status === 'cancelled'
            ? ERROR_MESSAGES.invite_cancelled
            : ERROR_MESSAGES.invite_expired,
      });
      return;
    }

    setState({ kind: "preview", preview });
  };

  const handleLinkAccount = async () => {
    if (!inviteCode) return;
    setState({ kind: "claiming" });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('claim_cos_team_member_invite', {
      p_invite_code: inviteCode,
    });

    if (error) {
      setState({ kind: "error", message: error.message || "Something went wrong claiming this invite." });
      return;
    }

    const result = (data ?? {}) as { success?: boolean; error?: string };

    if (!result.success) {
      const message = (result.error && ERROR_MESSAGES[result.error]) || "This invite could not be claimed.";
      setState({ kind: "error", message });
      return;
    }

    toast({ title: "Account linked", description: "You're now connected." });
    localStorage.removeItem('pendingCosInviteCode');
    navigate('/settings?section=connections');
  };

  const handleCancel = () => {
    localStorage.removeItem('pendingCosInviteCode');
    navigate('/dashboard');
  };

  return (
    <GridBackground inverted className="min-h-screen bg-gradient-to-br from-[#F5F3F0] via-white to-[#F8F6F2] overscroll-none">
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4 relative pr-20">
          <Logo variant="minimal" size="lg" />
          <UserProfileHeader />
        </div>
      </header>

      <div className="flex items-center justify-center min-h-[calc(100vh-80px)] px-4">
        {state.kind === "loading" && (
          <div className="text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">Checking invite…</div>
          </div>
        )}

        {state.kind === "invalid" && (
          <Card className="max-w-md w-full">
            <CardHeader className="text-center">
              <XCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <CardTitle>Invite not found</CardTitle>
              <CardDescription>This invite link is invalid or has already expired.</CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button onClick={() => navigate('/dashboard')}>Go to dashboard</Button>
            </CardContent>
          </Card>
        )}

        {state.kind === "error" && (
          <Card className="max-w-md w-full">
            <CardHeader className="text-center">
              <XCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
              <CardTitle>Can't accept this invite</CardTitle>
              <CardDescription>{state.message}</CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button onClick={() => navigate('/dashboard')}>Go to dashboard</Button>
            </CardContent>
          </Card>
        )}

        {(state.kind === "preview" || state.kind === "claiming") && (
          <Card className="max-w-md w-full">
            <CardHeader className="text-center">
              <Link2 className="h-8 w-8 text-primary mx-auto mb-2" />
              <CardTitle>
                Link your account to {state.kind === "preview" ? state.preview.inviter_name : ""}'s team?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-4 text-sm space-y-2">
                <p className="font-medium">Once linked, {state.kind === "preview" ? state.preview.inviter_name : ""} will be able to:</p>
                <ul className="space-y-1.5 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0 text-emerald-600" />
                    Send items directly to your TacticalSync inbox
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0 text-emerald-600" />
                    See the status of items they've sent you (not your other inbox items)
                  </li>
                </ul>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                You can unlink at any time from Settings → Connections.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={handleCancel} disabled={state.kind === "claiming"}>
                  Cancel
                </Button>
                <Button className="flex-1 gap-1.5" onClick={handleLinkAccount} disabled={state.kind === "claiming"}>
                  {state.kind === "claiming" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Link my account
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </GridBackground>
  );
};

export default ClaimTeamMemberInvite;
