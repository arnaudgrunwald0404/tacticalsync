import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Link2, Loader2, Mail, Unlink, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useCosTeamMemberLinking, type OutgoingTeamMember, type IncomingLinkedMember } from '@/hooks/useCosTeamMemberLinking';

// Self-contained like CosZoomSyncPanel — Settings.tsx renders this without
// threading a userId prop, so it resolves the current user itself.
export default function ConnectionsPanel() {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const { loading, yourTeam, linkedToYou, sendInvite, resendInvite, unlink } = useCosTeamMemberLinking(userId);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  const handleSendInvite = async (member: OutgoingTeamMember, isResend: boolean) => {
    if (!member.email) {
      toast({
        title: 'No email on file',
        description: `Add an email address for ${member.name} before sending an invite.`,
        variant: 'destructive',
      });
      return;
    }
    setPendingActionId(member.id);
    const action = isResend ? resendInvite : sendInvite;
    const result = await action(member.id, member.email);
    setPendingActionId(null);
    if (result.success) {
      toast({
        title: isResend ? 'Invite resent' : 'Invite sent',
        description: `${member.name} will get an email to connect their account.`,
      });
    } else {
      toast({ title: 'Could not send invite', description: result.error, variant: 'destructive' });
    }
  };

  const handleUnlink = async (teamMemberId: string, name: string) => {
    setPendingActionId(teamMemberId);
    const result = await unlink(teamMemberId);
    setPendingActionId(null);
    if (result.success) {
      toast({ title: 'Unlinked', description: `${name} is no longer connected.` });
    } else {
      toast({ title: 'Could not unlink', description: result.error, variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading connections…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" /> Your team
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {yourTeam.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You haven't added any team members yet. Add people in your 1:1 list to invite them here.
            </p>
          ) : (
            yourTeam.map(member => (
              <div
                key={member.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{member.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{member.email ?? 'No email on file'}</p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {member.linked_user_id ? (
                    <>
                      <Badge className="bg-emerald-50 text-emerald-700 border-0 gap-1">
                        <Link2 className="h-3 w-3" /> Linked
                      </Badge>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive">
                            {pendingActionId === member.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
                            Unlink
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Unlink {member.name}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              You'll no longer be able to send items directly to {member.name}'s inbox. You can re-invite them later.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleUnlink(member.id, member.name)}>
                              Unlink
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  ) : member.pendingInvite ? (
                    <>
                      <Badge variant="outline" className="gap-1">
                        <Mail className="h-3 w-3" /> Invite sent {formatDistanceToNow(new Date(member.pendingInvite.created_at), { addSuffix: true })}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={pendingActionId === member.id}
                        onClick={() => handleSendInvite(member, true)}
                      >
                        {pendingActionId === member.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        Resend
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      className="gap-1.5"
                      disabled={pendingActionId === member.id || !member.email}
                      onClick={() => handleSendInvite(member, false)}
                    >
                      {pendingActionId === member.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                      Send invite
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4" /> People who can send you items
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {linkedToYou.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No one is connected to send items to your inbox yet.
            </p>
          ) : (
            linkedToYou.map((member: IncomingLinkedMember) => (
              <div
                key={member.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{member.name}</p>
                  {member.linked_at && (
                    <p className="text-xs text-muted-foreground">
                      Connected {formatDistanceToNow(new Date(member.linked_at), { addSuffix: true })}
                    </p>
                  )}
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive">
                      {pendingActionId === member.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
                      Unlink
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Unlink from {member.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        They'll no longer be able to send items to your inbox directly.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleUnlink(member.id, member.name)}>
                        Unlink
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
