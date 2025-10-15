import React from "react";

interface FancyAvatarProps {
  name: string; // Used for generating the pattern/colors (can include seed)
  displayName?: string; // Used for displaying initials (actual first/last name)
  size?: "sm" | "md" | "lg";
  className?: string;
}

interface AvatarConfig {
  colors: string[];
  pattern: string;
  rotation: number;
}

const FancyAvatar: React.FC<FancyAvatarProps> = ({ 
  name, 
  displayName,
  size = "md", 
  className = "" 
}) => {
  // Generate diverse avatar config based on name
  const getAvatarConfig = (name: string): AvatarConfig => {
    // Create multiple hash values for more variety
    const hash1 = name.split('').reduce((a, b, i) => {
      a = ((a << 5) - a) + b.charCodeAt(0) + i;
      return a & a;
    }, 0);
    
    const hash2 = name.split('').reverse().reduce((a, b, i) => {
      a = ((a << 3) - a) + b.charCodeAt(0) * (i + 1);
      return a & a;
    }, 0);
    
    const hash3 = name.length + name.charCodeAt(0) + name.charCodeAt(name.length - 1);
    
    // Super bright, vibrant colors with more light and energy
    const allColors = [
      // Ultra-bright pinks with more light
      "#FF69B4", "#FF1493", "#FF10F0", "#FF0080", "#FF006E", "#FF0099", "#FF1744", "#FF6BB3", "#FF8EC7", "#FFB3DA",
      // Electric blues with high saturation
      "#00FFFF", "#00D9FF", "#00CCFF", "#00DDFF", "#10C0FF", "#1E90FF", "#0099FF", "#00BFFF", "#40E0D0", "#87CEEB",
      // Vibrant reds with more pop
      "#FF0000", "#FF3333", "#FF4444", "#FF0055", "#FF1111", "#FF2200", "#FF1020", "#FF6B6B", "#FF8C8C", "#FFB3B3",
      // Bright yellows and oranges
      "#FFFF00", "#FFED00", "#FFD700", "#FFE500", "#FFEE00", "#FFF020", "#FFCC00", "#FFA500", "#FFD54F", "#FFEB3B",
      // Additional bright colors for more variety
      "#00FF00", "#32CD32", "#00FF7F", "#7FFF00", "#ADFF2F", "#9ACD32", "#98FB98", "#90EE90", "#8FBC8F", "#00FA9A",
      // Bright purples and magentas
      "#FF00FF", "#DA70D6", "#BA55D3", "#9370DB", "#8A2BE2", "#9400D3", "#9932CC", "#8B008B", "#FF1493", "#C71585"
    ];
    
    // Generate 4 unique colors for each avatar
    const colorIndices = [
      Math.abs(hash1) % allColors.length,
      Math.abs(hash2) % allColors.length,
      Math.abs(hash3) % allColors.length,
      Math.abs((hash1 + hash2) % 1000) % allColors.length
    ];
    
    // Ensure colors are different
    const uniqueColors = [...new Set(colorIndices.map(i => allColors[i]))];
    while (uniqueColors.length < 4) {
      const newIndex = Math.abs((hash1 + uniqueColors.length * 7) % 1000) % allColors.length;
      if (!uniqueColors.includes(allColors[newIndex])) {
        uniqueColors.push(allColors[newIndex]);
      }
    }
    
    const patterns = [
      "triangles", "circles", "hexagons", "squares", "diamonds", 
      "waves", "chevrons", "stars", "polygons", "spirals", "dots", "lines",
      "grid", "diagonal", "radial", "concentric"
    ];
    
    const rotations = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225];
    
    return {
      colors: uniqueColors.slice(0, 4),
      pattern: patterns[Math.abs(hash2) % patterns.length],
      rotation: rotations[Math.abs(hash3) % rotations.length]
    };
  };

  const config = getAvatarConfig(name);
  
  // Get initials from displayName (actual user name) or fall back to name
  const getInitials = (nameStr: string): string => {
    const cleanName = nameStr.trim();
    const words = cleanName.split(' ').filter(word => word.length > 0);
    
    if (words.length >= 2) {
      // First and last name available: take first letter of each
      return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
    } else if (words.length === 1) {
      // Only one word (could be first name or email): take first two letters
      return words[0].slice(0, 2).toUpperCase();
    } else {
      // Fallback: take first two characters
      return cleanName.slice(0, 2).toUpperCase();
    }
  };
  
  // Always use displayName for initials if available, otherwise clean up name
  const cleanNameForInitials = (str: string): string => {
    // Remove any numbers from the end of the string
    return str.replace(/\d+$/, '').trim();
  };
  
  const initials = getInitials(displayName || cleanNameForInitials(name));
  
  const sizeClasses = {
    sm: "w-8 h-8 text-sm",
    md: "w-12 h-12 text-lg", 
    lg: "w-16 h-16 text-2xl"
  };

  const renderPattern = () => {
    const { colors, pattern, rotation } = config;
    
    switch (pattern) {
      case "triangles":
        return (
          <svg viewBox="0 0 100 100" className="absolute inset-0">
            <defs>
              <pattern id={`triangles-${name}`} patternUnits="userSpaceOnUse" width="20" height="20">
                <polygon points="10,2 18,16 2,16" fill={colors[0]} opacity="0.8"/>
                <polygon points="10,8 18,22 2,22" fill={colors[1]} opacity="0.6"/>
              </pattern>
            </defs>
            <rect width="100" height="100" fill={`url(#triangles-${name})`} 
                  transform={`rotate(${rotation} 50 50)`}/>
          </svg>
        );
      
      case "circles":
        return (
          <svg viewBox="0 0 100 100" className="absolute inset-0">
            <defs>
              <pattern id={`circles-${name}`} patternUnits="userSpaceOnUse" width="25" height="25">
                <circle cx="12.5" cy="12.5" r="8" fill={colors[0]} opacity="0.7"/>
                <circle cx="20" cy="20" r="5" fill={colors[1]} opacity="0.9"/>
              </pattern>
            </defs>
            <rect width="100" height="100" fill={`url(#circles-${name})`}
                  transform={`rotate(${rotation} 50 50)`}/>
          </svg>
        );
      
      case "hexagons":
        return (
          <svg viewBox="0 0 100 100" className="absolute inset-0">
            <defs>
              <pattern id={`hexagons-${name}`} patternUnits="userSpaceOnUse" width="30" height="26">
                <polygon points="15,2 25,8 25,18 15,24 5,18 5,8" fill={colors[0]} opacity="0.8"/>
                <polygon points="20,5 28,10 28,18 20,23 12,18 12,10" fill={colors[1]} opacity="0.6"/>
              </pattern>
            </defs>
            <rect width="100" height="100" fill={`url(#hexagons-${name})`}
                  transform={`rotate(${rotation} 50 50)`}/>
          </svg>
        );
      
      case "waves":
        return (
          <svg viewBox="0 0 100 100" className="absolute inset-0">
            <defs>
              <pattern id={`waves-${name}`} patternUnits="userSpaceOnUse" width="40" height="40">
                <path d="M0,20 Q10,0 20,20 T40,20" stroke={colors[0]} strokeWidth="3" fill="none" opacity="0.8"/>
                <path d="M0,30 Q10,10 20,30 T40,30" stroke={colors[1]} strokeWidth="2" fill="none" opacity="0.6"/>
              </pattern>
            </defs>
            <rect width="100" height="100" fill={`url(#waves-${name})`}
                  transform={`rotate(${rotation} 50 50)`}/>
          </svg>
        );
      
      case "stars":
        return (
          <svg viewBox="0 0 100 100" className="absolute inset-0">
            <defs>
              <pattern id={`stars-${name}`} patternUnits="userSpaceOnUse" width="25" height="25">
                <polygon points="12.5,2 15.5,8.5 22.5,8.5 17,13 19,20 12.5,16 6,20 8,13 2.5,8.5 9.5,8.5" 
                         fill={colors[0]} opacity="0.8"/>
                <polygon points="12.5,6 14.5,10.5 19.5,10.5 16,13 17.5,18 12.5,15 7.5,18 9,13 5.5,10.5 10.5,10.5" 
                         fill={colors[1]} opacity="0.6"/>
              </pattern>
            </defs>
            <rect width="100" height="100" fill={`url(#stars-${name})`}
                  transform={`rotate(${rotation} 50 50)`}/>
          </svg>
        );
      
      case "diamonds":
        return (
          <svg viewBox="0 0 100 100" className="absolute inset-0">
            <defs>
              <pattern id={`diamonds-${name}`} patternUnits="userSpaceOnUse" width="20" height="20">
                <polygon points="10,2 18,10 10,18 2,10" fill={colors[0]} opacity="0.8"/>
                <polygon points="10,6 14,10 10,14 6,10" fill={colors[1]} opacity="0.6"/>
              </pattern>
            </defs>
            <rect width="100" height="100" fill={`url(#diamonds-${name})`}
                  transform={`rotate(${rotation} 50 50)`}/>
          </svg>
        );
      
      case "dots":
        return (
          <svg viewBox="0 0 100 100" className="absolute inset-0">
            <defs>
              <pattern id={`dots-${name}`} patternUnits="userSpaceOnUse" width="15" height="15">
                <circle cx="7.5" cy="7.5" r="3" fill={colors[0]} opacity="0.7"/>
                <circle cx="2" cy="2" r="1.5" fill={colors[1]} opacity="0.9"/>
                <circle cx="13" cy="13" r="2" fill={colors[2]} opacity="0.8"/>
              </pattern>
            </defs>
            <rect width="100" height="100" fill={`url(#dots-${name})`}
                  transform={`rotate(${rotation} 50 50)`}/>
          </svg>
        );
      
      case "lines":
        return (
          <svg viewBox="0 0 100 100" className="absolute inset-0">
            <defs>
              <pattern id={`lines-${name}`} patternUnits="userSpaceOnUse" width="20" height="20">
                <line x1="0" y1="10" x2="20" y2="10" stroke={colors[0]} strokeWidth="2" opacity="0.8"/>
                <line x1="0" y1="15" x2="20" y2="15" stroke={colors[1]} strokeWidth="1.5" opacity="0.6"/>
              </pattern>
            </defs>
            <rect width="100" height="100" fill={`url(#lines-${name})`}
                  transform={`rotate(${rotation} 50 50)`}/>
          </svg>
        );
      
      case "grid":
        return (
          <svg viewBox="0 0 100 100" className="absolute inset-0">
            <defs>
              <pattern id={`grid-${name}`} patternUnits="userSpaceOnUse" width="25" height="25">
                <rect x="0" y="0" width="25" height="25" fill="none" stroke={colors[0]} strokeWidth="1" opacity="0.6"/>
                <rect x="5" y="5" width="15" height="15" fill={colors[1]} opacity="0.4"/>
              </pattern>
            </defs>
            <rect width="100" height="100" fill={`url(#grid-${name})`}
                  transform={`rotate(${rotation} 50 50)`}/>
          </svg>
        );
      
      case "diagonal":
        return (
          <svg viewBox="0 0 100 100" className="absolute inset-0">
            <defs>
              <pattern id={`diagonal-${name}`} patternUnits="userSpaceOnUse" width="20" height="20">
                <polygon points="0,0 20,0 20,10 0,10" fill={colors[0]} opacity="0.7"/>
                <polygon points="0,10 20,10 20,20 0,20" fill={colors[1]} opacity="0.5"/>
              </pattern>
            </defs>
            <rect width="100" height="100" fill={`url(#diagonal-${name})`}
                  transform={`rotate(${rotation} 50 50)`}/>
          </svg>
        );
      
      case "radial":
        return (
          <svg viewBox="0 0 100 100" className="absolute inset-0">
            <defs>
              <radialGradient id={`radial-${name}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={colors[0]} stopOpacity="0.9"/>
                <stop offset="50%" stopColor={colors[1]} stopOpacity="0.7"/>
                <stop offset="100%" stopColor={colors[2]} stopOpacity="0.5"/>
              </radialGradient>
            </defs>
            <rect width="100" height="100" fill={`url(#radial-${name})`}
                  transform={`rotate(${rotation} 50 50)`}/>
          </svg>
        );
      
      case "concentric":
        return (
          <svg viewBox="0 0 100 100" className="absolute inset-0">
            <circle cx="50" cy="50" r="45" fill={colors[0]} opacity="0.3"/>
            <circle cx="50" cy="50" r="35" fill={colors[1]} opacity="0.5"/>
            <circle cx="50" cy="50" r="25" fill={colors[2]} opacity="0.7"/>
            <circle cx="50" cy="50" r="15" fill={colors[3]} opacity="0.9"/>
          </svg>
        );
      
      default:
        return (
          <div 
            className="absolute inset-0 rounded-full opacity-90"
            style={{
              background: `linear-gradient(135deg, ${colors[0]}CC 0%, rgba(255,255,255,0.3) 25%, ${colors[1]}CC 50%, rgba(255,255,255,0.2) 75%, ${colors[2]}CC 100%)`,
              transform: `rotate(${rotation}deg)`,
              filter: 'brightness(1.2) saturate(1.3)'
            }}
          />
        );
    }
  };

  return (
    <div className={`relative ${sizeClasses[size]} ${className}`}>
      {/* Background pattern */}
      {renderPattern()}
      
      {/* Bright overlay gradient with more light */}
      <div 
        className="absolute inset-0 rounded-full opacity-80"
        style={{
          background: `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.4) 0%, ${config.colors[2]}80 30%, transparent 70%), 
                       linear-gradient(45deg, ${config.colors[0]}CC 0%, ${config.colors[1]}CC 50%, rgba(255,255,255,0.3) 100%)`
        }}
      />
      
      {/* Additional light overlay for brightness */}
      <div 
        className="absolute inset-0 rounded-full opacity-40"
        style={{
          background: `radial-gradient(circle at 70% 70%, rgba(255,255,255,0.6) 0%, transparent 50%)`
        }}
      />
      
      {/* Initials */}
      <div className="relative z-10 flex items-center justify-center h-full">
        <span 
          className="font-black text-white drop-shadow-lg tracking-tighter"
          style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.7), 0 0 10px rgba(255,255,255,0.3)' }}
        >
          {initials}
        </span>
      </div>
    </div>
  );
};

export default FancyAvatar;
