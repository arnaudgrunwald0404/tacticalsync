import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface LayoutTextFlipProps {
  text?: string;
  words: string[];
  duration?: number;
}

const LayoutTextFlip: React.FC<LayoutTextFlipProps> = ({
  text = "Build Amazing",
  words = ["Landing Pages", "Component Blocks", "Page Sections", "3D Shaders"],
  duration = 3000,
}) => {
  const [currentWordIndex, setCurrentWordIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentWordIndex((prev) => (prev + 1) % words.length);
    }, duration);

    return () => clearInterval(interval);
  }, [words.length, duration]);

  return (
    <div className="inline-block">
      {text && <span className="inline-block mr-2">{text}</span>}
      <div className="relative inline-block min-w-[200px] h-[1.2em] overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.span
            key={currentWordIndex}
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: "0%", opacity: 1 }}
            exit={{ y: "-100%", opacity: 0 }}
            transition={{
              duration: 0.5,
              ease: "easeInOut",
            }}
            className="absolute inset-0 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent font-bold"
          >
            {words[currentWordIndex]}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default LayoutTextFlip;
