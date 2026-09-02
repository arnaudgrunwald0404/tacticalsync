import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentBar } from '@/components/inbox/AgentBar';

// ─────────────────────────────────────────────────────────────────────────────
// Composer slash commands end-to-end through the AgentBar UI: typing "/" opens
// the Slack-style picker, clicking a command turns it into a removable pill,
// and submitting passes the command's effect ({ pinned: true }) to onSubmit.
// ─────────────────────────────────────────────────────────────────────────────

function setup() {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onCreateTag = vi.fn().mockResolvedValue(null);
  render(<AgentBar tags={[]} onSubmit={onSubmit} onCreateTag={onCreateTag} />);
  const input = screen.getByPlaceholderText('Add task… / for commands… # to tag');
  return { onSubmit, input };
}

describe('AgentBar slash commands', () => {
  it('shows the updated placeholder', () => {
    setup();
    expect(screen.getByPlaceholderText('Add task… / for commands… # to tag')).toBeTruthy();
  });

  it('typing "/" opens the command picker with /pin', () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: '/' } });
    expect(screen.getByText('/pin')).toBeTruthy();
    expect(screen.getByText('Pin the item to the top of your list')).toBeTruthy();
  });

  it('selecting /pin consumes the token, shows a pill, and submits pinned', async () => {
    const { onSubmit, input } = setup();
    fireEvent.change(input, { target: { value: 'call legal /pin' } });
    fireEvent.click(screen.getByText('/pin'));

    // Token consumed from the text, pill rendered with a remove button.
    expect((input as HTMLInputElement).value).toBe('call legal');
    expect(screen.getByLabelText('Remove /pin')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Add'));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith('call legal', 'task', [], false, { pinned: true }));

    // Pill cleared after submit (state updates land after the awaited onSubmit).
    await vi.waitFor(() => expect(screen.queryByLabelText('Remove /pin')).toBeNull());
  });

  it('removing the pill submits without pinned', async () => {
    const { onSubmit, input } = setup();
    fireEvent.change(input, { target: { value: 'call legal /pin' } });
    fireEvent.click(screen.getByText('/pin'));
    fireEvent.click(screen.getByLabelText('Remove /pin'));

    fireEvent.click(screen.getByLabelText('Add'));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith('call legal', 'task', [], false, {}));
  });
});
