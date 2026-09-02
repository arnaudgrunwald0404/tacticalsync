import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTagMentionInput } from '@/hooks/useTagMentionInput';
import { COMPOSER_COMMANDS, applyCommands, filterCommands } from '@/lib/composerCommands';
import type { InboxTag } from '@/types/inbox';

// ─────────────────────────────────────────────────────────────────────────────
// Slash-command support in the composer's mention hook: "/" opens the command
// picker (only at word boundaries), filtering narrows by token prefix,
// selecting a command consumes the token and reports it, and command effects
// fold into the item create options (e.g. /pin → { pinned: true }).
// ─────────────────────────────────────────────────────────────────────────────

const projectTag: InboxTag = {
  id: 't1', user_id: 'u1', name: 'Roadmap', type: 'project', color: '#6366f1',
  member_id: null, parent_id: null, sort_order: 0, created_at: 'now',
};

function setup(overrides: Partial<Parameters<typeof useTagMentionInput>[0]> = {}) {
  const onSelect = vi.fn();
  const onSelectCommand = vi.fn();
  const hook = renderHook(() => useTagMentionInput({
    tags: [projectTag],
    allowCreate: true,
    onSelect,
    commands: COMPOSER_COMMANDS,
    onSelectCommand,
    ...overrides,
  }));
  return { ...hook, onSelect, onSelectCommand };
}

function keyEvent(key: string) {
  return { key, preventDefault: vi.fn() } as unknown as React.KeyboardEvent;
}

describe('useTagMentionInput slash commands', () => {
  it('opens the command picker when "/" starts the text', () => {
    const { result } = setup();
    act(() => result.current.setText('/'));
    expect(result.current.autocomplete).toEqual({ type: '/', query: '' });
    expect(result.current.filteredCommands.map(c => c.token)).toContain('pin');
  });

  it('opens the picker after whitespace and filters by prefix', () => {
    const { result } = setup();
    act(() => result.current.setText('ship the report /pi'));
    expect(result.current.autocomplete).toEqual({ type: '/', query: 'pi' });
    expect(result.current.filteredCommands.map(c => c.token)).toEqual(['pin']);
  });

  it('does not trigger mid-word (URLs, fractions)', () => {
    const { result } = setup();
    act(() => result.current.setText('see https://'));
    expect(result.current.autocomplete).toBeNull();
    act(() => result.current.setText('split 3/4'));
    expect(result.current.autocomplete).toBeNull();
  });

  it('does not trigger when commands are disabled', () => {
    const { result } = setup({ commands: undefined });
    act(() => result.current.setText('/'));
    expect(result.current.autocomplete).toBeNull();
  });

  it('selecting a command consumes the token and reports it', () => {
    const { result, onSelectCommand } = setup();
    act(() => result.current.setText('follow up with legal /pin'));
    act(() => result.current.selectCommand(result.current.filteredCommands[0]));
    expect(onSelectCommand).toHaveBeenCalledWith(expect.objectContaining({ token: 'pin' }));
    expect(result.current.text).toBe('follow up with legal');
    expect(result.current.autocomplete).toBeNull();
  });

  it('Enter selects the highlighted command', () => {
    const { result, onSelectCommand } = setup();
    act(() => result.current.setText('/p'));
    let consumed = false;
    act(() => { consumed = result.current.handleAutocompleteKeyDown(keyEvent('Enter')); });
    expect(consumed).toBe(true);
    expect(onSelectCommand).toHaveBeenCalledWith(expect.objectContaining({ token: 'pin' }));
  });

  it('Enter falls through (submit) when no command matches', () => {
    const { result, onSelectCommand } = setup();
    act(() => result.current.setText('/zzz'));
    expect(result.current.filteredCommands).toEqual([]);
    let consumed = true;
    act(() => { consumed = result.current.handleAutocompleteKeyDown(keyEvent('Enter')); });
    expect(consumed).toBe(false);
    expect(onSelectCommand).not.toHaveBeenCalled();
  });

  it('tag mentions still work alongside commands', () => {
    const { result, onSelect } = setup();
    act(() => result.current.setText('plan #Road'));
    expect(result.current.autocomplete).toEqual({ type: '#', query: 'Road' });
    expect(result.current.filteredOptions).toEqual([projectTag]);
    act(() => result.current.selectTag(projectTag));
    expect(onSelect).toHaveBeenCalledWith(projectTag);
    expect(result.current.text).toBe('plan');
  });
});

describe('composerCommands', () => {
  it('filterCommands narrows by token prefix, case-insensitively', () => {
    expect(filterCommands('PI').map(c => c.token)).toEqual(['pin']);
    expect(filterCommands('x')).toEqual([]);
    expect(filterCommands('').length).toBe(COMPOSER_COMMANDS.length);
  });

  it('applyCommands folds /pin into { pinned: true }', () => {
    const pin = COMPOSER_COMMANDS.find(c => c.token === 'pin')!;
    expect(applyCommands([pin])).toEqual({ pinned: true });
    expect(applyCommands([])).toEqual({});
  });
});
