/**
 * Markdown RCDO Parser
 * Parses a markdown file containing Rallying Cry, Defining Objectives, and Strategic Initiatives
 */

export interface ParsedSI {
  title: string;
  description: string;
  bullets: string[];
  ownerName?: string;
}

export interface ParsedDO {
  number: number;
  title: string;
  definition: string;
  primarySuccessMetric: string;
  strategicInitiatives: ParsedSI[];
  ownerName?: string;
}

export interface ParsedRCDO {
  rallyingCry: string;
  definingObjectives: ParsedDO[];
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
  let currentSection: 'none' | 'rc' | 'do-definition' | 'do-metric' | 'si-list' | 'si-bullets' = 'none';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines
    if (!line) continue;
    
    // Extract Rallying Cry
    if (line.match(/^>\s*\*\*(.+)\*\*\s*$/)) {
      const match = line.match(/^>\s*\*\*(.+)\*\*\s*$/);
      if (match) {
        rallyingCry = match[1].trim();
        currentSection = 'rc';
      }
      continue;
    }
    
    // Extract DO headers - match patterns like "## DO #1 — Title" or "## DO #1 — Title (Owner: Name)"
    // Handles em dash (—), en dash (–), and hyphen (-)
    const doHeaderMatch = line.match(/^##\s+DO\s+#?(\d+)\s*[—–\-:]\s*(.+)$/i);
    if (doHeaderMatch) {
      // Save previous DO if exists
      if (currentDO && currentSI) {
        currentDO.strategicInitiatives.push(currentSI);
        currentSI = null;
      }
      if (currentDO) {
        definingObjectives.push(currentDO);
      }
      
      // Extract owner from title if present: "Title (Owner: John Doe)"
      let titleText = doHeaderMatch[2].trim();
      let ownerName: string | undefined = undefined;
      
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
        ownerName
      };
      currentSection = 'none';
      continue;
    }
    
    // Extract Definition
    if (line === '**Definition**' && currentDO) {
      currentSection = 'do-definition';
      continue;
    }
    
    // Extract Primary Success Metric
    if (line === '**Primary Success Metric**' && currentDO) {
      currentSection = 'do-metric';
      continue;
    }
    
    // Strategic Initiatives section header
    if (line === '### Strategic Initiatives' && currentDO) {
      currentSection = 'si-list';
      continue;
    }
    
    // Read definition text
    if (currentSection === 'do-definition' && currentDO && !line.startsWith('**')) {
      if (currentDO.definition) {
        currentDO.definition += ' ' + line;
      } else {
        currentDO.definition = line;
      }
      continue;
    }
    
    // Read metric text (after bullet points)
    if (currentSection === 'do-metric' && currentDO && line.startsWith('*')) {
      const metricText = line.replace(/^\*\s*/, '').trim();
      if (currentDO.primarySuccessMetric) {
        currentDO.primarySuccessMetric += ' ' + metricText;
      } else {
        currentDO.primarySuccessMetric = metricText;
      }
      continue;
    }
    
    // Strategic Initiative numbered items (check in both si-list and si-bullets sections)
    if ((currentSection === 'si-list' || currentSection === 'si-bullets') && currentDO) {
      const siMatch = line.match(/^\d+\.\s+\*\*(.+)\*\*$/);
      if (siMatch) {
        // Save previous SI if exists
        if (currentSI) {
          currentDO.strategicInitiatives.push(currentSI);
        }
        
        // Extract owner from SI title if present: "Title (Owner: Jane Doe)"
        let siTitle = siMatch[1].trim();
        let ownerName: string | undefined = undefined;
        
        const ownerMatch = siTitle.match(/^(.+?)\s*\(Owner:\s*([^)]+)\)\s*$/i);
        if (ownerMatch) {
          siTitle = ownerMatch[1].trim();
          ownerName = ownerMatch[2].trim();
        }
        
        currentSI = {
          title: siTitle,
          description: '',
          bullets: [],
          ownerName
        };
        currentSection = 'si-bullets';
        continue;
      }
    }
    
    // SI bullet points (only process if not a new numbered item)
    if (currentSection === 'si-bullets' && currentSI) {
      // Check if it's a bullet point
      if (line.startsWith('*') && !line.match(/^\d+\.\s+\*\*(.+)\*\*$/)) {
        const bulletText = line.replace(/^\*\s*/, '').trim();
        currentSI.bullets.push(bulletText);
        continue;
      }
    }
  }
  
  // Save last SI and DO
  if (currentDO && currentSI) {
    currentDO.strategicInitiatives.push(currentSI);
  }
  if (currentDO) {
    definingObjectives.push(currentDO);
  }
  
  // Debug logging
  console.log('📋 Parsed RCDO:', {
    rallyingCry: rallyingCry?.substring(0, 50) + '...',
    doCount: definingObjectives.length,
    dos: definingObjectives.map(d => ({
      number: d.number,
      title: d.title,
      owner: d.ownerName || '(none)',
      siCount: d.strategicInitiatives.length,
      hasDefinition: !!d.definition,
      hasMetric: !!d.primarySuccessMetric,
      sisWithOwners: d.strategicInitiatives.filter(si => si.ownerName).length
    }))
  });
  
  return {
    rallyingCry,
    definingObjectives
  };
}

/**
 * Validates parsed RCDO data (lenient - warnings only, not blocking)
 */
export function validateParsedRCDO(data: ParsedRCDO): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!data.rallyingCry) {
    errors.push('No Rallying Cry found in the markdown file');
  }
  
  if (data.definingObjectives.length === 0) {
    errors.push('No Defining Objectives found in the markdown file');
  }
  
  if (data.definingObjectives.length > 6) {
    warnings.push(`Found ${data.definingObjectives.length} Defining Objectives. Maximum recommended is 6.`);
  }
  
  data.definingObjectives.forEach((do_, idx) => {
    if (!do_.title) {
      errors.push(`DO #${idx + 1} is missing a title`);
    }
    if (!do_.definition) {
      warnings.push(`DO #${idx + 1} "${do_.title}" is missing a definition`);
    }
    if (!do_.primarySuccessMetric) {
      warnings.push(`DO #${idx + 1} "${do_.title}" is missing a primary success metric`);
    }
    if (do_.strategicInitiatives.length === 0) {
      warnings.push(`DO #${idx + 1} "${do_.title}" has no Strategic Initiatives`);
    }
  });
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

