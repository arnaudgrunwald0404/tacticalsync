import { useState, useCallback, useRef } from 'react';
import { format } from 'date-fns';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AiPrioritySuggestion {
  text: string;
  source: string;        // e.g. "priorities", "email", "calendar", "slack"
  reasoning: string;      // why this was surfaced
}

export interface DciBriefData {
  /** Raw markdown content of the brief */
  markdown: string;
  /** Parsed structured sections */
  dailyPriorities: AiPrioritySuggestion[];
  weeklyPriorities: AiPrioritySuggestion[];
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
  /** The directory handle, so the component can re-use it */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dirHandleRef: React.MutableRefObject<any>;
}

// ── Markdown parser ─────────────────────────────────────────────────────────

function parseSection(md: string, heading: string): string | null {
  // Match ## heading through the next ## or end of string
  const re = new RegExp(`## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`, 'i');
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
  // Strip markdown bold prefix if present
  return section.replace(/^\*\*[^*]+\*\*\s*/, '').trim() || section.trim();
}

function parseBriefMarkdown(md: string): Omit<DciBriefData, 'source'> {
  const dailySection = parseSection(md, "Today's Top 3 Priorities");
  const weeklySection = parseSection(md, 'Weekly Focus');

  return {
    markdown: md,
    dailyPriorities: parsePriorities(dailySection),
    weeklyPriorities: parsePriorities(weeklySection),
    topicSuggestion: parseTopicSuggestion(md),
    calendarSection: parseSection(md, "Today's Calendar"),
    emailSection: parseSection(md, 'Email Signals'),
    slackSection: parseSection(md, 'Slack Signals'),
    generatedAt: new Date().toISOString(),
  };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useDciBrief(): UseDciBriefReturn {
  const [brief, setBrief] = useState<DciBriefData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dirHandleRef = useRef<any>(null);

  const loadFromLocalFile = useCallback(async (): Promise<DciBriefData | null> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fsApi = (window as any).showDirectoryPicker;
    if (!fsApi) return null;

    // Ask user to pick the dci-briefs folder (or reuse previous handle)
    if (!dirHandleRef.current) {
      try {
        dirHandleRef.current = await fsApi({ id: 'dci-briefs', mode: 'read' });
      } catch {
        // user cancelled
        return null;
      }
    }

    if (!dirHandleRef.current) return null;

    const today = format(new Date(), 'yyyy-MM-dd');
    try {
      const fileHandle = await dirHandleRef.current.getFileHandle(`${today}.md`);
      const file = await fileHandle.getFile();
      const content = await file.text();
      const parsed = parseBriefMarkdown(content);
      // Use file's last modified as generatedAt
      parsed.generatedAt = new Date(file.lastModified).toISOString();
      return { ...parsed, source: 'local' };
    } catch {
      // No file for today — reset handle so user can re-pick if needed
      dirHandleRef.current = null;
      return null;
    }
  }, []);

  const loadBrief = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 1. Try local filesystem (same pattern as 1:1 prep)
      const localBrief = await loadFromLocalFile();
      if (localBrief) {
        setBrief(localBrief);
        return;
      }

      // 2. No local file found
      setError('No DCI brief found for today. Generate one with Claude Code, then open the dci-briefs folder.');
      setBrief(null);
    } catch (err) {
      console.error('DCI brief load error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load DCI brief');
    } finally {
      setIsLoading(false);
    }
  }, [loadFromLocalFile]);

  const refreshBrief = useCallback(async () => {
    // Force re-read from the already-selected directory
    if (dirHandleRef.current) {
      setIsLoading(true);
      setError(null);
      try {
        const today = format(new Date(), 'yyyy-MM-dd');
        const fileHandle = await dirHandleRef.current.getFileHandle(`${today}.md`);
        const file = await fileHandle.getFile();
        const content = await file.text();
        const parsed = parseBriefMarkdown(content);
        parsed.generatedAt = new Date(file.lastModified).toISOString();
        setBrief({ ...parsed, source: 'local' });
      } catch {
        setError('No updated brief found. Re-generate with Claude Code.');
      } finally {
        setIsLoading(false);
      }
    } else {
      await loadBrief();
    }
  }, [loadBrief]);

  return {
    brief,
    isLoading,
    error,
    loadBrief,
    refreshBrief,
    dirHandleRef,
  };
}
