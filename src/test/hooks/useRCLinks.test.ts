import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useRCLinks } from '@/hooks/useRCDO';
import { supabase } from '@/integrations/supabase/client';

// This suite exercises the "surface the link back" half of the hashtag ->
// rc_links -> DO/SI detail page pipeline: useRCLinks doesn't just fetch raw
// rc_links rows, it also resolves each row's `linked_item` (title + the
// meeting it came from) so DO/SI detail pages can render a
// "Linked from meetings" section without the raw ref_id being meaningless.
vi.mock('@/hooks/use-toast', () => {
  const toast = vi.fn();
  return { useToast: () => ({ toast }) };
});

vi.mock('@/integrations/supabase/client', () => {
  const from = vi.fn();
  return { supabase: { from, auth: { getUser: vi.fn() } } };
});

const mockedSupabase = supabase as unknown as { from: ReturnType<typeof vi.fn> };

// Builds a chain supporting both `.select().eq().eq()` (rc_links) and
// `.select().in()` (the follow-up lookups in attachLinkedItemDetails).
const makeTableBuilder = (rows: unknown[]) => {
  const inFn = vi.fn(() => Promise.resolve({ data: rows, error: null }));
  const eq2 = vi.fn(() => Promise.resolve({ data: rows, error: null }));
  const eq1 = vi.fn(() => ({ eq: eq2 }));
  const select = vi.fn(() => ({ eq: eq1, in: inFn }));
  return { select, eq1, eq2, in: inFn };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useRCLinks', () => {
  it('returns an empty list without querying when parentId is missing', async () => {
    const { result } = renderHook(() => useRCLinks('do', undefined));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.links).toEqual([]);
    expect(mockedSupabase.from).not.toHaveBeenCalled();
  });

  it('enriches a meeting_priority link with the priority title and meeting name', async () => {
    const rcLinksRows = [
      {
        id: 'link-1',
        parent_type: 'do',
        parent_id: 'do-1',
        kind: 'meeting_priority',
        ref_id: 'priority-1',
        created_by: 'user-1',
        created_at: '2026-01-01T00:00:00Z',
      },
    ];
    const priorities = [{ id: 'priority-1', title: 'Ship onboarding v2', instance_id: 'instance-1' }];
    const instances = [{ id: 'instance-1', series_id: 'series-1' }];
    const series = [{ id: 'series-1', name: 'Weekly Leadership Sync' }];

    const builders: Record<string, ReturnType<typeof makeTableBuilder>> = {
      rc_links: makeTableBuilder(rcLinksRows),
      meeting_instance_priorities: makeTableBuilder(priorities),
      meeting_instances: makeTableBuilder(instances),
      meeting_series: makeTableBuilder(series),
    };

    mockedSupabase.from.mockImplementation((table: string) => builders[table]);

    const { result } = renderHook(() => useRCLinks('do', 'do-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.links).toHaveLength(1);
    expect(result.current.links[0].linked_item).toEqual({
      title: 'Ship onboarding v2',
      meeting_name: 'Weekly Leadership Sync',
    });

    // Confirms the hook scopes rc_links to the requested parent.
    expect(builders.rc_links.eq1).toHaveBeenCalledWith('parent_type', 'do');
    expect(builders.rc_links.eq2).toHaveBeenCalledWith('parent_id', 'do-1');
  });

  it('enriches an action_item link with the item title and meeting name', async () => {
    const rcLinksRows = [
      {
        id: 'link-2',
        parent_type: 'initiative',
        parent_id: 'si-1',
        kind: 'action_item',
        ref_id: 'action-1',
        created_by: 'user-1',
        created_at: '2026-01-01T00:00:00Z',
      },
    ];
    const actionItems = [{ id: 'action-1', title: 'Follow up with legal', series_id: 'series-2' }];
    const series = [{ id: 'series-2', name: 'Product Standup' }];

    const builders: Record<string, ReturnType<typeof makeTableBuilder>> = {
      rc_links: makeTableBuilder(rcLinksRows),
      meeting_series_action_items: makeTableBuilder(actionItems),
      meeting_series: makeTableBuilder(series),
    };

    mockedSupabase.from.mockImplementation((table: string) => builders[table]);

    const { result } = renderHook(() => useRCLinks('initiative', 'si-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.links).toHaveLength(1);
    expect(result.current.links[0].linked_item).toEqual({
      title: 'Follow up with legal',
      meeting_name: 'Product Standup',
    });
  });

  it('leaves links unenriched (but present) when there are no rows to resolve', async () => {
    const builders: Record<string, ReturnType<typeof makeTableBuilder>> = {
      rc_links: makeTableBuilder([]),
    };
    mockedSupabase.from.mockImplementation((table: string) => builders[table]);

    const { result } = renderHook(() => useRCLinks('do', 'do-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.links).toEqual([]);
  });
});
