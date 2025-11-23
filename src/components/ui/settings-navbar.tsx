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
    <nav className="w-64 border-r border-[#E8B4A0]/30 bg-[#F5F3F0] min-h-[calc(100vh-73px)]">
      <div className="p-4 space-y-1">
        {sections.map((section) => (
          <Button
            key={section.id}
            variant={activeSection === section.id ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onSectionChange(section.id)}
            className={cn(
              "font-body w-full justify-start",
              activeSection === section.id 
                ? "bg-[#4A5D5F] text-white hover:bg-[#5B6E7A] font-medium" 
                : "text-[#4A5D5F] hover:bg-[#F5F3F0] hover:text-[#2C2C2C]"
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
