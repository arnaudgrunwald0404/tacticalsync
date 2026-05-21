/**
 * Markdown RCDO Parser
 * Parses a markdown file containing Rallying Cry, Defining Objectives,
 * Strategic Initiatives, and Tasks.
 *
 * Markdown format mirrors the Excel DO tabs:
 *
 * > **Rallying Cry text**
 *
 * ## DO #1 — Title (Owner: Name)
 * **Definition**
 * text
 * **Primary Success Metric**
 * * metric text
 *
 * ### Strategic Initiatives
 *
 * #### SI 1 — Title (Owner: Name)
 * **Success Metric:** metric text (multi-line allowed)
 * **Benchmark:** benchmark text
 * **Stakeholders:** Name1, Name2
 * **Estimated Completion:** 2026-06-30
 * **Status:** On Track
 * **Progress:** 50%
 *
 * **Tasks**
 * | # | Task | Completion Criteria | Owner | Start Date | Adj. Start | Target Date | Adj. Target | Actual Date | Notes | Status |
 * |---|------|---------------------|-------|------------|------------|-------------|-------------|-------------|-------|--------|
 * | 1.1 | Do the thing | Thing is done | Derek | 2025-12-29 | | 2026-01-16 | | 2026-01-16 | some note | Completed |
 */

export interface ParsedTask {
  number: string;
  title: string;
  completionCriteria?: string;
  ownerName?: string;
  startDate?: string;
  adjustedStartDate?: string;
  targetDeliveryDate?: string;
  adjustedDeliveryDate?: string;
  actualDeliveryDate?: string;
  notes?: string;
  status?: string;
}

export interface ParsedSI {
  number: number;
  title: string;
  description?: string;
  bullets: string[];
  ownerName?: string;
  successMetric?: string;
  benchmark?: string;
  stakeholders?: string;
  estimatedCompletion?: string;
  status?: string;
  progressPct?: number;
  tasks: ParsedTask[];
}

export interface ParsedDO {
  number: number;
  title: string;
  definition?: string;
  primarySuccessMetric?: string;
  status?: string;
  strategicInitiatives: ParsedSI[];
  ownerName?: string;
}

export interface ParsedRCDO {
  rallyingCry: string;
  definingObjectives: ParsedDO[];
}

function cleanCell(val: string): string {
  return val.replace(/^\s+|\s+$/g, '').replace(/^—$/, '');
}

function parseTableRow(line: string): string[] {
  return line.split('|').slice(1, -1).map(c => cleanCell(c));
}

function isTableSeparator(line: string): boolean {
  return /^\|[\s\-:|]+\|$/.test(line.trim());
}

/**
 * Parses markdown content into structured RCDO data
 */
