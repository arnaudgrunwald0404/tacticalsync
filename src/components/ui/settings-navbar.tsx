import React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";

interface SettingsNavbarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  userEmail?: string;
  showAdminManagement?: boolean;
}

const USER_MGMT_SUB_ITEMS = [
  { id: "user-management-users", label: "Users" },
  { id: "user-management-domains", label: "Domains" },
  { id: "user-management-permissions", label: "Permissions" },
];

const SettingsNavbar: React.FC<SettingsNavbarProps> = ({ activeSection, onSectionChange, userEmail, showAdminManagement }) => {
  const isTestUser = userEmail === "agrunwald@clearcompany.com";
  const isUserMgmtActive = activeSection.startsWith("user-management");

  return (
    <nav className="w-64 border-r border-cc bg-platinum min-h-[calc(100vh-73px)]">
      <div className="p-4 space-y-1">

        {showAdminManagement && (
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSectionChange("user-management-users")}
              className={cn(
                "font-body w-full justify-between",
                isUserMgmtActive
                  ? "bg-copper/10 text-copper font-medium"
                  : "text-[#4A5D5F] hover:bg-platinum hover:text-cast-iron"
              )}
            >
              <span>User Management</span>
              {isUserMgmtActive ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </Button>
            {isUserMgmtActive && (
              <div className="ml-3 mt-0.5 space-y-0.5 border-l border-cc pl-3">
                {USER_MGMT_SUB_ITEMS.map((item) => (
                  <Button
                    key={item.id}
                    variant="ghost"
                    size="sm"
                    onClick={() => onSectionChange(item.id)}
                    className={cn(
                      "font-body w-full justify-start text-sm",
                      activeSection === item.id
                        ? "bg-copper text-white hover:bg-copper-hover font-medium"
                        : "text-[#4A5D5F] hover:bg-[#E8EDEC] hover:text-cast-iron"
                    )}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSectionChange("agenda-templates")}
          className={cn(
            "font-body w-full justify-start",
            activeSection === "agenda-templates"
              ? "bg-copper text-white hover:bg-copper-hover font-medium"
              : "text-[#4A5D5F] hover:bg-platinum hover:text-cast-iron"
          )}
        >
          Agenda Templates
        </Button>

        {isTestUser && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSectionChange("testing-mode")}
            className={cn(
              "font-body w-full justify-start",
              activeSection === "testing-mode"
                ? "bg-copper text-white hover:bg-copper-hover font-medium"
                : "text-[#4A5D5F] hover:bg-platinum hover:text-cast-iron"
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
