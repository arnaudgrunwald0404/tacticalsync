import { useLocation, useNavigate } from "react-router-dom";
import Logo from "@/components/Logo";
import { UserProfileHeader } from "@/components/ui/user-profile-header";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { useFeaturePermissions } from "@/hooks/useFeaturePermissions";
import { cn } from "@/lib/utils";

export function AppNavbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { canAccess, loading } = useFeaturePermissions();

  // Derive active tab from current URL
  const activeTab =
    location.pathname.includes("/settings")
      ? "settings"
      : location.pathname.includes("/insights")
      ? "insights"
      : location.pathname.includes("/chief-of-staff")
      ? "cos"
      : location.pathname.includes("/rcdo") // covers /rcdo/canvas and /dashboard/rcdo
      ? "rcdo"
      : location.pathname.includes("/commitments")
      ? "commitments"
      : location.pathname.includes("/my-meetings")
      ? "main"
      : "main";

  const handleTabChange = (value: string) => {
    if (value === "main") navigate("/my-meetings");
    else if (value === "rcdo") navigate("/dashboard/rcdo");
    else if (value === "commitments") navigate("/commitments");
    else if (value === "insights") navigate("/insights");
    else if (value === "cos") navigate("/chief-of-staff");
    else if (value === "settings") navigate("/settings");
  };

  return (
    <header className="sticky top-0 z-50 border-b bg-white">
      <div className="container mx-auto px-4 py-3 sm:py-4 relative">
        {/* Reserve right-side space for the absolutely-positioned avatar */}
        <div className="flex items-center gap-4 pr-14 md:pr-[200px]">
          {/* Logo — fixed, never shrinks */}
          <Logo variant="minimal" size="lg" className="flex-shrink-0" />

          {/* Nav items — centered, hidden on mobile */}
          {!isMobile && (
            <div className="flex-1 flex justify-center min-w-0 overflow-hidden">
              <nav className="flex items-center gap-1">
                {[
                  ...(canAccess("view_chief_of_staff") ? [{ value: "cos", label: "Chief of Staff", subtitle: "Day – Week" }] : []),
                  ...(canAccess("view_commitments") ? [{ value: "commitments", label: "Commitments", subtitle: "Month – Quarter" }] : []),
                  ...(canAccess("view_rcdo") ? [{ value: "rcdo", label: "RCDO", title: "Rallying Cry & Defining Objectives", subtitle: "Six months" }] : []),
                  ...(canAccess("view_meetings") ? [{ value: "main", label: "Meetings" }] : []),
                  ...(canAccess("view_insights") ? [{ value: "insights", label: "Insights" }] : []),
                  ...(canAccess("view_settings") ? [{ value: "settings", label: "Settings" }] : []),
                ].map(({ value, label, title, subtitle }) => {
                  const btn = (
                    <button
                      key={value}
                      onClick={() => handleTabChange(value)}
                      className={cn(
                        "relative px-3 sm:px-4 py-2 text-sm whitespace-nowrap transition-colors",
                        "after:absolute after:bottom-0 after:left-3 after:right-3 after:h-0.5 after:rounded-full after:transition-all",
                        activeTab === value
                          ? "text-foreground font-medium after:bg-foreground"
                          : "text-muted-foreground hover:text-foreground after:bg-transparent"
                      )}
                    >
                      {label}
                      {subtitle && (
                        <span className="block text-[10px] font-normal text-muted-foreground leading-tight">{subtitle}</span>
                      )}
                    </button>
                  );
                  if (!title) return btn;
                  return (
                    <Tooltip key={value}>
                      <TooltipTrigger asChild>{btn}</TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[220px] text-center">
                        <p className="font-medium">{title}</p>
                        <p className="text-xs text-muted-foreground">Your team's strategic framework for the half-year cycle</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </nav>
            </div>
          )}
        </div>

        {/* Avatar — UserProfileHeader handles its own absolute positioning */}
        <UserProfileHeader />
      </div>

    </header>
  );
}
