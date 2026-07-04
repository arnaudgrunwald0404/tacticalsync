import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TagPickerDropdown } from '@/components/inbox/TagPickerDropdown';
import type { InboxTag } from '@/types/inbox';
import type { TeamMember } from '@/hooks/useTeamMembers';

// TagPickerDropdown drives all tag assignment in the inbox: a plain click applies a
// single tag immediately, while Shift/Cmd-click enters a multi-select session that
// only commits once "Save" is pressed. These tests pin down that contract across
// the three columns (Projects / Folders / People).

const projectA: InboxTag = { id: 'p1', name: 'Chrysalis', type: 'project', color: '#3b82f6', user_id: 'u', sort_order: 0, parent_id: null, member_id: null, settings: null };
const projectB: InboxTag = { id: 'p2', name: 'Rook', type: 'project', color: '#ec4899', user_id: 'u', sort_order: 1, parent_id: null, member_id: null, settings: null };
const folderA: InboxTag = { id: 'f1', name: 'This week', type: 'folder', color: '#14b8a6', user_id: 'u', sort_order: 0, parent_id: null, member_id: null, settings: null };
const allTags = [projectA, projectB, folderA];

const dan: TeamMember = { id: 'm1', name: 'Dan Pope', email: null, role: 'PM', relationship_type: 'direct_report' };

function setup(overrides: Partial<React.ComponentProps<typeof TagPickerDropdown>> = {}) {
  const onSelectTags = vi.fn();
  const onCreatePersonTag = vi.fn().mockResolvedValue({ id: 'new-person-tag', name: dan.name, type: 'person', color: '#fff', user_id: 'u', sort_order: 0, parent_id: null, member_id: dan.id, settings: null } satisfies InboxTag);
  render(
    <TagPickerDropdown
      allTags={allTags}
      itemTags={[]}
      onSelectTags={onSelectTags}
      teamMembers={[dan]}
      onCreatePersonTag={onCreatePersonTag}
      {...overrides}
    />
  );
  return { onSelectTags, onCreatePersonTag };
}

async function openPicker() {
  const user = userEvent.setup();
  await user.click(screen.getByText('Tag'));
  return user;
}

describe('TagPickerDropdown', () => {
  it('renders three columns: Projects, Folders, People', async () => {
    setup();
    await openPicker();
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('Folders')).toBeInTheDocument();
    expect(screen.getByText('People')).toBeInTheDocument();
  });

  it('a plain click applies immediately and closes the dropdown', async () => {
    const { onSelectTags } = setup();
    const user = await openPicker();
    await user.click(screen.getByText('Chrysalis'));

    expect(onSelectTags).toHaveBeenCalledWith(['p1']);
    // Dropdown closed — its contents are gone.
    expect(screen.queryByText('Projects')).not.toBeInTheDocument();
  });

  it('shift-click does not apply immediately and shows a Save button instead', async () => {
    const { onSelectTags } = setup();
    const user = await openPicker();
    await user.keyboard('{Shift>}');
    await user.click(screen.getByText('Chrysalis'));
    await user.keyboard('{/Shift}');

    expect(onSelectTags).not.toHaveBeenCalled();
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
    // Dropdown stays open for further selection.
    expect(screen.getByText('Projects')).toBeInTheDocument();
  });

  it('after a shift-click, subsequent plain clicks keep toggling instead of applying', async () => {
    const { onSelectTags } = setup();
    const user = await openPicker();
    await user.keyboard('{Shift>}');
    await user.click(screen.getByText('Chrysalis'));
    await user.keyboard('{/Shift}');

    // Plain click on a second project — still just toggles selection.
    await user.click(screen.getByText('Rook'));
    expect(onSelectTags).not.toHaveBeenCalled();
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('Save commits every selected tag (across columns) in one call', async () => {
    const { onSelectTags } = setup();
    const user = await openPicker();
    await user.keyboard('{Shift>}');
    await user.click(screen.getByText('Chrysalis'));
    await user.click(screen.getByText('This week'));
    await user.keyboard('{/Shift}');

    await user.click(screen.getByText('Save'));

    expect(onSelectTags).toHaveBeenCalledTimes(1);
    expect(onSelectTags.mock.calls[0][0].sort()).toEqual(['f1', 'p1']);
  });

  it('Clear discards the pending selection without applying', async () => {
    const { onSelectTags } = setup();
    const user = await openPicker();
    await user.keyboard('{Shift>}');
    await user.click(screen.getByText('Chrysalis'));
    await user.keyboard('{/Shift}');

    await user.click(screen.getByText('Clear'));

    expect(onSelectTags).not.toHaveBeenCalled();
    expect(screen.queryByText('Save')).not.toBeInTheDocument();
  });

  it('selecting an unlinked relationship (no tag yet) creates the tag then applies it', async () => {
    const { onSelectTags, onCreatePersonTag } = setup();
    const user = await openPicker();
    await user.click(screen.getByText('Dan Pope'));

    expect(onCreatePersonTag).toHaveBeenCalledWith(dan);
    expect(onSelectTags).toHaveBeenCalledWith(['new-person-tag']);
  });

  it('multi-selecting an unlinked relationship defers tag creation until Save', async () => {
    const { onSelectTags, onCreatePersonTag } = setup();
    const user = await openPicker();
    await user.keyboard('{Shift>}');
    await user.click(screen.getByText('Dan Pope'));
    await user.keyboard('{/Shift}');

    expect(onCreatePersonTag).not.toHaveBeenCalled();
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    await user.click(screen.getByText('Save'));
    expect(onCreatePersonTag).toHaveBeenCalledWith(dan);
    expect(onSelectTags).toHaveBeenCalledWith(['new-person-tag']);
  });

  it('offers to create a new project or folder when the query has no match', async () => {
    const onCreateTag = vi.fn().mockResolvedValue({ id: 'new-proj', name: 'Atlas', type: 'project', color: '#000', user_id: 'u', sort_order: 2, parent_id: null, member_id: null, settings: null } satisfies InboxTag);
    const { onSelectTags } = setup({ onCreateTag });
    const user = await openPicker();
    await user.type(screen.getByPlaceholderText(/search/i), 'Atlas');

    const projectsColumn = screen.getByText('Projects').parentElement!;
    await user.click(within(projectsColumn).getByText('Create "Atlas"'));

    expect(onCreateTag).toHaveBeenCalledWith('Atlas', 'project');
    expect(onSelectTags).toHaveBeenCalledWith(['new-proj']);
  });

  it('excludes tags already on the item', async () => {
    setup({ itemTags: [projectA] });
    await openPicker();
    const projectsColumn = screen.getByText('Projects').parentElement!;
    expect(within(projectsColumn).queryByText('Chrysalis')).not.toBeInTheDocument();
    expect(within(projectsColumn).getByText('Rook')).toBeInTheDocument();
  });
});
