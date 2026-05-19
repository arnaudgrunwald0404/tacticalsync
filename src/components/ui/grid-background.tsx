import React from "react";

interface GridBackgroundProps {
  children: React.ReactNode;
  className?: string;
  inverted?: boolean;
}

const GridBackground: React.FC<GridBackgroundProps> = ({ children, className = "" }) => {
  return (
    <div className={`relative ${className}`}>
      {children}
    </div>
  );
};

export default GridBackground;
