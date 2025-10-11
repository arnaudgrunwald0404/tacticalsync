import React from "react";

interface GridBackgroundProps {
  children: React.ReactNode;
  className?: string;
  inverted?: boolean;
}

const GridBackground: React.FC<GridBackgroundProps> = ({ children, className = "", inverted = false }) => {
  const maskImage = inverted 
    ? "[mask-image:radial-gradient(ellipse_60%_50%_at_50%_100%,#000_70%,transparent_110%)]"
    : "[mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_110%)]";

  return (
    <div className={`relative ${className}`}>
      {/* Grid Background */}
      <div className={`absolute inset-0 bg-[linear-gradient(to_right,#80808030_1px,transparent_1px),linear-gradient(to_bottom,#80808030_1px,transparent_1px)] bg-[size:24px_24px] ${maskImage}`} />
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};

export default GridBackground;
