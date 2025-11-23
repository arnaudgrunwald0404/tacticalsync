import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PresenceUser } from '@/hooks/usePresence';
import { useIsMobile } from '@/hooks/use-mobile';
import { Users } from 'lucide-react';
import FancyAvatar from '@/components/ui/fancy-avatar';
import { getFullNameForAvatar } from '@/lib/nameUtils';

interface TeamMember {
  id: string;
  user_id: string;
  profiles: {
    first_name?: string;
    last_name?: string;
    full_name?: string;
    email?: string;
    avatar_url?: string;
    avatar_name?: string;
  } | null;
}

interface PresenceIndicatorProps {
  users: PresenceUser[];
  maxDisplay?: number;
  teamMembers?: TeamMember[];
}

/**
 * Component to display who's currently online viewing the same content
 * Shows avatars with names on hover (desktop) or clickable link (mobile)
 */
export function PresenceIndicator({ users, maxDisplay = 5, teamMembers = [] }: PresenceIndicatorProps) {
  const isMobile = useIsMobile();
  const [showMembersDialog, setShowMembersDialog] = useState(false);

  if (users.length === 0) {
    return null;
  }

  const displayUsers = users.slice(0, maxDisplay);
  const remainingCount = users.length - maxDisplay;

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Mobile: Show clickable link with count
  if (isMobile) {
    return (
      <>
        <button
          onClick={() => setShowMembersDialog(true)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Users className="h-4 w-4 text-green-600" />
          <span className="underline">{users.length} active</span>
        </button>

        <Dialog open={showMembersDialog} onOpenChange={setShowMembersDialog}>
          <DialogContent className="max-w-sm max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Team Members</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-4">
              {teamMembers.length > 0 ? (
                teamMembers.map((member) => {
                  if (!member.profiles) return null;
                  
                  const fullName = getFullNameForAvatar(
                    member.profiles.first_name,
                    member.profiles.last_name,
                    member.profiles.email
                  );
                  const displayName = member.profiles.full_name || 
                    (member.profiles.first_name && member.profiles.last_name
                      ? `${member.profiles.first_name} ${member.profiles.last_name}`
                      : member.profiles.first_name || 
                        member.profiles.email?.split('@')[0] || 
                        'Unknown User');
                  
                  const avatarName = member.profiles.avatar_name || 
                    member.profiles.email || 
                    fullName || 
                    'Unknown';

                  return (
                    <div key={member.id} className="flex items-center gap-3">
                      <FancyAvatar
                        name={avatarName}
                        displayName={fullName}
                        avatarUrl={member.profiles.avatar_url}
                        size="sm"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-foreground truncate">
                          {displayName}
                        </div>
                        {member.profiles.email && (
                          <div className="text-xs text-muted-foreground truncate">
                            {member.profiles.email}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground">No team members found</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Desktop: Show avatars with tooltips
  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        <div className="flex items-center">
          <Users className="h-4 w-4 text-green-600 mr-2" />
          <span className="text-sm text-muted-foreground">
            {users.length} online
          </span>
        </div>
        
        <div className="flex -space-x-2">
          {displayUsers.map((user) => (
            <Tooltip key={user.userId}>
              <TooltipTrigger asChild>
                <div className="relative">
                  <Avatar className="h-8 w-8 border-2 border-background">
                    <AvatarImage src={user.avatarUrl} alt={user.userName} />
                    <AvatarFallback className="text-xs">
                      {getInitials(user.userName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 bg-green-500 border-2 border-background rounded-full" />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-sm">
                  <p className="font-medium">{user.userName}</p>
                  {user.userEmail && (
                    <p className="text-muted-foreground text-xs">{user.userEmail}</p>
                  )}
                  {user.viewingSection && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Viewing: {user.viewingSection}
                    </p>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          ))}
          
          {remainingCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative h-8 w-8 rounded-full bg-muted border-2 border-background flex items-center justify-center">
                  <span className="text-xs font-medium">+{remainingCount}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-sm max-w-xs">
                  <p className="font-medium mb-1">Also viewing:</p>
                  {users.slice(maxDisplay).map((user) => (
                    <p key={user.userId} className="text-xs">
                      {user.userName}
                    </p>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

