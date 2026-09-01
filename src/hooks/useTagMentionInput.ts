import { useState, useCallback, useMemo } from 'react';
import type { InboxTag } from '@/types/inbox';
import { filterCommands, type ComposerCommand } from '@/lib/composerCommands';

export interface TagMentionAutocomplete {
  type: '#' | '@' | '/';
  query: string;
}

const DEFAULT_MENTION_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];

// A slash only triggers the command picker at the start of the text or after
// whitespace — never mid-word, so URLs ("http://…") and fractions ("3/4")
// don't pop the dropdown. Tag/person triggers keep their original behavior.
const SLASH_TRIGGER = /(?:^|\s)\/([a-zA-Z0-9-]*)$/;
const SLASH_CONSUME = /\/[a-zA-Z0-9-]*$/;
const TAG_TRIGGER = /[#@]([a-zA-Z0-9 _-]*)$/;
const TAG_CONSUME = /[#@][a-zA-Z0-9 _-]*$/;

interface UseTagMentionInputArgs {
  tags: InboxTag[];
  /** When false (e.g. asking the assistant a question), no "Create ..." option is offered —
   *  only existing project/person tags can be mentioned. */
  allowCreate: boolean;
  onCreateTag?: (name: string, type: 'project' | 'person', color: string) => Promise<InboxTag | null>;
  /** Called once a mention resolves to a concrete tag (existing or newly created). */
  onSelect: (tag: InboxTag) => void;
  /** Slash commands offered when "/" is typed. Omit (or pass []) to disable
   *  the command picker — e.g. in the assistant chat composer. */
  commands?: ComposerCommand[];
  /** Called when a slash command is picked from the dropdown. */
  onSelectCommand?: (command: ComposerCommand) => void;
}

/** #/@ trigger detection + match dropdown, shared between the item composer
 *  (AgentBar, allowCreate: true) and the assistant chat composer (allowCreate: false).
 *  Also drives the "/" slash-command picker when `commands` is provided. */
export function useTagMentionInput({ tags, allowCreate, onCreateTag, onSelect, commands, onSelectCommand }: UseTagMentionInputArgs) {
  const [text, setTextState] = useState('');
  const [autocomplete, setAutocomplete] = useState<TagMentionAutocomplete | null>(null);
  const [acActiveIdx, setAcActiveIdx] = useState(0);

  const commandsEnabled = (commands?.length ?? 0) > 0;

  const setText = useCallback((value: string) => {
    setTextState(value);
    const slashMatch = commandsEnabled ? value.match(SLASH_TRIGGER) : null;
    const tagMatch = value.match(TAG_TRIGGER);
    if (slashMatch) {
      setAutocomplete({ type: '/', query: slashMatch[1] });
      setAcActiveIdx(0);
    } else if (tagMatch) {
      setAutocomplete({ type: tagMatch[0][0] as '#' | '@', query: tagMatch[1] });
      setAcActiveIdx(0);
    } else {
      setAutocomplete(null);
    }
  }, [commandsEnabled]);

  const clearText = useCallback(() => setTextState(''), []);
  const closeAutocomplete = useCallback(() => setAutocomplete(null), []);

  const filteredOptions = useMemo(() => autocomplete && autocomplete.type !== '/'
    ? tags.filter(t =>
        t.name.toLowerCase().includes(autocomplete.query.toLowerCase()) &&
        (autocomplete.type === '@' ? t.type === 'person' : t.type === 'project'))
    : [], [autocomplete, tags]);

  const filteredCommands = useMemo(() => autocomplete?.type === '/'
    ? filterCommands(autocomplete.query, commands)
    : [], [autocomplete, commands]);

  const consumeTrigger = useCallback((type: TagMentionAutocomplete['type']) => {
    const pattern = type === '/' ? SLASH_CONSUME : TAG_CONSUME;
    setTextState(prev => prev.replace(pattern, '').trimEnd());
    setAutocomplete(null);
  }, []);

  const selectTag = useCallback((tag: InboxTag) => {
    onSelect(tag);
    consumeTrigger('#');
  }, [onSelect, consumeTrigger]);

  const selectCommand = useCallback((command: ComposerCommand) => {
    onSelectCommand?.(command);
    consumeTrigger('/');
  }, [onSelectCommand, consumeTrigger]);

  const createTagFromQuery = useCallback(async () => {
    if (!allowCreate || !autocomplete || autocomplete.type === '/' || !onCreateTag) return;
    const tagType = autocomplete.type === '@' ? 'person' : 'project';
    const name = autocomplete.query || 'new';
    const color = DEFAULT_MENTION_COLORS[Math.floor(Math.random() * DEFAULT_MENTION_COLORS.length)];
    const existing = tags.find(t => t.name.toLowerCase() === name.toLowerCase());
    const tag = existing ?? await onCreateTag(name, tagType, color);
    if (tag) selectTag(tag);
  }, [allowCreate, autocomplete, onCreateTag, tags, selectTag]);

  /** Handles ArrowUp/ArrowDown/Tab/Enter while the dropdown is open. Returns true
   *  if it consumed the event — the caller should still handle Escape itself. */
  const handleAutocompleteKeyDown = useCallback((e: React.KeyboardEvent): boolean => {
    if (!autocomplete) return false;
    const isSlash = autocomplete.type === '/';
    const optionCount = isSlash ? filteredCommands.length : filteredOptions.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAcActiveIdx(i => Math.min(i + 1, Math.max(0, optionCount - 1)));
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAcActiveIdx(i => Math.max(0, i - 1));
      return true;
    }
    if (e.key === 'Tab' || e.key === 'Enter') {
      if (isSlash) {
        // No matching command: let Enter fall through (e.g. submit the item)
        // instead of swallowing the keystroke on an empty dropdown.
        if (filteredCommands.length === 0) { setAutocomplete(null); return false; }
        e.preventDefault();
        selectCommand(filteredCommands[Math.min(acActiveIdx, filteredCommands.length - 1)]);
        return true;
      }
      e.preventDefault();
      if (filteredOptions.length > 0) selectTag(filteredOptions[Math.min(acActiveIdx, filteredOptions.length - 1)]);
      else if (allowCreate && autocomplete.query) void createTagFromQuery();
      return true;
    }
    return false;
  }, [autocomplete, filteredOptions, filteredCommands, acActiveIdx, allowCreate, selectTag, selectCommand, createTagFromQuery]);

  return {
    text, setText, clearText,
    autocomplete, acActiveIdx, setAcActiveIdx, closeAutocomplete,
    filteredOptions, filteredCommands,
    selectTag, selectCommand, createTagFromQuery,
    handleAutocompleteKeyDown,
  };
}
