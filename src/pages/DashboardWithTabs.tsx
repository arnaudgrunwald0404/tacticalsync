import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import GridBackground from "@/components/ui/grid-background";
import Logo from "@/components/Logo";
import FancyAvatar from "@/components/ui/fancy-avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Settings, User, ArrowLeft } from "lucide-react";
import { useRoles } from "@/hooks/useRoles";
import { useEffect, useState } from "react";
import DashboardMain from "./DashboardMain";
import StrategyHome from "./StrategyHome";

const DashboardWithTabs = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, isSuperAdmin } = useRoles();
  const [profile, setProfile] = useState<any>(null);

  // Determine active tab from URL
  const activeTab = location.pathname.includes('/dashboard/rcdo') ? 'rcdo' : 'main';

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
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
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleTabChange = (value: string) => {
    if (value === 'main') {
      navigate('/dashboard/main');
    } else if (value === 'rcdo') {
      navigate('/dashboard/rcdo');
    }
  };

  return (
    <GridBackground inverted className="min-h-screen bg-blue-50 overscroll-none">
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-3 sm:py-4 flex items-center justify-between relative pr-20">
          {/* Left: Back button and Logo */}
          <div className="flex items-center gap-4">
            {/* Back button (only show when not on main meetings) */}
            {activeTab !== 'main' && (
              <button
                onClick={() => navigate('/dashboard/main')}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            )}
            
            <Logo variant="minimal" size="lg" className="scale-75 sm:scale-100" />
          </div>
          
          {/* Center: Tabs */}
          <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <TabsList className="h-10">
                <TabsTrigger value="main" className="px-6">Meetings</TabsTrigger>
                <TabsTrigger value="rcdo" className="px-6">RCDO</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          
          {/* Right: Avatar positioned absolutely to avoid clipping */}
          <div className="absolute right-4 top-1/2 -translate-y-1/2 z-30 flex items-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div className="flex items-center gap-3 cursor-pointer rounded-md px-3 py-2 hover:bg-accent hover:text-accent-foreground ring-1 ring-sky-300/70 ring-offset-2 ring-offset-white shadow-sm hover:shadow-md transition-colors transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400" aria-label="Open account menu" role="button">
                  <FancyAvatar 
                    name={(profile?.avatar_name && profile.avatar_name.trim())
                      || `${(profile?.first_name || '')} ${(profile?.last_name || '')}`.trim()
                      || (profile?.full_name || '')
                      || (profile?.email || 'User')}
                    displayName={`${(profile?.first_name || '')} ${(profile?.last_name || '')}`.trim() || (profile?.email?.split('@')[0] || 'U')}
                    size="sm"
                    className="flex-shrink-0"
                  />
                  <div className="flex flex-col items-start min-w-0 overflow-hidden">
                    <span className="text-sm leading-none truncate max-w-full">
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
          </div>
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsContent value="main" className="mt-0">
          <DashboardMain />
        </TabsContent>
        
        <TabsContent value="rcdo" className="mt-0">
          <StrategyHome />
        </TabsContent>
      </Tabs>
    </GridBackground>
  );
};

export default DashboardWithTabs;

