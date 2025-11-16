import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Hash, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActiveInitiatives } from '@/hooks/useActiveInitiatives';

interface SIHashtagSelectorProps {
  teamId?: string;
  onSelect: (initiativeId: string) => void;
  selectedId?: string | null;
  disabled?: boolean;
  trigger?: React.ReactNode;
}

export function SIHashtagSelector({
  teamId: propTeamId,
  onSelect,
  selectedId,
  disabled = false,
  trigger,
}: SIHashtagSelectorProps) {
  const { teamId: paramTeamId } = useParams<{ teamId: string }>();
  const teamId = propTeamId || paramTeamId;
  
  const [open, setOpen] = useState(false);
  const { initiatives, loading } = useActiveInitiatives(teamId);

  const handleSelect = (initiativeId: string) => {
    onSelect(initiativeId);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger || (
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            className="gap-2"
          >
            <Hash className="h-4 w-4" />
            Link to Initiative
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search initiatives..." />
          <CommandList>
            <CommandEmpty>
              {loading ? 'Loading...' : 'No initiatives found'}
            </CommandEmpty>
            <CommandGroup heading="Strategic Initiatives">
              {initiatives.map((initiative) => (
                <CommandItem
                  key={initiative.id}
                  value={initiative.title}
                  onSelect={() => handleSelect(initiative.id)}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{initiative.title}</div>
                    {initiative.doTitle && (
                      <div className="text-xs text-muted-foreground truncate">
                        {initiative.doTitle}
                      </div>
                    )}
                  </div>
                  <Check
                    className={cn(
                      'h-4 w-4 flex-shrink-0',
                      selectedId === initiative.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

