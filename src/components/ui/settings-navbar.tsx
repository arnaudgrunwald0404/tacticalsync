import React from "react";
import { Button } from "@/components/ui/button";

interface SettingsNavbarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

const SettingsNavbar: React.FC<SettingsNavbarProps> = ({ activeSection, onSectionChange }) => {
  const sections = [
    { id: "agenda-templates", label: "Agenda Templates" },
    // Add more sections here as needed
  ];

  return (
    <div className="border-b bg-card/50 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-2">
        <nav className="flex space-x-1">
          {sections.map((section) => (
            <Button
              key={section.id}
              variant={activeSection === section.id ? "default" : "ghost"}
              size="sm"
              onClick={() => onSectionChange(section.id)}
              className="h-8 px-3"
            >
              {section.label}
            </Button>
          ))}
        </nav>
      </div>
    </div>
  );
};

export default SettingsNavbar;
