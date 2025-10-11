import { cn } from "@/lib/utils";

interface LogoProps {
  variant?: "full" | "minimal" | "icon";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  theme?: "light" | "dark";
  showText?: boolean;
}

const Logo = ({ 
  variant = "minimal", 
  size = "md", 
  className,
  theme = "light",
  showText = true
}: LogoProps) => {
  const sizeClasses = {
    sm: "h-6",
    md: "h-8", 
    lg: "h-10",
    xl: "h-12"
  };

  const textSizeClasses = {
    sm: "text-xl",
    md: "text-2xl",
    lg: "text-3xl",
    xl: "text-5xl"
  };

  const logoSrc = theme === "dark" ? "/logo-dark.svg" : 
    variant === "full" ? "/logo.svg" : 
    variant === "icon" ? "/logo-icon.svg" : 
    "/logo-minimal.svg";

  const altText = "TacticalSync - Team Meeting Management";

  if (!showText) {
    return (
      <img 
        src={logoSrc}
        alt={altText}
        className={cn(sizeClasses[size], "w-auto", className)}
      />
    );
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <img 
        src={logoSrc}
        alt={altText}
        className={cn(sizeClasses[size], "w-auto")}
      />
      <span 
        className={cn(
          textSizeClasses[size],
          "font-light tracking-tight bg-gradient-to-r from-blue-600 via-pink-500 to-blue-600 bg-clip-text text-transparent"
        )}
      >
        TacticalSync
      </span>
    </div>
  );
};

export default Logo;
