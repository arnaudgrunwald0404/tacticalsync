/**
 * Import RCDO to Database
 * Saves parsed RCDO data (including SI metadata and tasks) to Supabase
 */

import { supabase } from '@/integrations/supabase/client';
import type { ParsedRCDO, ParsedTask } from './markdownRCDOParser';
import type { TaskStatus } from '@/types/rcdo';

export interface ImportRCDOOptions {
  cycleId: string;
  ownerUserId: string;
}

export interface ImportRCDOResult {
  success: boolean;
  error?: string;
  rallyingCryId?: string;
  doIds?: string[];
  siIds?: string[];
  taskCount?: number;
}

export type ImportProgressCallback = (progress: {
  index: number;
  status: 'pending' | 'loading' | 'success' | 'error';
  label?: string;
}) => void;

async function findUserByName(name: string, fallbackUserId: string): Promise<string> {
  if (!name) return fallbackUserId;

  const { data: users } = await supabase
    .from('profiles')
    .select('id, full_name, first_name, last_name, email')
    .or(`full_name.ilike.%${name}%,email.ilike.%${name}%`);

  if (users && users.length > 0) {
    const exactMatch = users.find(u =>
      u.full_name?.toLowerCase() === name.toLowerCase() ||
      `${u.first_name} ${u.last_name}`.toLowerCase() === name.toLowerCase() ||
      u.first_name?.toLowerCase() === name.toLowerCase() ||
      u.email?.toLowerCase() === name.toLowerCase()
    );

    if (exactMatch) {
      console.log(`Found owner "${name}" -> ${exactMatch.email || exactMatch.full_name}`);
      return exactMatch.id;
    }

    console.log(`Partial match for "${name}" -> ${users[0].email || users[0].full_name}`);
    return users[0].id;
  }

  console.warn(`Owner "${name}" not found, using importing user as fallback`);
  return fallbackUserId;
}

const TASK_STATUS_MAP: Record<string, TaskStatus> = {
  'not assigned': 'not_assigned',
  'not_assigned': 'not_assigned',
  'assigned': 'assigned',
  'in progress': 'in_progress',
  'in_progress': 'in_progress',
  'completed': 'completed',
  'delayed': 'delayed',
  'task changed/canceled': 'task_changed_canceled',
  'task_changed_canceled': 'task_changed_canceled',
  'changed/canceled': 'task_changed_canceled',
  'cancelled': 'task_changed_canceled',
  'canceled': 'task_changed_canceled',
};

function normalizeTaskStatus(raw?: string): TaskStatus {
  if (!raw) return 'not_assigned';
  return TASK_STATUS_MAP[raw.toLowerCase().trim()] || 'not_assigned';
}

function parseDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.trim();
  if (!cleaned || cleaned === '—') return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
  const d = new Date(cleaned);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return undefined;
}

