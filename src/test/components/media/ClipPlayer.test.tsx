import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ClipPlayer touches the real Supabase client (supabase.auth.getSession) —
// mock it the same way InboxItemRow.meetingInsight.test.tsx does, since this
// environment has no VITE_SUPABASE_URL configured.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'test-token' } } }),
    },
  },
}));

const { ClipPlayer } = await import('@/components/media/ClipPlayer');

describe('ClipPlayer', () => {
  const originalPlay = window.HTMLMediaElement.prototype.play;
  const originalPause = window.HTMLMediaElement.prototype.pause;

  beforeEach(() => {
    // jsdom doesn't implement real media playback — stub both so `await
    // audio.play()` resolves instead of throwing "not implemented".
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.pause = vi.fn();
  });

  afterEach(() => {
    window.HTMLMediaElement.prototype.play = originalPlay;
    window.HTMLMediaElement.prototype.pause = originalPause;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders nothing when endSeconds does not exceed startSeconds (never a guessed/invalid range)', () => {
    const { container } = render(
      <ClipPlayer recordingId="rec-1" startSeconds={10} endSeconds={10} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a play control with the clip duration by default', () => {
    render(<ClipPlayer recordingId="rec-1" startSeconds={10} endSeconds={25} />);
    expect(screen.getByRole('button', { name: /play clip/i })).toBeInTheDocument();
    expect(screen.getByText('15s clip')).toBeInTheDocument();
  });

  it('shows "clip no longer available" when the availability check 404s', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    const user = userEvent.setup();
    render(<ClipPlayer recordingId="rec-1" startSeconds={10} endSeconds={25} />);

    await user.click(screen.getByRole('button', { name: /play clip/i }));

    await waitFor(() => {
      expect(screen.getByText(/clip no longer available/i)).toBeInTheDocument();
    });
  });

  it('plays the clip when the availability check succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    const user = userEvent.setup();
    render(<ClipPlayer recordingId="rec-1" startSeconds={10} endSeconds={25} />);

    await user.click(screen.getByRole('button', { name: /play clip/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /pause clip/i })).toBeInTheDocument();
    });
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it('never bubbles its click up to a parent container (the hero card is itself a <button>)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    const onParentClick = vi.fn();
    const user = userEvent.setup();
    render(
      <div onClick={onParentClick}>
        <ClipPlayer recordingId="rec-1" startSeconds={10} endSeconds={25} />
      </div>
    );

    await user.click(screen.getByRole('button', { name: /play clip/i }));
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it('auto-pauses and resets once playback reaches endSeconds', () => {
    render(<ClipPlayer recordingId="rec-1" startSeconds={10} endSeconds={25} />);
    const audio = document.querySelector('audio') as HTMLAudioElement;
    Object.defineProperty(audio, 'currentTime', { value: 25, writable: true, configurable: true });

    fireEvent.timeUpdate(audio);

    expect(window.HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(audio.currentTime).toBe(10);
  });
});
