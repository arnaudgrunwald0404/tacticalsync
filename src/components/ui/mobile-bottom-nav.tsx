import { useNavigate, useLocation } from "react-router-dom";
import { Target, Calendar, Briefcase, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
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
    label: "Meetings",
    icon: Calendar,
    path: "/dashboard/main",
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
];

export function MobileBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const getActiveTab = (): string => {
    const path = location.pathname;
    if (path.includes("/dashboard/rcdo/tasks-feed")) return "tasks";
    if (path.includes("/dashboard/rcdo")) return "strategy";
    if (path.includes("/workspace")) return "workspace";
    if (path.includes("/dashboard/main")) return "meetings";
    return "meetings"; // default
  };

  const activeTab = getActiveTab();

  const handleNavClick = (item: NavItem) => {
    navigate(item.path);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-border safe-area-bottom">
      <div className="grid grid-cols-4 h-16">
        {navItems.map((item) => {
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

