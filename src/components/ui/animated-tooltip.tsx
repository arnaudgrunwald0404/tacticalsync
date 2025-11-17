import React from "react";
import { motion } from "framer-motion";
import FancyAvatar from "./fancy-avatar";

interface TooltipItem {
  id: number;
  name: string;
  designation: string;
  image: string;
  avatarName?: string;
  displayName?: string;
}

interface AnimatedTooltipProps {
  items: TooltipItem[];
}

export const AnimatedTooltip = ({ items }: AnimatedTooltipProps) => {
  const [activeItem, setActiveItem] = React.useState<number | null>(null);

  return (
    <div className="flex flex-row items-center space-x-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="relative flex items-center justify-center"
          onMouseEnter={() => setActiveItem(item.id)}
          onMouseLeave={() => setActiveItem(null)}
        >
          <motion.div
            className="flex items-center justify-center"
            animate={{
              scale: activeItem === item.id ? 1.15 : 1,
            }}
            transition={{
              duration: 0.3,
              ease: "easeInOut",
            }}
          >
            <FancyAvatar 
              name={item.avatarName || item.name} 
              displayName={item.displayName}
              avatarUrl={!item.image || item.image === "/placeholder-avatar.png" ? null : item.image}
              size="sm" 
            />
          </motion.div>
          
          {activeItem === item.id && (
            <motion.div
              initial={{ opacity: 0, y: 5, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 5, scale: 0.8 }}
              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 bg-black text-white px-3 py-2 rounded-lg shadow-xl pointer-events-none z-50 whitespace-nowrap min-w-max"
              transition={{
                duration: 0.2,
                ease: "easeOut"
              }}
            >
              <div className="text-center">
                <p className="font-medium text-sm">{item.name}</p>
                <p className="text-xs text-gray-300">{item.designation}</p>
              </div>
              {/* Tooltip arrow */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-black rotate-45" />
            </motion.div>
          )}
        </div>
      ))}
    </div>
  );
};
