import React from "react";
import { motion } from "framer-motion";

interface MovingBorderProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  borderRadius?: string;
  className?: string;
  as?: React.ElementType;
  containerClassName?: string;
  borderClassName?: string;
  duration?: number;
}

const MovingBorder: React.FC<MovingBorderProps> = ({
  children,
  borderRadius = "1.75rem",
  className = "",
  as: Component = "button",
  containerClassName = "",
  borderClassName = "",
  duration = 2000,
  ...props
}) => {
  return (
    <div
      style={{
        borderRadius: borderRadius,
      }}
      className={`relative p-[1px] bg-slate-800 ${containerClassName}`}
    >
      <motion.div
        className={`absolute inset-0 ${borderClassName}`}
        style={{
          borderRadius: borderRadius,
          padding: "1px",
        }}
        animate={{
          background: [
            "linear-gradient(0deg, transparent, #ff0080, transparent)",
            "linear-gradient(90deg, transparent, #ff0080, transparent)",
            "linear-gradient(180deg, transparent, #ff0080, transparent)",
            "linear-gradient(270deg, transparent, #ff0080, transparent)",
            "linear-gradient(360deg, transparent, #ff0080, transparent)",
          ],
        }}
        transition={{
          duration: duration / 1000,
          repeat: Infinity,
          ease: "linear",
        }}
      />
      <div
        className={`relative flex h-full w-full items-center justify-center ${className}`}
        style={{
          borderRadius: borderRadius,
        }}
      >
        <Component {...props}>{children}</Component>
      </div>
    </div>
  );
};

export default MovingBorder;
