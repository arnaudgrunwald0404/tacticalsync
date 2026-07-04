/**
 * ClearGo integration utility.
 *
 * Fetches blockers, epics, and 1:1 prep data from a user-configured ClearGo
 * instance. Credentials are stored in cos_mcp_integrations with
 * integration_key = 'cleargo'.
 */

export interface ClearGoConfig {
  baseUrl: string
  apiKey: string
}

export interface ClearGoEnrichment {
  /** Context lines ready to inject into a prompt */
  sections: string[]
  sourcesUsed: string[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeFetch(url: string, apiKey: string): Promise<any | null> {
  try {
    const resp = await fetch(url, {
      headers: {
        'X-ClearGo-Key': apiKey,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8_000),
    })
    if (!resp.ok) return null
    const json = await resp.json()
    return json.data ?? json
  } catch {
    return null
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + '...'
}

/**
 * Fetch DCI-level context: open blockers and at-risk epics across the team.
 */
export async function fetchClearGoDciContext(cfg: ClearGoConfig): Promise<ClearGoEnrichment> {
  const { baseUrl, apiKey } = cfg
  const sections: string[] = []

  // 1. Team members snapshot (health + blockers)
  const members = await safeFetch(`${baseUrl}/api/v1/team-members`, apiKey)
  const memberList: Array<{ id: string; name: string; blockers_count?: number }> = Array.isArray(members) ? members : []

  const blockerLines: string[] = []
  for (const m of memberList.slice(0, 20)) {
    const blockers = await safeFetch(`${baseUrl}/api/v1/team-members/${m.id}/blockers`, apiKey)
    if (!Array.isArray(blockers) || blockers.length === 0) continue
    for (const b of blockers.slice(0, 3)) {
      const title = b.title ?? b.name ?? b.description ?? 'Untitled blocker'
      const severity = b.severity ?? b.priority ?? ''
      const meta = severity ? ` [${severity}]` : ''
      blockerLines.push(`  - ${m.name}: ${truncate(title, 150)}${meta}`)
    }
  }

  if (blockerLines.length > 0) {
    sections.push('Open blockers across direct reports (ClearGo):')
    sections.push(...blockerLines)
  }

  // 2. Epics with issues
  const epicLines: string[] = []
  for (const m of memberList.slice(0, 10)) {
    const epics = await safeFetch(`${baseUrl}/api/v1/team-members/${m.id}/epics`, apiKey)
    if (!Array.isArray(epics)) continue
    for (const e of epics.slice(0, 3)) {
      const status = (e.status ?? '').toLowerCase()
      if (!status || status === 'done' || status === 'completed') continue
      const title = e.title ?? e.name ?? 'Untitled epic'
      const dueDate = e.due_date ? ` (due ${e.due_date})` : ''
      epicLines.push(`  - ${m.name} — ${truncate(title, 120)}${dueDate} [${status}]`)
    }
  }

  if (epicLines.length > 0) {
    sections.push('Active epics (ClearGo):')
    sections.push(...epicLines)
  }

  return {
    sections,
    sourcesUsed: sections.length > 0 ? ['cleargo'] : [],
  }
}

/**
 * Fetch 1:1 prep context for a specific team member by their email.
 * Resolves the person's ClearGo ID from the team-members list, then
 * fetches their prep pack and open blockers.
 */
export async function fetchClearGo1on1Context(
  cfg: ClearGoConfig,
  memberEmail: string,
  memberName: string,
): Promise<ClearGoEnrichment> {
  const { baseUrl, apiKey } = cfg
  const sections: string[] = []

  // Resolve member ID from email
  const members = await safeFetch(`${baseUrl}/api/v1/team-members`, apiKey)
  const memberList: Array<{ id: string; name: string; email?: string }> = Array.isArray(members) ? members : []
  const found = memberList.find(m =>
    m.email?.toLowerCase() === memberEmail.toLowerCase() ||
    m.name?.toLowerCase() === memberName.toLowerCase()
  )

  if (!found) return { sections: [], sourcesUsed: [] }

  // Fetch 1:1 prep pack
  const prepPack = await safeFetch(`${baseUrl}/api/v1/1on1-prep/${found.id}`, apiKey)
  if (prepPack) {
    const summary = prepPack.summary ?? prepPack.overview ?? prepPack.brief ?? null
    const talkingPoints: string[] = Array.isArray(prepPack.talking_points)
      ? prepPack.talking_points
      : Array.isArray(prepPack.topics) ? prepPack.topics : []

    sections.push(`ClearGo 1:1 prep for ${memberName}:`)
    if (summary) sections.push(`  Summary: ${truncate(String(summary), 300)}`)
    for (const tp of talkingPoints.slice(0, 5)) {
      const text = typeof tp === 'string' ? tp : (tp as { title?: string; text?: string })?.title ?? String(tp)
      sections.push(`  - ${truncate(text, 200)}`)
    }
  }

  // Fetch open blockers
  const blockers = await safeFetch(`${baseUrl}/api/v1/team-members/${found.id}/blockers`, apiKey)
  if (Array.isArray(blockers) && blockers.length > 0) {
    sections.push(`Open blockers (ClearGo):`)
    for (const b of blockers.slice(0, 5)) {
      const title = b.title ?? b.name ?? b.description ?? 'Untitled'
      const severity = b.severity ?? b.priority ?? ''
      sections.push(`  - ${truncate(title, 150)}${severity ? ` [${severity}]` : ''}`)
    }
  }

  // Fetch active epics
  const epics = await safeFetch(`${baseUrl}/api/v1/team-members/${found.id}/epics`, apiKey)
  if (Array.isArray(epics) && epics.length > 0) {
    const active = epics.filter((e: { status?: string }) => {
      const s = (e.status ?? '').toLowerCase()
      return s && s !== 'done' && s !== 'completed'
    })
    if (active.length > 0) {
      sections.push(`Active epics (ClearGo):`)
      for (const e of active.slice(0, 4)) {
        const title = e.title ?? e.name ?? 'Untitled'
        const due = e.due_date ? ` (due ${e.due_date})` : ''
        sections.push(`  - ${truncate(title, 150)}${due} [${e.status ?? ''}]`)
      }
    }
  }

  return {
    sections,
    sourcesUsed: sections.length > 0 ? ['cleargo'] : [],
  }
}

/**
 * Load ClearGo credentials from cos_mcp_integrations.
 * Returns null if not connected or not configured.
 */
export async function getClearGoConfig(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<ClearGoConfig | null> {
  const { data: row } = await supabase
    .from('cos_mcp_integrations')
    .select('base_url, auth_value, is_connected')
    .eq('user_id', userId)
    .eq('integration_key', 'cleargo')
    .maybeSingle()

  if (!row?.is_connected || !row?.auth_value || !row?.base_url) return null
  return { baseUrl: (row.base_url as string).replace(/\/$/, ''), apiKey: row.auth_value as string }
}
