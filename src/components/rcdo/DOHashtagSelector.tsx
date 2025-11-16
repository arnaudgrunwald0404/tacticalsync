import { useState, useEffect, useRef } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Check, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DOHashtagOption } from '@/types/rcdo';

interface DOHashtagSelectorProps {
  dos: DOHashtagOption[];
  selectedDOId?: string | null;
  onSelect: (doId: string) => void;
  onClose: () => void;
  isOpen: boolean;
  triggerRef?: React.RefObject<HTMLElement>;
}

const healthColors = {
  on_track: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
  at_risk: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
  off_track: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
  done: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100',
};

export function DOHashtagSelector({
  dos,
  selectedDOId,
  onSelect,
  onClose,
  isOpen,
  triggerRef,
}: DOHashtagSelectorProps) {
  const [searchValue, setSearchValue] = useState('');

  return (
    <Popover open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <PopoverTrigger asChild>
        <div ref={triggerRef as any} />
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="start" side="bottom">
        <Command shouldFilter={true}>
          <CommandInput
            placeholder="Search defining objectives..."
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList>
            <CommandEmpty>No defining objectives found.</CommandEmpty>
            <CommandGroup heading="Available Defining Objectives">
              {dos.map((doOption) => (
                <CommandItem
                  key={doOption.id}
                  value={doOption.title}
                  onSelect={() => {
                    onSelect(doOption.id);
                    onClose();
                  }}
                  className="flex items-start gap-2 p-3 cursor-pointer"
                >
                  <div className="flex items-center justify-center mt-0.5">
                    {selectedDOId === doOption.id ? (
                      <Check className="h-4 w-4 text-primary" />
                    ) : (
                      <Target className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm truncate">
                        {doOption.title}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn('text-xs', healthColors[doOption.health])}
                      >
                        {doOption.health.replace('_', ' ')}
                      </Badge>
                    </div>
                    {doOption.owner_name && (
                      <div className="text-xs text-gray-500">
                        Owner: {doOption.owner_name}
                      </div>
                    )}
                    {doOption.rallying_cry_title && (
                      <div className="text-xs text-gray-400 truncate">
                        {doOption.rallying_cry_title}
                      </div>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Hook to manage hashtag detection and DO selector state in text inputs
 */
export function useHashtagDOSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const [cursorPosition, setPosition] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    
    // Detect # key press
    if (e.key === '#') {
      setPosition(target.selectionStart);
      setIsOpen(true);
      inputRef.current = target;
    }

    // Close on Escape
    if (e.key === 'Escape' && isOpen) {
      setIsOpen(false);
    }
  };

  const handleSelect = (doId: string, doTitle: string) => {
    if (inputRef.current && cursorPosition !== null) {
      const value = inputRef.current.value;
      const beforeHash = value.substring(0, cursorPosition);
      const afterHash = value.substring(cursorPosition + 1); // +1 to skip the #
      
      // Insert DO title as a tag
      const newValue = `${beforeHash}#${doTitle} ${afterHash}`;
      inputRef.current.value = newValue;
      
      // Trigger change event
      const event = new Event('input', { bubbles: true });
      inputRef.current.dispatchEvent(event);
      
      // Set cursor position after the inserted text
      const newCursorPos = beforeHash.length + doTitle.length + 2; // +2 for # and space
      inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      inputRef.current.focus();
    }
    
    setIsOpen(false);
    return doId; // Return the selected DO ID for linking
  };

  const close = () => {
    setIsOpen(false);
  };

  return {
    isOpen,
    handleKeyDown,
    handleSelect,
    close,
    inputRef,
  };
}

