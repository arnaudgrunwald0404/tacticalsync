import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import FancyAvatar from "@/components/ui/fancy-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Settings, User } from "lucide-react";
import { useRoles } from "@/hooks/useRoles";
import { getFullNameForAvatar } from "@/lib/nameUtils";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export function UserProfileHeader() {
  const navigate = useNavigate();
  const { isAdmin, isSuperAdmin } = useRoles();
  const isMobile = useIsMobile();
  const [profile, setProfile] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("first_name, last_name, full_name, avatar_name, avatar_url, email")
          .eq("id", user.id)
          .maybeSingle();
        if (profileData) {
          setProfile(profileData);
        }
      }
    } finally {
      setProfileLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div className="absolute right-4 top-1/2 -translate-y-1/2 z-30 flex items-center">
      {profileLoading ? (
        <div className="flex items-center gap-3">
          <Skeleton className="h-7 w-7 rounded-full" />
          <Skeleton className="h-4 w-24 hidden md:block" />
        </div>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div className={cn(
              "flex items-center cursor-pointer rounded-md hover:bg-[#F5F3F0] hover:text-[#2C2C2C] ring-1 ring-[#C97D60]/10 ring-offset-2 ring-offset-white shadow-sm hover:shadow-md transition-colors transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C97D60]",
              isMobile ? "px-2 py-2" : "px-3 py-2 gap-3"
            )} aria-label="Open account menu" role="button">
              <FancyAvatar 
                name={(profile?.avatar_name && profile.avatar_name.trim()) || profile?.email || 'User'}
                displayName={getFullNameForAvatar(profile?.first_name, profile?.last_name, profile?.email)}
                avatarUrl={profile?.avatar_url}
                size="sm"
                className="flex-shrink-0"
              />
              <div className="hidden md:flex flex-col items-start min-w-0 overflow-hidden">
                <span className="font-body text-sm leading-none truncate max-w-full text-[#2C2C2C]">
                  {`${profile?.first_name || profile?.email || ''} ${profile?.last_name || ''}`.trim()}
                </span>
              </div>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => navigate("/profile")}>
              <User className="h-4 w-4 mr-2" />
              Profile
            </DropdownMenuItem>
            {(isAdmin || isSuperAdmin) && (
              <DropdownMenuItem onClick={() => navigate("/settings")}>
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}