export function parseMarkdownRCDO(markdown: string): ParsedRCDO {
  const lines = markdown.split('\n');

  let rallyingCry = '';
  const definingObjectives: ParsedDO[] = [];

  let currentDO: ParsedDO | null = null;
  let currentSI: ParsedSI | null = null;
  let currentSection:
    | 'none'
    | 'rc'
    | 'do-definition'
    | 'do-metric'
    | 'si-list'
    | 'si-meta'
    | 'si-success-metric'
    | 'si-bullets'
    | 'si-tasks' = 'none';
  let taskHeaderCols: string[] | null = null;

  const saveSI = () => {
    if (currentDO && currentSI) {
      currentDO.strategicInitiatives.push(currentSI);
    }
    currentSI = null;
    taskHeaderCols = null;
  };

  const saveDO = () => {
    saveSI();
    if (currentDO) {
      definingObjectives.push(currentDO);
    }
    currentDO = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) continue;

    // --- Rallying Cry ---
    const rcMatch = line.match(/^>\s*\*\*(.+)\*\*\s*$/);
    if (rcMatch) {
      rallyingCry = rcMatch[1].trim();
      currentSection = 'rc';
      continue;
    }

    // --- DO header ---
    const doHeaderMatch = line.match(/^##\s+DO\s+#?(\d+)\s*[—–\-:]\s*(.+)$/i);
    if (doHeaderMatch) {
      saveDO();

      let titleText = doHeaderMatch[2].trim();
      let ownerName: string | undefined;

      const ownerMatch = titleText.match(/^(.+?)\s*\(Owner:\s*([^)]+)\)\s*$/i);
      if (ownerMatch) {
        titleText = ownerMatch[1].trim();
        ownerName = ownerMatch[2].trim();
      }

      currentDO = {
        number: parseInt(doHeaderMatch[1]),
        title: titleText,
        definition: '',
        primarySuccessMetric: '',
        strategicInitiatives: [],
        ownerName,
      };
      currentSection = 'none';
      continue;
    }

    // --- DO sections ---
    if (line === '**Definition**' && currentDO) {
      currentSection = 'do-definition';
      continue;
    }

    if (line === '**Primary Success Metric**' && currentDO) {
      currentSection = 'do-metric';
      continue;
    }

    if (line === '### Strategic Initiatives' && currentDO) {
      currentSection = 'si-list';
      continue;
    }

    // DO-level status
    const doStatusMatch = currentDO && line.match(/^\*\*Status\s*:\*\*\s*(.*)$/i);
    if (doStatusMatch && currentDO && currentSection !== 'si-meta') {
      currentDO.status = doStatusMatch[1].trim();
      continue;
    }

    // Read definition text
    if (currentSection === 'do-definition' && currentDO && !line.startsWith('**')) {
      currentDO.definition = currentDO.definition
        ? currentDO.definition + ' ' + line
        : line;
      continue;
    }

    // Read metric text
    if (currentSection === 'do-metric' && currentDO && line.startsWith('*')) {
      const metricText = line.replace(/^\*\s*/, '').trim();
      currentDO.primarySuccessMetric = currentDO.primarySuccessMetric
        ? currentDO.primarySuccessMetric + ' ' + metricText
        : metricText;
      continue;
    }

    // --- SI header (#### SI N — Title) ---
    const siHeaderMatch = line.match(
      /^(?:####\s+SI\s+(\d+)\s*[—–\-:]\s*(.+)|\d+\.\s+\*\*(.+)\*\*\s*)$/i
    );
    if (siHeaderMatch && currentDO) {
      saveSI();

      let siNum: number;
      let siTitle: string;
      if (siHeaderMatch[1] && siHeaderMatch[2]) {
        siNum = parseInt(siHeaderMatch[1]);
        siTitle = siHeaderMatch[2].trim();
      } else {
        siNum = currentDO.strategicInitiatives.length + 1;
        siTitle = (siHeaderMatch[3] || '').trim();
      }

      let ownerName: string | undefined;
      const ownerMatch = siTitle.match(/^(.+?)\s*\(Owner:\s*([^)]+)\)\s*$/i);
      if (ownerMatch) {
        siTitle = ownerMatch[1].trim();
        ownerName = ownerMatch[2].trim();
      }

      currentSI = {
        number: siNum,
        title: siTitle,
        description: '',
        bullets: [],
        ownerName,
        tasks: [],
      };
      currentSection = 'si-meta';
      continue;
    }

    // --- SI metadata fields ---
    if (currentSection === 'si-meta' && currentSI) {
      const metaMatch = line.match(
        /^\*\*(?:Success Metric|Success Metric\/Criteria)\s*:\*\*\s*(.*)$/i
      );
      if (metaMatch) {
        currentSI.successMetric = metaMatch[1].trim();
        currentSection = 'si-success-metric';
        continue;
      }

      const benchmarkMatch = line.match(/^\*\*Benchmark\s*:\*\*\s*(.*)$/i);
      if (benchmarkMatch) {
        currentSI.benchmark = benchmarkMatch[1].trim();
        continue;
      }

      const stakeholdersMatch = line.match(/^\*\*Stakeholders\s*:\*\*\s*(.*)$/i);
      if (stakeholdersMatch) {
        currentSI.stakeholders = stakeholdersMatch[1].trim();
        continue;
      }

      const completionMatch = line.match(
        /^\*\*Estimated Completion\s*:\*\*\s*(.*)$/i
      );
      if (completionMatch) {
        currentSI.estimatedCompletion = completionMatch[1].trim();
        continue;
      }

      const statusMatch = line.match(/^\*\*Status\s*:\*\*\s*(.*)$/i);
      if (statusMatch) {
        currentSI.status = statusMatch[1].trim();
        continue;
      }

      const progressMatch = line.match(/^\*\*Progress\s*:\*\*\s*(\d+)%?\s*$/i);
      if (progressMatch) {
        currentSI.progressPct = parseInt(progressMatch[1]);
        continue;
      }

      if (line === '**Tasks**') {
        currentSection = 'si-tasks';
        continue;
      }

      // Bullet points under SI
      if (line.startsWith('*') || line.startsWith('-')) {
        const bulletText = line.replace(/^[\*\-]\s*/, '').trim();
        currentSI.bullets.push(bulletText);
        continue;
      }
    }

    // Multi-line success metric continuation
    if (currentSection === 'si-success-metric' && currentSI) {
      if (line.startsWith('**')) {
        // Switch back to meta and re-process this line
        currentSection = 'si-meta';
        i--;
        continue;
      }
      currentSI.successMetric = (currentSI.successMetric || '') + '\n' + line;
      continue;
    }

    // --- SI tasks table ---
    if (currentSection === 'si-tasks' && currentSI) {
      // Table header row
      if (line.startsWith('|') && !taskHeaderCols) {
        taskHeaderCols = parseTableRow(line).map(h => h.toLowerCase());
        continue;
      }

      // Separator row
      if (isTableSeparator(line)) continue;

      // Data row
      if (line.startsWith('|') && taskHeaderCols) {
        const cells = parseTableRow(line);
        const get = (key: string) => {
          const idx = taskHeaderCols!.findIndex(h => h.includes(key));
          return idx >= 0 && idx < cells.length ? cells[idx] : undefined;
        };

        const task: ParsedTask = {
          number: get('#') || get('number') || '',
          title: get('task') || '',
          completionCriteria: get('completion') || get('criteria') || undefined,
          ownerName: get('owner') || undefined,
          startDate: get('start date') || get('start') || undefined,
          adjustedStartDate: get('adj. start') || get('adjusted start') || undefined,
          targetDeliveryDate:
            get('target date') || get('target delivery') || get('target') || undefined,
          adjustedDeliveryDate:
            get('adj. target') || get('adjusted delivery') || get('adj. delivery') || undefined,
          actualDeliveryDate:
            get('actual date') || get('actual delivery') || get('actual') || undefined,
          notes: get('notes') || get('note') || undefined,
          status: get('status') || undefined,
        };

        if (task.title) {
          currentSI.tasks.push(task);
        }
        continue;
      }

      // Non-table line while in tasks → end of tasks section, go back to si-meta
      if (!line.startsWith('|')) {
        currentSection = 'si-meta';
        i--;
        continue;
      }
    }

    // Legacy: numbered SI items in si-list or si-bullets context (backward compat)
    if (
      (currentSection === 'si-list' || currentSection === 'si-bullets') &&
      currentDO
    ) {
      if (line.startsWith('*') || line.startsWith('-')) {
        if (currentSI) {
          const bulletText = line.replace(/^[\*\-]\s*/, '').trim();
          currentSI.bullets.push(bulletText);
        }
        continue;
      }
    }
  }

  // Save trailing SI and DO
  saveDO();

  const totalTasks = definingObjectives.reduce(
    (sum, d) =>
      sum + d.strategicInitiatives.reduce((s, si) => s + si.tasks.length, 0),
    0
  );

  console.log('Parsed RCDO:', {
    rallyingCry: rallyingCry?.substring(0, 50) + '...',
    doCount: definingObjectives.length,
    totalTasks,
    dos: definingObjectives.map(d => ({
      number: d.number,
      title: d.title,
      owner: d.ownerName || '(none)',
      siCount: d.strategicInitiatives.length,
      sis: d.strategicInitiatives.map(si => ({
        title: si.title,
        owner: si.ownerName || '(none)',
        taskCount: si.tasks.length,
        hasMetric: !!si.successMetric,
        hasBenchmark: !!si.benchmark,
      })),
    })),
  });

  return { rallyingCry, definingObjectives };
}

/**
 * Validates parsed RCDO data (lenient - warnings only, not blocking)
 */
export function validateParsedRCDO(
  data: ParsedRCDO
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data.rallyingCry) {
    errors.push('No Rallying Cry found in the markdown file');
  }

  if (data.definingObjectives.length === 0) {
    errors.push('No Defining Objectives found in the markdown file');
  }

  if (data.definingObjectives.length > 6) {
    warnings.push(
      `Found ${data.definingObjectives.length} Defining Objectives. Maximum recommended is 6.`
    );
  }

  data.definingObjectives.forEach((do_, idx) => {
    if (!do_.title) {
      errors.push(`DO #${idx + 1} is missing a title`);
    }
    if (do_.strategicInitiatives.length === 0) {
      warnings.push(`DO #${idx + 1} "${do_.title}" has no Strategic Initiatives`);
    }

    do_.strategicInitiatives.forEach((si, siIdx) => {
      if (!si.title) {
        warnings.push(`DO #${idx + 1} SI #${siIdx + 1} is missing a title`);
      }
    });
  });

  return { valid: errors.length === 0, errors, warnings };
}
