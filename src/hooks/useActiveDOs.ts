import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { DOHashtagOption } from '@/types/rcdo';
import { getFullNameForAvatar } from '@/lib/nameUtils';

/**
 * Fetch active DOs for hashtag selection in meeting priorities (company-wide)
 */
export function useActiveDOs() {
  const [dos, setDos] = useState<DOHashtagOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActiveDOs = async () => {
      try {
        setLoading(true);

        // Get active cycle (company-wide)
        const { data: activeCycle } = await supabase
          .from('rc_cycles')
          .select('id')
          .eq('status', 'active')
          .maybeSingle();

        if (!activeCycle) {
          setDos([]);
          setLoading(false);
          return;
        }

        // Get rallying cry for cycle
        const { data: rallyingCry } = await supabase
          .from('rc_rallying_cries')
          .select('id, title')
          .eq('cycle_id', activeCycle.id)
          .maybeSingle();

        if (!rallyingCry) {
          setDos([]);
          setLoading(false);
          return;
        }

        // Get DOs for rallying cry
        const { data: dosData } = await supabase
          .from('rc_defining_objectives')
          .select(`
            id,
            title,
            status,
            health,
            owner:profiles!owner_user_id(first_name, last_name, full_name)
          `)
          .eq('rallying_cry_id', rallyingCry.id)
          .in('status', ['active', 'draft']);

        if (dosData) {
          const doOptions: DOHashtagOption[] = dosData.map((doItem: any) => ({
            id: doItem.id,
            title: doItem.title,
            status: doItem.status,
            health: doItem.health,
            owner_name: doItem.owner
              ? getFullNameForAvatar(
                  doItem.owner.first_name,
                  doItem.owner.last_name,
                  doItem.owner.full_name
                )
              : undefined,
            rallying_cry_title: rallyingCry.title,
          }));

          setDos(doOptions);
        } else {
          setDos([]);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchActiveDOs();
  }, []);

  return { dos, loading };
}

