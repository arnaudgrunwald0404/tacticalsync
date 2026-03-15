import { useNavigate, useLocation } from "react-router-dom";
import { Target, Calendar, Briefcase, CheckSquare, ClipboardList, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRoles } from "@/hooks/useRoles";

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  {
    id: "strategy",
    label: "Strategy",
    icon: Target,
    path: "/dashboard/rcdo",
  },
  {
    id: "meetings",
    label: "My Meetings",
    icon: Calendar,
    path: "/my-meetings",
  },
  {
    id: "workspace",
    label: "My workspace",
    icon: Briefcase,
    path: "/workspace",
  },
  {
    id: "tasks",
    label: "My tasks",
    icon: CheckSquare,
    path: "/dashboard/rcdo/tasks-feed",
  },
  {
    id: "commitments",
    label: "Commitments",
    icon: ClipboardList,
    path: "/commitments",
  },
  {
    id: "insights",
    label: "Insights",
    icon: BarChart3,
    path: "/insights",
    adminOnly: true,
  },
];

export function MobileBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, isSuperAdmin } = useRoles();
  const showAdmin = isAdmin || isSuperAdmin;

  const visibleItems = navItems.filter(item => !item.adminOnly || showAdmin);

  const getActiveTab = (): string => {
    const path = location.pathname;
    if (path.includes("/insights")) return "insights";
    if (path.includes("/dashboard/rcdo/tasks-feed")) return "tasks";
    if (path.includes("/dashboard/rcdo")) return "strategy";
    if (path.includes("/workspace")) return "workspace";
    if (path.includes("/commitments")) return "commitments";
    if (path.includes("/my-meetings")) return "meetings";
    return "commitments"; // default
  };

  const activeTab = getActiveTab();

  const handleNavClick = (item: NavItem) => {
    navigate(item.path);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-border safe-area-bottom">
      <div className={cn("grid h-16", showAdmin ? "grid-cols-6" : "grid-cols-5")}>
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 transition-colors",
                "active:bg-muted/50",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-label={item.label}
            >
              <Icon
                className={cn(
                  "h-5 w-5 transition-all",
                  isActive && "scale-110"
                )}
              />
              <span
                className={cn(
                  "text-[10px] font-medium leading-tight",
                  isActive && "font-semibold"
                )}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

