import React from "react";

interface GridBackgroundProps {
  children: React.ReactNode;
  className?: string;
  inverted?: boolean;
}

const GridBackground: React.FC<GridBackgroundProps> = ({ children, className = "" }) => {
  return (
    <div
      className={`relative ${className}`}
      style={{
        backgroundImage: `radial-gradient(circle, #4A5D5F18 1px, transparent 1px)`,
        backgroundSize: "24px 24px",
      }}
    >
      {children}
    </div>
  );
};

export default GridBackground;
