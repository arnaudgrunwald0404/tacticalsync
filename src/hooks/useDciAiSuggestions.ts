import { useState, useCallback, useRef } from 'react';
import { format, startOfWeek } from 'date-fns';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AiPrioritySuggestion {
  text: string;
  source: string;        // e.g. "priorities", "email", "calendar", "slack"
  reasoning: string;      // why this was surfaced
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
  source: 'local' | 'api' | 'none';
}

interface UseDciBriefReturn {
  brief: DciBriefData | null;
  isLoading: boolean;
  error: string | null;
  loadBrief: () => Promise<void>;
  refreshBrief: () => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dirHandleRef: React.MutableRefObject<any>;
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
    const text = lines[0]?.trim() ?? '';
    if (!text) continue;

    let source = 'priorities';
    let reasoning = '';

    for (const line of lines) {
      const srcMatch = line.match(/\*\*Source:\*\*\s*(.+)/i);
      if (srcMatch) {
        const srcText = srcMatch[1].toLowerCase();
        if (srcText.includes('calendar')) source = 'calendar';
        else if (srcText.includes('email')) source = 'email';
        else if (srcText.includes('slack')) source = 'slack';
        else if (srcText.includes('dci') || srcText.includes('history')) source = 'dci_history';
        else source = 'priorities';
      }
      const whyMatch = line.match(/\*\*Why:\*\*\s*(.+)/i);
      if (whyMatch) reasoning = whyMatch[1].trim();
    }

    results.push({ text, source, reasoning });
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

  // Try both heading conventions for weekly priorities
  const weeklySection =
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

// ── File reading helpers ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tryReadFile(dirHandle: any, filename: string): Promise<{ content: string; lastModified: number } | null> {
  try {
    const fileHandle = await dirHandle.getFileHandle(filename);
    const file = await fileHandle.getFile();
    const content = await file.text();
    return { content, lastModified: file.lastModified };
  } catch {
    return null;
  }
}

/**
 * Get the Monday date string for the current week.
 */
function getMondayOfWeek(): string {
  const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
  return format(monday, 'yyyy-MM-dd');
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useDciBrief(): UseDciBriefReturn {
  const [brief, setBrief] = useState<DciBriefData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dirHandleRef = useRef<any>(null);

  const loadFromLocalFiles = useCallback(async (): Promise<DciBriefData | null> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fsApi = (window as any).showDirectoryPicker;
    if (!fsApi) return null;

    if (!dirHandleRef.current) {
      try {
        dirHandleRef.current = await fsApi({ id: 'dci-briefs', mode: 'read' });
      } catch {
        return null;
      }
    }

    if (!dirHandleRef.current) return null;

    const today = format(new Date(), 'yyyy-MM-dd');
    const mondayDate = getMondayOfWeek();
    const isMonday = today === mondayDate;

    // 1. Read today's brief
    const todayFile = await tryReadFile(dirHandleRef.current, `${today}.md`);

    if (!todayFile) {
      dirHandleRef.current = null;
      return null;
    }

    const parsed = parseBriefMarkdown(todayFile.content);
    parsed.generatedAt = new Date(todayFile.lastModified).toISOString();
    parsed.weeklySourceDate = today;

    // 2. On non-Monday days, if today's file has no weekly section,
    //    fall back to Monday's file for the weekly priorities
    if (!isMonday && parsed.weeklyPriorities.length === 0) {
      const mondayFile = await tryReadFile(dirHandleRef.current, `${mondayDate}.md`);
      if (mondayFile) {
        const mondayParsed = parseBriefMarkdown(mondayFile.content);
        if (mondayParsed.weeklyPriorities.length > 0) {
          parsed.weeklyPriorities = mondayParsed.weeklyPriorities;
          parsed.weeklySourceDate = mondayDate;
        }
      }
    }

    return { ...parsed, source: 'local' };
  }, []);

  const loadBrief = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const localBrief = await loadFromLocalFiles();
      if (localBrief) {
        setBrief(localBrief);
        return;
      }

      setError('No DCI brief found for today. Generate one with Claude Code, then open the dci-briefs folder.');
      setBrief(null);
    } catch (err) {
      console.error('DCI brief load error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load DCI brief');
    } finally {
      setIsLoading(false);
    }
  }, [loadFromLocalFiles]);

  const refreshBrief = useCallback(async () => {
    if (dirHandleRef.current) {
      setIsLoading(true);
      setError(null);
      try {
        const refreshed = await loadFromLocalFiles();
        if (refreshed) {
          setBrief(refreshed);
        } else {
          setError('No updated brief found. Re-generate with Claude Code.');
        }
      } catch {
        setError('Failed to refresh brief.');
      } finally {
        setIsLoading(false);
      }
    } else {
      await loadBrief();
    }
  }, [loadBrief, loadFromLocalFiles]);

  return {
    brief,
    isLoading,
    error,
    loadBrief,
    refreshBrief,
    dirHandleRef,
  };
}
