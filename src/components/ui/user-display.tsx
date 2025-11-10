import { cn } from "@/lib/utils";
import { Profile } from "@/types/common";

interface UserDisplayProps {
  user?: Profile | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  className?: string;
  size?: "sm" | "md";
}

export function UserDisplay({ user, firstName, lastName, email, className, size = "sm" }: UserDisplayProps) {
  // Use user prop if provided, otherwise fall back to individual props
  const finalFirstName = user?.first_name || firstName;
  const finalLastName = user?.last_name || lastName;
  const finalEmail = user?.email || email;
  // Generate initials from firstName and lastName, fallback to email
  const getInitials = () => {
    if (finalFirstName && finalLastName) {
      return `${finalFirstName[0]}${finalLastName[0]}`.toUpperCase();
    }
    if (finalFirstName) {
      return finalFirstName[0].toUpperCase();
    }
    if (finalEmail) {
      return finalEmail[0].toUpperCase();
    }
    return "?";
  };

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

  const initials = getInitials();
  const displayName = getDisplayName();

  return (
    <div className={cn("flex items-center gap-2 min-w-0", className)}>
      <div className={cn(
        "bg-rose-100 text-rose-900 rounded-full flex items-center justify-center flex-shrink-0",
        size === "sm" ? "h-5 w-5 text-xs" : "h-6 w-6 text-sm",
        "font-medium"
      )}>
        {initials}
      </div>
      <span className={cn(
        "truncate min-w-0",
        size === "sm" ? "text-sm" : "text-base"
      )}>
        {displayName}
      </span>
    </div>
  );
}
