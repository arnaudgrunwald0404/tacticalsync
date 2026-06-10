import { useState, useCallback, useEffect } from 'react';
import { format, startOfWeek } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AiPrioritySuggestion {
  text: string;
  source: string;        // e.g. "priorities", "email", "calendar", "slack"
  reasoning: string;      // why this was surfaced
  activities: string[];   // 1-3 bullet points (weekly objectives only)
  action: string;         // specific action (daily priorities only)
}

export interface DciBriefData {
  /** Raw markdown content of today's brief */
  markdown: string;
  /** Today's urgent priorities — what needs attention right now */
  dailyPriorities: AiPrioritySuggestion[];
  /** Weekly priorities — set Monday, what to accomplish by end of week */
  weeklyPriorities: AiPrioritySuggestion[];
  /** Whether this is a Monday brief (weekly planning) or a daily refresh */
  isMonday: boolean;
  /** The date of the Monday file that provided the weekly priorities */
  weeklySourceDate: string | null;
  topicSuggestion: string | null;
  calendarSection: string | null;
  emailSection: string | null;
  slackSection: string | null;
  generatedAt: string;
  source: 'api' | 'none';
}

interface UseDciBriefReturn {
  brief: DciBriefData | null;
  isLoading: boolean;
  error: string | null;
  refreshBrief: () => Promise<void>;
}

// ── Markdown parser ─────────────────────────────────────────────────────────

function parseSection(md: string, heading: string): string | null {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`## ${escaped}\\n([\\s\\S]*?)(?=\\n## |$)`, 'i');
  const match = md.match(re);
  return match ? match[1].trim() : null;
}

function parsePriorities(section: string | null): AiPrioritySuggestion[] {
  if (!section) return [];
  const results: AiPrioritySuggestion[] = [];

  // Split on ### numbered headings like "### 1. Some priority"
  const blocks = section.split(/### \d+\.\s+/).filter(Boolean);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    let text = lines[0]?.trim() ?? '';
    if (!text) continue;

    // Strip "Objective: " prefix if present (weekly objectives)
    text = text.replace(/^Objective:\s*/i, '');

    let source = 'priorities';
    let reasoning = '';
    let action = '';
    const activities: string[] = [];
    let inActivities = false;

    for (const line of lines.slice(1)) {
      const trimmed = line.trim();
      // Strip leading bullet (- or *) so metadata lines like "- **Source:**" are recognized
      const stripped = trimmed.replace(/^[-*]\s+/, '');

      // "Activities:" header starts the bullet list
      if (/^Activities:/i.test(trimmed)) { inActivities = true; continue; }

      const srcMatch = stripped.match(/^\*?\*?Source:\*?\*?\s*(.+)/i);
      if (srcMatch) {
        inActivities = false;
        const srcText = srcMatch[1].toLowerCase();
        if (srcText.includes('calendar')) source = 'calendar';
        else if (srcText.includes('email')) source = 'email';
        else if (srcText.includes('slack')) source = 'slack';
        else if (srcText.includes('dci') || srcText.includes('history')) source = 'dci_history';
        else source = 'priorities';
        continue;
      }

      const whyMatch = stripped.match(/^\*?\*?Why:\*?\*?\s*(.+)/i);
      if (whyMatch) { inActivities = false; reasoning = whyMatch[1].trim(); continue; }

      const actionMatch = stripped.match(/^\*?\*?Action:\*?\*?\s*(.+)/i);
      if (actionMatch) { inActivities = false; action = actionMatch[1].trim(); continue; }

      // Activity bullet points (while inside Activities block)
      if (inActivities && /^[-*]\s+/.test(trimmed)) {
        activities.push(stripped);
      }
    }

    results.push({ text, source, reasoning, activities, action });
  }

  return results;
}

function parseTopicSuggestion(md: string): string | null {
  const section = parseSection(md, 'Suggested DCI Topic');
  if (!section) return null;
  return section.replace(/^\*\*[^*]+\*\*\s*/, '').trim() || section.trim();
}

function parseBriefMarkdown(md: string): Omit<DciBriefData, 'source'> {
  // Try both heading conventions for daily priorities
  const dailySection =
    parseSection(md, "Today's Focus") ??
    parseSection(md, "Today's Top 3 Priorities") ??
    parseSection(md, "Today's Priorities");

  // Try all heading conventions for weekly priorities/objectives
  const weeklySection =
    parseSection(md, 'Weekly Objectives') ??
    parseSection(md, 'Weekly Priorities') ??
    parseSection(md, 'Weekly Focus') ??
    parseSection(md, "This Week's Priorities");

  const today = new Date();
  const isMonday = today.getDay() === 1;

  return {
    markdown: md,
    dailyPriorities: parsePriorities(dailySection),
    weeklyPriorities: parsePriorities(weeklySection),
    isMonday,
    weeklySourceDate: null, // filled in by the hook
    topicSuggestion: parseTopicSuggestion(md),
    calendarSection: parseSection(md, "Today's Calendar"),
    emailSection: parseSection(md, 'Email Signals'),
    slackSection: parseSection(md, 'Slack Signals'),
    generatedAt: new Date().toISOString(),
  };
}

function getMondayOfWeek(): string {
  const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
  return format(monday, 'yyyy-MM-dd');
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useDciBrief(): UseDciBriefReturn {
  const [brief, setBrief] = useState<DciBriefData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Load from Supabase (cos_dci_logs.brief_markdown) ──────────────────
  const loadFromSupabase = useCallback(async (): Promise<DciBriefData | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const today = format(new Date(), 'yyyy-MM-dd');
      const mondayDate = getMondayOfWeek();
      const isMonday = today === mondayDate;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;

      // Fetch today's brief
      const { data: todayLog } = await db
        .from('cos_dci_logs')
        .select('brief_markdown, brief_generated_at, date')
        .eq('user_id', user.id)
        .eq('date', today)
        .not('brief_markdown', 'is', null)
        .maybeSingle();

      if (!todayLog?.brief_markdown) return null;

      const parsed = parseBriefMarkdown(todayLog.brief_markdown);
      parsed.generatedAt = todayLog.brief_generated_at ?? new Date().toISOString();
      parsed.weeklySourceDate = today;

      // On non-Monday: if today's brief has no weekly section, try Monday's
      if (!isMonday && parsed.weeklyPriorities.length === 0) {
        const { data: mondayLog } = await db
          .from('cos_dci_logs')
          .select('brief_markdown')
          .eq('user_id', user.id)
          .eq('date', mondayDate)
          .not('brief_markdown', 'is', null)
          .maybeSingle();

        if (mondayLog?.brief_markdown) {
          const mondayParsed = parseBriefMarkdown(mondayLog.brief_markdown);
          if (mondayParsed.weeklyPriorities.length > 0) {
            parsed.weeklyPriorities = mondayParsed.weeklyPriorities;
            parsed.weeklySourceDate = mondayDate;
          }
        }
      }

      return { ...parsed, source: 'api' };
    } catch {
      return null;
    }
  }, []);

  // Auto-load from Supabase on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const sbBrief = await loadFromSupabase();
      if (!cancelled && sbBrief) {
        setBrief(sbBrief);
      }
      if (!cancelled) setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [loadFromSupabase]);

  const refreshBrief = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const sbBrief = await loadFromSupabase();
      if (sbBrief) { setBrief(sbBrief); setIsLoading(false); return; }
      setError('No updated brief found.');
    } catch {
      setError('Failed to refresh brief.');
    } finally {
      setIsLoading(false);
    }
  }, [loadFromSupabase]);

  return {
    brief,
    isLoading,
    error,
    refreshBrief,
  };
}
