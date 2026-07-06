import { useNavigate, useLocation } from "react-router-dom";
import { Target, Briefcase, CheckSquare, ClipboardList, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
}

const navItems: NavItem[] = [
  {
    id: "inbox",
    label: "Inbox",
    icon: Inbox,
    path: "/inbox",
  },
  {
    id: "cos",
    label: "Chief of Staff",
    icon: Briefcase,
    path: "/chief-of-staff",
  },
  {
    id: "commitments",
    label: "Commitments",
    icon: ClipboardList,
    path: "/commitments",
  },
  {
    id: "strategy",
    label: "Strategy",
    icon: Target,
    path: "/dashboard/rcdo",
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
    if (path.includes("/inbox")) return "inbox";
    if (path.includes("/chief-of-staff")) return "cos";
    if (path.includes("/dashboard/rcdo/tasks-feed")) return "tasks";
    if (path.includes("/dashboard/rcdo")) return "strategy";
    if (path.includes("/commitments")) return "commitments";
    return "commitments"; // default
  };

  const activeTab = getActiveTab();

  const handleNavClick = (item: NavItem) => {
    navigate(item.path);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-border safe-area-bottom">
      <div className="grid h-16 grid-cols-5">
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
