/**
 * Import RCDO to Database
 * Saves parsed RCDO data to Supabase
 */

import { supabase } from '@/integrations/supabase/client';
import type { ParsedRCDO } from './markdownRCDOParser';

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
}

export type ImportProgressCallback = (progress: { 
  index: number; 
  status: 'pending' | 'loading' | 'success' | 'error';
  label?: string;
}) => void;

/**
 * Imports parsed RCDO data into Supabase
 */
export async function importRCDOToDatabase(
  data: ParsedRCDO,
  options: ImportRCDOOptions,
  onProgress?: ImportProgressCallback
): Promise<ImportRCDOResult> {
  const { cycleId, ownerUserId } = options;

  try {
    // 0. Check for existing Rallying Cry and delete it (cascade will delete DOs, SIs, metrics)
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
        // Continue anyway - the cascade delete might have worked partially
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
        status: 'draft'
      })
      .select('id')
      .single();

    if (rcError || !rallyingCry) {
      onProgress?.({ index: 0, status: 'error', label: 'Rallying Cry' });
      return {
        success: false,
        error: `Failed to create Rallying Cry: ${rcError?.message || 'Unknown error'}`
      };
    }

    onProgress?.({ index: 0, status: 'success', label: 'Rallying Cry' });
    const rallyingCryId = rallyingCry.id;
    const doIds: string[] = [];
    const siIds: string[] = [];

    // 2. Create Defining Objectives
    for (let i = 0; i < data.definingObjectives.length; i++) {
      const do_ = data.definingObjectives[i];
      const progressIndex = i + 1; // +1 because index 0 is Rallying Cry

      console.log(`Creating DO #${i + 1}:`, {
        title: do_.title,
        definition: do_.definition?.substring(0, 50) + '...',
        siCount: do_.strategicInitiatives.length,
        metric: do_.primarySuccessMetric?.substring(0, 50) + '...'
      });

      onProgress?.({ index: progressIndex, status: 'loading', label: do_.title });

      // Convert definition to HTML
      const hypothesisHtml = do_.definition ? `<p>${do_.definition}</p>` : null;

      const { data: createdDO, error: doError } = await supabase
        .from('rc_defining_objectives')
        .insert({
          rallying_cry_id: rallyingCryId,
          title: do_.title,
          hypothesis: hypothesisHtml,
          owner_user_id: ownerUserId,
          status: 'draft',
          health: 'on_track',
          confidence_pct: 50,
          weight_pct: 100,
          display_order: i
        })
        .select('id')
        .single();

      if (doError || !createdDO) {
        console.error(`❌ Failed to create DO #${i + 1} "${do_.title}":`, doError);
        onProgress?.({ index: progressIndex, status: 'error', label: do_.title });
        continue;
      }

      console.log(`✅ Created DO #${i + 1} "${do_.title}" with ID:`, createdDO.id);
      onProgress?.({ index: progressIndex, status: 'success', label: do_.title });

      doIds.push(createdDO.id);

      // 3. Create metric for this DO (if primary success metric exists)
      if (do_.primarySuccessMetric) {
        const { error: metricError } = await supabase
          .from('rc_do_metrics')
          .insert({
            defining_objective_id: createdDO.id,
            name: do_.primarySuccessMetric,
            type: 'lagging',
            direction: 'up',
            display_order: 0
          });

        if (metricError) {
          console.error(`Failed to create metric for DO #${i + 1}:`, metricError);
        }
      }

      // 4. Create Strategic Initiatives for this DO
      for (let j = 0; j < do_.strategicInitiatives.length; j++) {
        const si = do_.strategicInitiatives[j];

        // Convert bullets to HTML list or use description as paragraph
        let descriptionHtml = '';
        if (si.bullets.length > 0) {
          descriptionHtml = '<ul>' + si.bullets.map(b => `<li>${b}</li>`).join('') + '</ul>';
        } else if (si.description) {
          descriptionHtml = `<p>${si.description}</p>`;
        }

        const { data: createdSI, error: siError } = await supabase
          .from('rc_strategic_initiatives')
          .insert({
            defining_objective_id: createdDO.id,
            title: si.title,
            description: descriptionHtml,
            owner_user_id: ownerUserId,
            status: 'draft',
            display_order: j
          })
          .select('id')
          .single();

        if (siError || !createdSI) {
          console.error(`Failed to create SI "${si.title}":`, siError);
          continue;
        }

        siIds.push(createdSI.id);
      }
    }

    return {
      success: true,
      rallyingCryId,
      doIds,
      siIds
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Import failed: ${error.message || 'Unknown error'}`
    };
  }
}

