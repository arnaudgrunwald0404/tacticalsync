import React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SettingsNavbarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  userEmail?: string;
  showAdminManagement?: boolean;
  canManagePermissions?: boolean;
}

const NAV_ITEMS = [
  { id: "user-management-users",       label: "Users",             group: "User Management" },
  { id: "user-management-domains",     label: "Domains",           group: "User Management" },
  { id: "user-management-permissions", label: "Permissions",       group: "User Management" },
  { id: "strategy-cycles",              label: "Strategy Cycles",   group: "RCDO" },
  { id: "configure-my-lists",          label: "Configure My Lists", group: "Chief of Staff" },
  { id: "agenda-templates",            label: "Agenda Templates",  group: null },
];

const SettingsNavbar: React.FC<SettingsNavbarProps> = ({ activeSection, onSectionChange, userEmail, showAdminManagement, canManagePermissions }) => {
  const isTestUser = userEmail === "agrunwald@clearcompany.com";

  const visibleItems = NAV_ITEMS.filter(item => {
    if (item.group === "User Management" && !showAdminManagement) return false;
    if (item.id === "user-management-permissions" && !canManagePermissions) return false;
    return true;
  });

  let lastGroup: string | null | undefined = undefined;

  return (
    <nav className="w-full lg:w-64 lg:border-r border-b lg:border-b-0 border-cc bg-platinum lg:min-h-[calc(100vh-73px)]">
      <div className="p-3 lg:p-4 flex lg:block gap-1 lg:gap-0 space-y-0 lg:space-y-0.5 overflow-x-auto lg:overflow-x-visible">
        {visibleItems.map(item => {
          const showGroupLabel = item.group !== null && item.group !== lastGroup;
          lastGroup = item.group;
          return (
            <React.Fragment key={item.id}>
              {showGroupLabel && (
                <p className="hidden lg:block px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                  {item.group}
                </p>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSectionChange(item.id)}
                className={cn(
                  "font-body justify-start flex-shrink-0 lg:w-full whitespace-nowrap",
                  item.group && "lg:pl-5 lg:text-sm",
                  activeSection === item.id
                    ? "bg-copper text-white hover:bg-copper-hover font-medium"
                    : "text-[#4A5D5F] hover:bg-[#E8EDEC] hover:text-cast-iron"
                )}
              >
                {item.label}
              </Button>
            </React.Fragment>
          );
        })}

        {isTestUser && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSectionChange("testing-mode")}
            className={cn(
              "font-body justify-start flex-shrink-0 lg:w-full whitespace-nowrap",
              activeSection === "testing-mode"
                ? "bg-copper text-white hover:bg-copper-hover font-medium"
                : "text-[#4A5D5F] hover:bg-[#E8EDEC] hover:text-cast-iron"
            )}
          >
            🧪 Testing Mode
          </Button>
        )}
      </div>
    </nav>
  );
};

export default SettingsNavbar;
