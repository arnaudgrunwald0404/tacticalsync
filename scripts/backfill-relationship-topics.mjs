#!/usr/bin/env node

/**
 * Backfill relationship topics from existing AI-generated prep notes.
 *
 * This one-time script iterates over all cos_one_on_one_prep rows with
 * source = 'ai_generated' and extracts structured topics using Claude Haiku.
 * Results are upserted into cos_relationship_topics and cos_prep_topic_mentions.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ANTHROPIC_API_KEY=... node scripts/backfill-relationship-topics.mjs
 *
 * Options:
 *   --dry-run   Print what would be extracted without writing to DB
 *   --limit N   Process at most N prep notes (default: all)
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ANTHROPIC_API_KEY) {
  console.error('Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY');
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');
const limitIdx = process.argv.indexOf('--limit');
const limit = limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1], 10) : null;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const VALID_CATEGORIES = new Set([
  'blocker', 'escalation', 'project', 'goal',
  'feedback', 'development', 'personal', 'general',
]);
const VALID_SENTIMENTS = new Set(['positive', 'negative', 'neutral', 'mixed']);

async function extractTopics(content) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-20250414',
      max_tokens: 600,
      system: `Extract 3-8 discussion topics from the 1:1 prep brief below.

Return a JSON array where each element has:
- "topic": a short normalized label (e.g. "Q3 hiring plan", "platform rewrite timeline"). Normalize similar topics to the same label.
- "category": one of "blocker", "escalation", "project", "goal", "feedback", "development", "personal", "general"
- "sentiment": one of "positive", "negative", "neutral", "mixed"
- "snippet": a 1-sentence excerpt from the brief that mentions this topic

Return ONLY the JSON array, no markdown fences or other text.`,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  const cleaned = text.replace(/```json?\n?/g, '').replace(/```\n?$/g, '').trim();
  return JSON.parse(cleaned);
}

async function main() {
  console.log(`Backfill relationship topics${dryRun ? ' (DRY RUN)' : ''}`);
  console.log(`Supabase URL: ${SUPABASE_URL}`);

  // Find preps that haven't been processed yet (no topic mentions)
  let query = supabase
    .from('cos_one_on_one_prep')
    .select('id, user_id, team_member_id, content, prep_date, source')
    .eq('source', 'ai_generated')
    .eq('status', 'ready')
    .order('prep_date', { ascending: false });

  if (limit) {
    query = query.limit(limit);
  }

  const { data: preps, error: prepErr } = await query;
  if (prepErr) {
    console.error('Failed to fetch preps:', prepErr.message);
    process.exit(1);
  }

  console.log(`Found ${preps.length} AI-generated preps`);

  // Filter out preps that already have topic mentions
  const prepIds = preps.map(p => p.id);
  const { data: existingMentions } = await supabase
    .from('cos_prep_topic_mentions')
    .select('prep_id')
    .in('prep_id', prepIds);

  const processedPrepIds = new Set((existingMentions ?? []).map(m => m.prep_id));
  const toProcess = preps.filter(p => !processedPrepIds.has(p.id));

  console.log(`${toProcess.length} preps need processing (${processedPrepIds.size} already done)`);

  let processed = 0;
  let topicsCreated = 0;
  let topicsUpdated = 0;
  let errors = 0;

  for (const prep of toProcess) {
    try {
      const topics = await extractTopics(prep.content);
      console.log(`  [${++processed}/${toProcess.length}] Prep ${prep.id} (${prep.prep_date}): ${topics.length} topics`);

      if (dryRun) {
        for (const t of topics) {
          console.log(`    - ${t.topic} (${t.category}, ${t.sentiment})`);
        }
        continue;
      }

      for (const t of topics) {
        if (!t.topic || typeof t.topic !== 'string') continue;

        const category = VALID_CATEGORIES.has(t.category) ? t.category : 'general';
        const sentiment = VALID_SENTIMENTS.has(t.sentiment) ? t.sentiment : 'neutral';
        const topicLabel = t.topic.trim().toLowerCase().slice(0, 200);

        // Check existing
        const { data: existing } = await supabase
          .from('cos_relationship_topics')
          .select('id, mention_count')
          .eq('user_id', prep.user_id)
          .eq('team_member_id', prep.team_member_id)
          .ilike('topic', topicLabel)
          .maybeSingle();

        let topicId;

        if (existing) {
          await supabase
            .from('cos_relationship_topics')
            .update({
              last_mentioned_at: prep.prep_date,
              mention_count: existing.mention_count + 1,
              sentiment,
              context_snippet: (t.snippet ?? '').slice(0, 500),
              prep_id: prep.id,
            })
            .eq('id', existing.id);

          topicId = existing.id;
          topicsUpdated++;
        } else {
          const { data: inserted } = await supabase
            .from('cos_relationship_topics')
            .insert({
              user_id: prep.user_id,
              team_member_id: prep.team_member_id,
              prep_id: prep.id,
              topic: topicLabel,
              category,
              sentiment,
              first_mentioned_at: prep.prep_date,
              last_mentioned_at: prep.prep_date,
              mention_count: 1,
              status: 'active',
              context_snippet: (t.snippet ?? '').slice(0, 500),
            })
            .select('id')
            .single();

          topicId = inserted?.id;
          topicsCreated++;
        }

        if (topicId) {
          await supabase
            .from('cos_prep_topic_mentions')
            .upsert({
              prep_id: prep.id,
              topic_id: topicId,
              snippet: (t.snippet ?? '').slice(0, 500),
            }, { onConflict: 'prep_id,topic_id' });
        }
      }

      // Rate limit: ~1 request per second to avoid API throttling
      await new Promise(r => setTimeout(r, 1000));

    } catch (err) {
      console.error(`  ERROR on prep ${prep.id}: ${err.message}`);
      errors++;
    }
  }

  console.log('\nDone!');
  console.log(`  Processed: ${processed}`);
  console.log(`  Topics created: ${topicsCreated}`);
  console.log(`  Topics updated: ${topicsUpdated}`);
  console.log(`  Errors: ${errors}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
