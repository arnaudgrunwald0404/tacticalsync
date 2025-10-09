import { ReactNode } from "react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { PersonalityBar } from "./PersonalityBar";

interface PersonalityHoverCardProps {
  children: ReactNode;
  name: string;
  red?: number;
  blue?: number;
  green?: number;
  yellow?: number;
}

export const PersonalityHoverCard = ({
  children,
  name,
  red = 0,
  blue = 0,
  green = 0,
  yellow = 0,
}: PersonalityHoverCardProps) => {
  const hasPersonality = red + blue + green + yellow > 0;

  if (!hasPersonality) {
    return <>{children}</>;
  }

  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        {children}
      </HoverCardTrigger>
      <HoverCardContent className="w-80">
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">{name}</h4>
          <div>
            <p className="text-xs text-muted-foreground mb-2">Insight Personality</p>
            <PersonalityBar red={red} blue={blue} green={green} yellow={yellow} />
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};
