import { supabase } from '@/integrations/supabase/client';

// Walk one level up the SI parent chain. Sub-SIs have a non-null `parent_si_id`
// pointing to their top-level parent; top-level SIs return their own id. Used by
// navigation code that builds `/rcdo/detail/si/<X>` URLs — the route is only
// defined for top-level SIs, so any raw `strategic_initiative_id` from a task,
// check-in, or activity row must pass through here first.
export async function resolveTopLevelSiId(siId: string): Promise<string> {
  const { data, error } = await supabase
    .from('rc_strategic_initiatives')
    .select('id, parent_si_id')
    .eq('id', siId)
    .maybeSingle();

  if (error || !data) {
    return siId;
  }

  return (data.parent_si_id as string | null) ?? data.id;
}

// Given a task id, return the top-level SI id and the immediate (possibly sub-SI)
// container id. Caller can append `?task=<taskId>` to the SI URL.
export async function resolveTaskSiAncestry(taskId: string): Promise<{ topLevelSiId: string | null; containerSiId: string | null }> {
  const { data, error } = await supabase
    .from('rc_tasks')
    .select('strategic_initiative_id')
    .eq('id', taskId)
    .maybeSingle();

  if (error || !data?.strategic_initiative_id) {
    return { topLevelSiId: null, containerSiId: null };
  }

  const containerSiId = data.strategic_initiative_id as string;
  const topLevelSiId = await resolveTopLevelSiId(containerSiId);
  return { topLevelSiId, containerSiId };
}
