import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import Logo from "@/components/Logo";
import { UserProfileHeader } from "@/components/ui/user-profile-header";
import { useRoles } from "@/hooks/useRoles";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCycles } from "@/hooks/useRCDO";
import { parseLocalDate } from "@/lib/dateUtils";
import { format } from "date-fns";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared top navigation bar used across all main app sections
 * (DashboardWithTabs, StrategyCanvas, etc.).
 */
export function AppNavbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const { isAdmin, isSuperAdmin } = useRoles();
  const showInsights = isAdmin || isSuperAdmin;

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
      : location.pathname.includes("/workspace")
      ? "checkins"
      : location.pathname.includes("/commitments")
      ? "commitments"
      : location.pathname.includes("/my-meetings")
      ? "main"
      : "main";

  // Cycle selector state (only active on RCDO pages)
  const isRCDOPage = activeTab === "rcdo";
  const currentCycleId = searchParams.get("cycle") || "";
  const { cycles, loading: cyclesLoading } = useCycles();

  const handleCycleChange = (cycleId: string) => {
    if (!cycleId) return;
    // If on canvas, stay on canvas; otherwise navigate to canvas
    if (location.pathname.includes("/rcdo/canvas")) {
      navigate(`/rcdo/canvas?cycle=${cycleId}`);
    } else {
      navigate(`/rcdo/canvas?cycle=${cycleId}`);
    }
  };

  const handleTabChange = (value: string) => {
    if (value === "main") navigate("/my-meetings");
    else if (value === "rcdo") navigate("/dashboard/rcdo");
    else if (value === "checkins") navigate("/workspace");
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
                  { value: "cos",         label: "Chief of Staff" },
                  { value: "checkins",    label: "My Dashboard" },
                  { value: "rcdo",        label: "RCDO", title: "Rallying Cry & Defining Objectives" },
                  { value: "commitments", label: "Commitments" },
                  { value: "main",        label: "Meetings" },
                  ...(showInsights ? [{ value: "insights", label: "Insights" }] : []),
                  ...((isAdmin || isSuperAdmin) ? [{ value: "settings", label: "Settings" }] : []),
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

      {/* Secondary bar: cycle selector on RCDO pages */}
      {isRCDOPage && !isMobile && cycles.length > 0 && (
        <div className="container mx-auto px-4 py-1.5 flex items-center justify-end border-t border-border/50">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Cycle:</span>
            <div className="relative">
              <select
                value={currentCycleId}
                onChange={(e) => handleCycleChange(e.target.value)}
                disabled={cyclesLoading}
                className="appearance-none bg-transparent text-sm font-medium pr-6 pl-2 py-1 rounded-md border border-border/60 hover:border-border cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {!currentCycleId && (
                  <option value="" disabled>Select a cycle</option>
                )}
                {cycles.map((cycle) => (
                  <option key={cycle.id} value={cycle.id}>
                    {format(parseLocalDate(cycle.start_date), "MMM yyyy")} – {format(parseLocalDate(cycle.end_date), "MMM yyyy")}
                    {cycle.status === "active" ? " (Active)" : cycle.status === "draft" ? " (Draft)" : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
