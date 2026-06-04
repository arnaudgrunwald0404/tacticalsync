import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import FancyAvatar from "@/components/ui/fancy-avatar";

interface Profile {
  id: string;
  full_name: string | null;
  avatar_name?: string | null;
  avatar_url?: string | null;
  first_name?: string | null;
  email?: string | null;
}

const getFirstName = (profile: Profile): string => {
  if (profile.first_name?.trim()) return profile.first_name.trim();
  if (profile.full_name?.trim()) {
    const parts = profile.full_name.trim().split(/\s+/);
    if (parts.length > 0) return parts[0];
  }
  if (profile.email) return profile.email.split("@")[0];
  if (profile.avatar_name?.trim()) {
    const parts = profile.avatar_name.trim().split(/\s+/);
    return parts[0] || profile.avatar_name;
  }
  return "Unknown";
};

const getDisplayName = (profile: Profile): string => {
  const name = profile.full_name?.trim() || profile.avatar_name?.trim() || "";
  if (!name || name.toLowerCase() === "unknown") return "Unknown";
  return name;
};

interface OwnerComboboxProps {
  profiles: Profile[];
  selectedId?: string;
  onSelectionChange: (id: string | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
}

export function OwnerCombobox({
  profiles,
  selectedId,
  onSelectionChange,
  placeholder = "Select owner",
  disabled = false,
  allowClear = false,
}: OwnerComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  const sortedProfiles = React.useMemo(() => {
    return [...profiles].sort((a, b) => {
      const aFirst = getFirstName(a).toLowerCase();
      const bFirst = getFirstName(b).toLowerCase();
      if (aFirst === bFirst) {
        return getDisplayName(a).toLowerCase().localeCompare(getDisplayName(b).toLowerCase());
      }
      return aFirst.localeCompare(bFirst);
    });
  }, [profiles]);

  const filteredProfiles = React.useMemo(() => {
    if (!searchQuery.trim()) return sortedProfiles;
    const query = searchQuery.toLowerCase().trim();
    return sortedProfiles.filter(
      (p) =>
        (p.first_name?.toLowerCase().includes(query) ?? false) ||
        (p.full_name?.toLowerCase().includes(query) ?? false) ||
        (p.avatar_name?.toLowerCase().includes(query) ?? false) ||
        (p.email?.toLowerCase().includes(query) ?? false)
    );
  }, [sortedProfiles, searchQuery]);

  const selected = selectedId ? profiles.find((p) => p.id === selectedId) : undefined;

  const handleSelect = (id: string) => {
    if (allowClear && id === selectedId) {
      onSelectionChange(undefined);
    } else {
      onSelectionChange(id);
    }
    setOpen(false);
    setSearchQuery("");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearchQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-10 font-normal"
          disabled={disabled}
        >
          {selected ? (
            (() => {
              const displayName = getDisplayName(selected);
              const isUnknown = displayName === "Unknown";
              return (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px] flex-shrink-0">
                    {isUnknown ? (
                      <span className="font-semibold">?</span>
                    ) : (
                      <FancyAvatar
                        name={selected.avatar_name || displayName}
                        displayName={displayName}
                        avatarUrl={selected.avatar_url}
                        size="sm"
                      />
                    )}
                  </span>
                  <span className="text-sm truncate">{displayName}</span>
                </div>
              );
            })()
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-[260px] p-0 z-[60]"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search by name…"
            value={searchQuery}
            onValueChange={setSearchQuery}
            autoFocus
          />
          <CommandList>
            {filteredProfiles.length === 0 ? (
              <CommandEmpty>
                {sortedProfiles.length === 0
                  ? "No profiles available."
                  : "No matches found."}
              </CommandEmpty>
            ) : (
              <CommandGroup>
                {filteredProfiles.map((profile) => {
                  const isSelected = profile.id === selectedId;
                  const displayName = getDisplayName(profile);
                  const isUnknown = displayName === "Unknown";
                  return (
                    <CommandItem
                      key={profile.id}
                      value={`${profile.first_name || ""} ${profile.full_name || ""} ${profile.email || ""} ${profile.id}`}
                      onSelect={() => handleSelect(profile.id)}
                      className="cursor-pointer"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          isSelected ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px] mr-2 flex-shrink-0">
                        {isUnknown ? (
                          <span className="font-semibold">?</span>
                        ) : (
                          <FancyAvatar
                            name={profile.avatar_name || displayName}
                            displayName={displayName}
                            avatarUrl={profile.avatar_url}
                            size="sm"
                          />
                        )}
                      </span>
                      <span className="truncate">{displayName}</span>
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
