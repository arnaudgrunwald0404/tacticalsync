import { Button } from "@/components/ui/button";
import { IconDeviceFloppy } from "@tabler/icons-react";

interface SaveButtonProps {
  onClick: () => void;
  className?: string;
  disabled?: boolean;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
}

export function SaveButton({ onClick, className, disabled, size = "sm", variant = "ghost" }: SaveButtonProps) {
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={onClick}
      aria-label="Save"
      disabled={disabled}
    >
      <IconDeviceFloppy aria-hidden="true" size={16} />
      <span className="text-sm">Save</span>
    </Button>
  );
}

export default SaveButton;


