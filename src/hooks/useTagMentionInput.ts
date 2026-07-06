import { useState, useCallback, useMemo } from 'react';
import type { InboxTag } from '@/types/inbox';

export interface TagMentionAutocomplete {
  type: '#' | '@';
  query: string;
}

const DEFAULT_MENTION_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];

interface UseTagMentionInputArgs {
  tags: InboxTag[];
  /** When false (e.g. asking the assistant a question), no "Create ..." option is offered —
   *  only existing project/person tags can be mentioned. */
  allowCreate: boolean;
  onCreateTag?: (name: string, type: 'project' | 'person', color: string) => Promise<InboxTag | null>;
  /** Called once a mention resolves to a concrete tag (existing or newly created). */
  onSelect: (tag: InboxTag) => void;
}

/** #/@ trigger detection + match dropdown, shared between the item composer
 *  (AgentBar, allowCreate: true) and the assistant chat composer (allowCreate: false). */
export function useTagMentionInput({ tags, allowCreate, onCreateTag, onSelect }: UseTagMentionInputArgs) {
  const [text, setTextState] = useState('');
  const [autocomplete, setAutocomplete] = useState<TagMentionAutocomplete | null>(null);
  const [acActiveIdx, setAcActiveIdx] = useState(0);

  const setText = useCallback((value: string) => {
    setTextState(value);
    const match = value.match(/[#@]([a-zA-Z0-9 _-]*)$/);
    if (match) {
      setAutocomplete({ type: match[0][0] as '#' | '@', query: match[1] });
      setAcActiveIdx(0);
    } else {
      setAutocomplete(null);
    }
  }, []);

  const clearText = useCallback(() => setTextState(''), []);
  const closeAutocomplete = useCallback(() => setAutocomplete(null), []);

  const filteredOptions = useMemo(() => autocomplete
    ? tags.filter(t =>
        t.name.toLowerCase().includes(autocomplete.query.toLowerCase()) &&
        (autocomplete.type === '@' ? t.type === 'person' : t.type === 'project'))
    : [], [autocomplete, tags]);

  const consumeTrigger = useCallback(() => {
    setTextState(prev => prev.replace(/[#@][a-zA-Z0-9 _-]*$/, '').trimEnd());
    setAutocomplete(null);
  }, []);

  const selectTag = useCallback((tag: InboxTag) => {
    onSelect(tag);
    consumeTrigger();
  }, [onSelect, consumeTrigger]);

  const createTagFromQuery = useCallback(async () => {
    if (!allowCreate || !autocomplete || !onCreateTag) return;
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
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAcActiveIdx(i => Math.min(i + 1, Math.max(0, filteredOptions.length - 1)));
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAcActiveIdx(i => Math.max(0, i - 1));
      return true;
    }
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      if (filteredOptions.length > 0) selectTag(filteredOptions[Math.min(acActiveIdx, filteredOptions.length - 1)]);
      else if (allowCreate && autocomplete.query) void createTagFromQuery();
      return true;
    }
    return false;
  }, [autocomplete, filteredOptions, acActiveIdx, allowCreate, selectTag, createTagFromQuery]);

  return {
    text, setText, clearText,
    autocomplete, acActiveIdx, setAcActiveIdx, closeAutocomplete,
    filteredOptions,
    selectTag, createTagFromQuery,
    handleAutocompleteKeyDown,
  };
}
