import { cn } from "@/lib/utils";
import { Profile } from "@/types/common";
import FancyAvatar from "@/components/ui/fancy-avatar";
import { getFullNameForAvatar } from "@/lib/nameUtils";
import { useIsMobile } from "@/hooks/use-mobile";

interface UserDisplayProps {
  user?: Profile | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  className?: string;
  size?: "sm" | "md";
}

export function UserDisplay({ user, firstName, lastName, email, className, size = "sm" }: UserDisplayProps) {
  const isMobile = useIsMobile();
  
  // Use user prop if provided, otherwise fall back to individual props
  const finalFirstName = user?.first_name || firstName;
  const finalLastName = user?.last_name || lastName;
  const finalEmail = user?.email || email;
  const avatarUrl = user?.avatar_url || null;
  const avatarName = user?.avatar_name || null;

  // Generate display name from available data
  const getDisplayName = () => {
    if (finalFirstName && finalLastName) {
      return `${finalFirstName} ${finalLastName[0]}.`;
    }
    if (finalFirstName) {
      return finalFirstName;
    }
    if (finalEmail) {
      return finalEmail.split('@')[0];
    }
    return "Unknown User";
  };

  const displayName = getDisplayName();
  const fullName = getFullNameForAvatar(finalFirstName, finalLastName, finalEmail);
  const nameForAvatar = avatarName || fullName || displayName;

  return (
    <div className={cn("flex items-center min-w-0", isMobile ? "" : "gap-2", className)}>
      <FancyAvatar
        name={nameForAvatar}
        displayName={fullName}
        avatarUrl={avatarUrl}
        size={size === "sm" ? "sm" : "md"}
      />
      <span className={cn(
        "truncate min-w-0",
        size === "sm" ? "text-sm" : "text-base",
        isMobile ? "hidden" : ""
      )}>
        {displayName}
      </span>
    </div>
  );
}
