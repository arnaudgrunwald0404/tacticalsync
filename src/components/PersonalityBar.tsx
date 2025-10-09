interface PersonalityBarProps {
  red: number;
  blue: number;
  green: number;
  yellow: number;
  className?: string;
}

export const PersonalityBar = ({ red, blue, green, yellow, className = "" }: PersonalityBarProps) => {
  const total = red + blue + green + yellow;
  
  if (total === 0) {
    return null;
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex h-6 w-full rounded-md overflow-hidden border">
        {red > 0 && (
          <div
            className="bg-red-500 transition-all"
            style={{ width: `${(red / total) * 100}%` }}
            title={`Red: ${red}%`}
          />
        )}
        {blue > 0 && (
          <div
            className="bg-blue-500 transition-all"
            style={{ width: `${(blue / total) * 100}%` }}
            title={`Blue: ${blue}%`}
          />
        )}
        {green > 0 && (
          <div
            className="bg-green-500 transition-all"
            style={{ width: `${(green / total) * 100}%` }}
            title={`Green: ${green}%`}
          />
        )}
        {yellow > 0 && (
          <div
            className="bg-yellow-500 transition-all"
            style={{ width: `${(yellow / total) * 100}%` }}
            title={`Yellow: ${yellow}%`}
          />
        )}
      </div>
      <div className="grid grid-cols-4 gap-2 text-xs">
        {red > 0 && (
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-red-500" />
            <span>{red}%</span>
          </div>
        )}
        {blue > 0 && (
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-blue-500" />
            <span>{blue}%</span>
          </div>
        )}
        {green > 0 && (
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-green-500" />
            <span>{green}%</span>
          </div>
        )}
        {yellow > 0 && (
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-yellow-500" />
            <span>{yellow}%</span>
          </div>
        )}
      </div>
    </div>
  );
};
