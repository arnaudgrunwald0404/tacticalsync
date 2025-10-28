import { Button } from "@/components/ui/button";
import { IconPencil } from "@tabler/icons-react";

interface EditButtonProps {
  onClick: () => void;
  className?: string;
  disabled?: boolean;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
}

export function EditButton({ onClick, className, disabled, size = "sm", variant = "ghost" }: EditButtonProps) {
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={onClick}
      aria-label="Edit"
      disabled={disabled}
    >
      <IconPencil aria-hidden="true" size={16} />
    </Button>
  );
}

export default EditButton;