export async function importRCDOToDatabase(
  data: ParsedRCDO,
  options: ImportRCDOOptions,
  onProgress?: ImportProgressCallback
): Promise<ImportRCDOResult> {
  const { cycleId, ownerUserId } = options;

  try {
    // Delete existing Rallying Cry (cascade deletes DOs, SIs, tasks)
    const { data: existingRC } = await supabase
      .from('rc_rallying_cries')
      .select('id')
      .eq('cycle_id', cycleId)
      .maybeSingle();

    if (existingRC) {
      const { error: deleteError } = await supabase
        .from('rc_rallying_cries')
        .delete()
        .eq('id', existingRC.id);

      if (deleteError) {
        console.warn('Failed to delete existing Rallying Cry:', deleteError);
      }
    }

    // 1. Create Rallying Cry
    onProgress?.({ index: 0, status: 'loading', label: 'Rallying Cry' });

    const { data: rallyingCry, error: rcError } = await supabase
      .from('rc_rallying_cries')
      .insert({
        cycle_id: cycleId,
        title: data.rallyingCry,
        narrative: null,
        owner_user_id: ownerUserId,
        status: 'draft',
      })
      .select('id')
      .single();

    if (rcError || !rallyingCry) {
      onProgress?.({ index: 0, status: 'error', label: 'Rallying Cry' });
      return {
        success: false,
        error: `Failed to create Rallying Cry: ${rcError?.message || 'Unknown error'}`,
      };
    }

    onProgress?.({ index: 0, status: 'success', label: 'Rallying Cry' });
    const rallyingCryId = rallyingCry.id;
    const doIds: string[] = [];
    const siIds: string[] = [];
    let taskCount = 0;

    // 2. Create Defining Objectives
    for (let i = 0; i < data.definingObjectives.length; i++) {
      const do_ = data.definingObjectives[i];
      const progressIndex = i + 1;

      console.log(`Creating DO #${i + 1}:`, {
        title: do_.title,
        owner: do_.ownerName || '(importing user)',
        siCount: do_.strategicInitiatives.length,
      });

      onProgress?.({ index: progressIndex, status: 'loading', label: do_.title });

      const doOwnerId = await findUserByName(do_.ownerName || '', ownerUserId);
      const hypothesisHtml = do_.definition ? `<p>${do_.definition}</p>` : null;

      const { data: createdDO, error: doError } = await supabase
        .from('rc_defining_objectives')
        .insert({
          rallying_cry_id: rallyingCryId,
          title: do_.title,
          hypothesis: hypothesisHtml,
          owner_user_id: doOwnerId,
          status: 'draft',
          health: 'on_track',
          confidence_pct: 50,
          weight_pct: 100,
          display_order: i,
        })
        .select('id')
        .single();

      if (doError || !createdDO) {
        console.error(`Failed to create DO #${i + 1} "${do_.title}":`, doError);
        onProgress?.({ index: progressIndex, status: 'error', label: do_.title });
        continue;
      }

      console.log(`Created DO #${i + 1} "${do_.title}" with ID:`, createdDO.id);
      onProgress?.({ index: progressIndex, status: 'success', label: do_.title });
      doIds.push(createdDO.id);

      // 3. Create metric for this DO
      if (do_.primarySuccessMetric) {
        const { error: metricError } = await supabase
          .from('rc_do_metrics')
          .insert({
            defining_objective_id: createdDO.id,
            name: do_.primarySuccessMetric,
            type: 'lagging',
            direction: 'up',
            display_order: 0,
          });

        if (metricError) {
          console.error(`Failed to create metric for DO #${i + 1}:`, metricError);
        }
      }

      // 4. Create Strategic Initiatives
      for (let j = 0; j < do_.strategicInitiatives.length; j++) {
        const si = do_.strategicInitiatives[j];
        const siOwnerId = await findUserByName(si.ownerName || '', ownerUserId);

        let descriptionHtml = '';
        if (si.successMetric) {
          descriptionHtml += `<p><strong>Success Metric:</strong> ${si.successMetric.replace(/\n/g, '<br/>')}</p>`;
        }
        if (si.benchmark) {
          descriptionHtml += `<p><strong>Benchmark:</strong> ${si.benchmark}</p>`;
        }
        if (si.bullets.length > 0) {
          descriptionHtml +=
            '<ul>' + si.bullets.map(b => `<li>${b}</li>`).join('') + '</ul>';
        } else if (si.description) {
          descriptionHtml += `<p>${si.description}</p>`;
        }

        const endDate = parseDate(si.estimatedCompletion);

        const { data: createdSI, error: siError } = await supabase
          .from('rc_strategic_initiatives')
          .insert({
            defining_objective_id: createdDO.id,
            title: si.title,
            description: descriptionHtml || null,
            owner_user_id: siOwnerId,
            status: 'draft',
            end_date: endDate || null,
            display_order: j,
          })
          .select('id')
          .single();

        if (siError || !createdSI) {
          console.error(`Failed to create SI "${si.title}":`, siError);
          continue;
        }

        siIds.push(createdSI.id);

        // 5. Create Tasks for this SI
        for (let k = 0; k < si.tasks.length; k++) {
          const task = si.tasks[k];
          const taskOwnerId = await findUserByName(
            task.ownerName || '',
            ownerUserId
          );

          const { error: taskError } = await supabase
            .from('rc_tasks')
            .insert({
              strategic_initiative_id: createdSI.id,
              title: task.title,
              completion_criteria: task.completionCriteria || null,
              owner_user_id: taskOwnerId,
              start_date: parseDate(task.startDate) || null,
              target_delivery_date:
                parseDate(task.adjustedDeliveryDate) ||
                parseDate(task.targetDeliveryDate) ||
                null,
              actual_delivery_date: parseDate(task.actualDeliveryDate) || null,
              notes: task.notes || null,
              status: normalizeTaskStatus(task.status),
              display_order: k,
            });

          if (taskError) {
            console.error(
              `Failed to create task "${task.title}" for SI "${si.title}":`,
              taskError
            );
          } else {
            taskCount++;
          }
        }
      }
    }

    return { success: true, rallyingCryId, doIds, siIds, taskCount };
  } catch (error: unknown) {
    return {
      success: false,
      error: `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
