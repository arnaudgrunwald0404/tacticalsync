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
    lg: "h-8 sm:h-10",
    xl: "h-10 sm:h-12"
  };

  const textSizeClasses = {
    sm: "text-lg sm:text-xl",
    md: "text-xl sm:text-2xl",
    lg: "text-2xl sm:text-3xl",
    xl: "text-3xl sm:text-5xl"
  };

  const logoSrc = "/logo-icon.png";

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
    <div className={cn("flex items-center gap-2 sm:gap-3", className)}>
      <img 
        src={logoSrc}
        alt={altText}
        className={cn(sizeClasses[size], "w-auto")}
      />
      <span
        className={cn(textSizeClasses[size], "tracking-tight text-[#4A5D5F] font-heading")}
      >
        <span className="font-bold uppercase">Tactical</span><span className="font-normal uppercase">Sync</span>
      </span>
    </div>
  );
};

export default Logo;
