import React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SettingsNavbarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  userEmail?: string;
  showAdminManagement?: boolean;
}

const SettingsNavbar: React.FC<SettingsNavbarProps> = ({ activeSection, onSectionChange, userEmail, showAdminManagement }) => {
  const isTestUser = userEmail === "agrunwald@clearcompany.com";
  
  // Reordered: User Management first, then Agenda Templates, then Testing Mode last
  const sections = [
    ...(showAdminManagement ? [{ id: "user-management", label: "User Management" }] : []),
    { id: "agenda-templates", label: "Agenda Templates" },
    ...(isTestUser ? [{ id: "testing-mode", label: "🧪 Testing Mode" }] : []),
  ];

  return (
    <nav className="w-64 border-r bg-card/50 backdrop-blur-sm min-h-[calc(100vh-73px)]">
      <div className="p-4 space-y-1">
        {sections.map((section) => (
          <Button
            key={section.id}
            variant={activeSection === section.id ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onSectionChange(section.id)}
            className={cn(
              "w-full justify-start",
              activeSection === section.id && "bg-secondary font-medium"
            )}
          >
            {section.label}
          </Button>
        ))}
      </div>
    </nav>
  );
};

export default SettingsNavbar;
