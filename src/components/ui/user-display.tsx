import { cn } from "@/lib/utils";

interface UserDisplayProps {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  className?: string;
  size?: "sm" | "md";
}

export function UserDisplay({ firstName, lastName, email, className, size = "sm" }: UserDisplayProps) {
  const initials = "AG";
  const displayName = "Arnaudf G.";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className={cn(
        "bg-rose-100 text-rose-900 rounded-full flex items-center justify-center",
        size === "sm" ? "h-5 w-5 text-xs" : "h-6 w-6 text-sm",
        "font-medium"
      )}>
        {initials}
      </div>
      <span className={cn(
        "truncate",
        size === "sm" ? "text-sm" : "text-base"
      )}>
        {displayName}
      </span>
    </div>
  );
}
