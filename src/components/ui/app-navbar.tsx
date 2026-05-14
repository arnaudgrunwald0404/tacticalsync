import { useLocation, useNavigate } from "react-router-dom";
import Logo from "@/components/Logo";
import { UserProfileHeader } from "@/components/ui/user-profile-header";
import { useRoles } from "@/hooks/useRoles";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/**
 * Shared top navigation bar used across all main app sections
 * (DashboardWithTabs, StrategyCanvas, etc.).
 */
export function AppNavbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { isAdmin, isSuperAdmin } = useRoles();
  const showInsights = isAdmin || isSuperAdmin;

  // Derive active tab from current URL
  const activeTab =
    location.pathname.includes("/insights")
      ? "insights"
      : location.pathname.includes("/chief-of-staff")
      ? "cos"
      : location.pathname.includes("/rcdo") // covers /rcdo/canvas and /dashboard/rcdo
      ? "rcdo"
      : location.pathname.includes("/workspace")
      ? "checkins"
      : location.pathname.includes("/commitments")
      ? "commitments"
      : location.pathname.includes("/my-meetings")
      ? "main"
      : "main";

  const handleTabChange = (value: string) => {
    if (value === "main") navigate("/my-meetings");
    else if (value === "rcdo") navigate("/dashboard/rcdo");
    else if (value === "checkins") navigate("/workspace");
    else if (value === "commitments") navigate("/commitments");
    else if (value === "insights") navigate("/insights");
    else if (value === "cos") navigate("/chief-of-staff");
  };

  return (
    <header className="sticky top-0 z-50 border-b bg-white">
      <div className="container mx-auto px-4 py-3 sm:py-4 relative">
        {/* Reserve right-side space for the absolutely-positioned avatar */}
        <div className="flex items-center gap-4 pr-[180px] md:pr-[200px]">
          {/* Logo — fixed, never shrinks */}
          <Logo variant="minimal" size="lg" className="scale-75 sm:scale-100 flex-shrink-0" />

          {/* Nav items — centered, hidden on mobile */}
          {!isMobile && (
            <div className="flex-1 flex justify-center min-w-0 overflow-hidden">
              <nav className="flex items-center gap-1">
                {[
                  { value: "cos",         label: "Chief of Staff" },
                  { value: "checkins",    label: "My Dashboard" },
                  { value: "rcdo",        label: "RCDO", title: "Rallying Cry & Defining Objectives" },
                  { value: "commitments", label: "Commitments" },
                  { value: "main",        label: "Meetings" },
                  ...(showInsights ? [{ value: "insights", label: "Insights" }] : []),
                ].map(({ value, label, title }) => (
                  <button
                    key={value}
                    title={title}
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
                  </button>
                ))}
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
