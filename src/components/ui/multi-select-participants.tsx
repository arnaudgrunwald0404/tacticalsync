import * as React from "react";
import { Check, X, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import FancyAvatar from "@/components/ui/fancy-avatar";

interface Profile {
  id: string;
  full_name: string | null;
  avatar_name?: string | null;
  avatar_url?: string | null;
  first_name?: string | null;
  email?: string | null;
}

const getShortDisplayName = (profile: Profile): string => {
  // If we have first_name, use it
  if (profile.first_name) {
    return profile.first_name;
  }
  
  // If we have full_name, extract first name
  if (profile.full_name) {
    const parts = profile.full_name.trim().split(/\s+/);
    if (parts.length > 0) {
      return parts[0];
    }
  }
  
  // If we have email, use part before @
  if (profile.email) {
    return profile.email.split('@')[0];
  }
  
  // Fallback to full_name or avatar_name
  if (profile.full_name) {
    return profile.full_name;
  }
  
  if (profile.avatar_name) {
    const parts = profile.avatar_name.trim().split(/\s+/);
    return parts[0] || profile.avatar_name;
  }
  
  return "Unknown";
};

interface MultiSelectParticipantsProps {
  profiles: Profile[];
  selectedIds: string[];
  onSelectionChange: (selectedIds: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  excludeIds?: string[]; // IDs to exclude from selection (e.g., owner ID)
}

export function MultiSelectParticipants({
  profiles,
  selectedIds,
  onSelectionChange,
  placeholder = "Select participants...",
  disabled = false,
  excludeIds = [],
}: MultiSelectParticipantsProps) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  const availableProfiles = React.useMemo(() => {
    return profiles.filter(
      (p) => !excludeIds.includes(p.id)
    );
  }, [profiles, excludeIds]);

  const selectedProfiles = React.useMemo(() => {
    return availableProfiles.filter((p) => selectedIds.includes(p.id));
  }, [availableProfiles, selectedIds]);

  const filteredProfiles = React.useMemo(() => {
    if (!searchQuery.trim()) return availableProfiles;
    const query = searchQuery.toLowerCase().trim();
    return availableProfiles.filter(
      (p) =>
        (p.full_name?.toLowerCase().includes(query) ?? false) ||
        (p.avatar_name?.toLowerCase().includes(query) ?? false) ||
        (p.first_name?.toLowerCase().includes(query) ?? false) ||
        (p.email?.toLowerCase().includes(query) ?? false) ||
        (getShortDisplayName(p).toLowerCase().includes(query))
    );
  }, [availableProfiles, searchQuery]);

  const handleToggle = (profileId: string) => {
    if (selectedIds.includes(profileId)) {
      onSelectionChange(selectedIds.filter((id) => id !== profileId));
    } else {
      onSelectionChange([...selectedIds, profileId]);
    }
  };

  const handleRemove = (profileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectionChange(selectedIds.filter((id) => id !== profileId));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between min-h-10 h-auto py-2"
          disabled={disabled}
        >
          <div className="flex flex-wrap gap-1 flex-1">
            {selectedProfiles.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              selectedProfiles.map((profile) => (
                <Badge
                  key={profile.id}
                  variant="outline"
                  className="mr-1 mb-1 bg-background hover:bg-accent/50"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-flex h-4 w-4 items-center justify-center overflow-hidden rounded-full">
                      <FancyAvatar
                        name={profile.avatar_name || profile.full_name || ""}
                        displayName={profile.full_name || ""}
                        avatarUrl={profile.avatar_url}
                        size="sm"
                      />
                    </span>
                    <span className="text-xs text-foreground">
                      {getShortDisplayName(profile)}
                    </span>
                    <button
                      className="ml-1 rounded-full outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2 hover:bg-muted"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleRemove(profile.id, e as any);
                        }
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={(e) => handleRemove(profile.id, e)}
                    >
                      <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                    </button>
                  </span>
                </Badge>
              ))
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[300px] p-0 z-[60]" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search participants..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            {filteredProfiles.length === 0 ? (
              <CommandEmpty>
                {availableProfiles.length === 0 
                  ? "No participants available." 
                  : "No participants found matching your search."}
              </CommandEmpty>
            ) : (
              <CommandGroup>
                {filteredProfiles.map((profile) => {
                  const isSelected = selectedIds.includes(profile.id);
                  const searchableValue = `${profile.full_name || ''} ${profile.avatar_name || ''}`.trim() || profile.id;
                  return (
                    <CommandItem
                      key={profile.id}
                      value={searchableValue}
                      onSelect={() => handleToggle(profile.id)}
                      className="cursor-pointer"
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <div
                          className={cn(
                            "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                            isSelected
                              ? "bg-primary text-primary-foreground"
                              : "opacity-50 [&_svg]:invisible"
                          )}
                        >
                          <Check className={cn("h-4 w-4")} />
                        </div>
                        <span className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full">
                          <FancyAvatar
                            name={profile.avatar_name || profile.full_name || ""}
                            displayName={profile.full_name || ""}
                            avatarUrl={profile.avatar_url}
                            size="sm"
                          />
                        </span>
                        <span>{getShortDisplayName(profile)}</span>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

