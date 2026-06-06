/**
 * StackOne enrichment utility for 1:1 prep generation.
 *
 * Fetches data from linked StackOne accounts (HRIS, ticketing, CRM)
 * scoped to a specific person by email, and returns structured context
 * strings ready to inject into the prep prompt.
 */

interface StackOneAccount {
  id: string
  provider: string
  provider_name?: string
  status?: string
}

interface EnrichmentResult {
  sections: string[]
  sourcesUsed: string[]
}

const STACKONE_API = 'https://api.stackone.com'

function headers(apiKey: string, accountId: string): Record<string, string> {
  return {
    'Authorization': `Basic ${btoa(apiKey + ':')}`,
    'x-account-id': accountId,
    'Content-Type': 'application/json',
  }
}

async function safeFetch(url: string, hdrs: Record<string, string>): Promise<any | null> {
  try {
    const resp = await fetch(url, { headers: hdrs, signal: AbortSignal.timeout(8_000) })
    if (!resp.ok) return null
    const json = await resp.json()
    return json.data ?? json
  } catch {
    return null
  }
}

// ── HRIS enrichment ────────────────────────────────────────────────────────

async function fetchHrisData(
  apiKey: string,
  account: StackOneAccount,
  email: string,
): Promise<string[]> {
  const parts: string[] = []
  const hdrs = headers(apiKey, account.id)

  // Search for employee by email
  const employees = await safeFetch(
    `${STACKONE_API}/unified/hris/employees?filter[email]=${encodeURIComponent(email)}`,
    hdrs,
  )

  if (!employees || (Array.isArray(employees) && employees.length === 0)) return parts

  const emp = Array.isArray(employees) ? employees[0] : employees

  parts.push(`HRIS data (${account.provider_name || account.provider}):`)

  if (emp.job_title || emp.department) {
    const title = emp.job_title ?? emp.title ?? ''
    const dept = emp.department?.name ?? emp.department ?? ''
    parts.push(`  Role: ${[title, dept].filter(Boolean).join(', ')}`)
  }
  if (emp.manager) {
    const mgr = typeof emp.manager === 'string' ? emp.manager : (emp.manager?.name ?? emp.manager?.display_name ?? '')
    if (mgr) parts.push(`  Manager: ${mgr}`)
  }
  if (emp.hire_date || emp.start_date) {
    parts.push(`  Start date: ${emp.hire_date ?? emp.start_date}`)
  }
  if (emp.employment_status) {
    parts.push(`  Status: ${emp.employment_status}`)
  }
  if (emp.work_location || emp.location) {
    const loc = emp.work_location ?? emp.location
    const locStr = typeof loc === 'string' ? loc : (loc?.name ?? loc?.city ?? '')
    if (locStr) parts.push(`  Location: ${locStr}`)
  }

  // Try to fetch recent time-off if we have an employee ID
  if (emp.id) {
    const timeOff = await safeFetch(
      `${STACKONE_API}/unified/hris/employees/${emp.id}/time_off?filter[status]=approved&page_size=5`,
      hdrs,
    )
    if (Array.isArray(timeOff) && timeOff.length > 0) {
      const upcoming = timeOff.filter((t: any) => {
        const start = new Date(t.start_date ?? t.start)
        return start >= new Date(Date.now() - 7 * 86_400_000)
      })
      if (upcoming.length > 0) {
        parts.push(`  Upcoming/recent time off:`)
        for (const t of upcoming.slice(0, 3)) {
          const start = t.start_date ?? t.start ?? ''
          const end = t.end_date ?? t.end ?? ''
          const type = t.type ?? t.time_off_type ?? 'PTO'
          parts.push(`    - ${type}: ${start} to ${end}`)
        }
      }
    }
  }

  return parts
}

// ── Ticketing / PM enrichment ──────────────────────────────────────────────

async function fetchTicketingData(
  apiKey: string,
  account: StackOneAccount,
  email: string,
  name: string,
): Promise<string[]> {
  const parts: string[] = []
  const hdrs = headers(apiKey, account.id)

  // Try unified ticketing for assigned tickets
  const tickets = await safeFetch(
    `${STACKONE_API}/unified/ticketing/tickets?filter[assignee_email]=${encodeURIComponent(email)}&filter[status]=open&page_size=10`,
    hdrs,
  )

  if (!tickets || (Array.isArray(tickets) && tickets.length === 0)) return parts

  const ticketList = Array.isArray(tickets) ? tickets : [tickets]
  if (ticketList.length === 0) return parts

  parts.push(`Open tickets/tasks (${account.provider_name || account.provider}):`)
  for (const t of ticketList.slice(0, 8)) {
    const title = t.title ?? t.summary ?? t.name ?? 'Untitled'
    const status = t.status ?? ''
    const priority = t.priority ?? ''
    const meta = [status, priority].filter(Boolean).join(', ')
    parts.push(`  - ${title}${meta ? ` (${meta})` : ''}`)
  }

  return parts
}

// ── CRM enrichment ─────────────────────────────────────────────────────────

async function fetchCrmData(
  apiKey: string,
  account: StackOneAccount,
  email: string,
): Promise<string[]> {
  const parts: string[] = []
  const hdrs = headers(apiKey, account.id)

  // Search for contact by email
  const contacts = await safeFetch(
    `${STACKONE_API}/unified/crm/contacts?filter[email]=${encodeURIComponent(email)}&page_size=1`,
    hdrs,
  )

  if (!contacts || (Array.isArray(contacts) && contacts.length === 0)) return parts

  const contact = Array.isArray(contacts) ? contacts[0] : contacts

  // If we find a contact, look for their deals
  if (contact?.id) {
    const deals = await safeFetch(
      `${STACKONE_API}/unified/crm/contacts/${contact.id}/deals?page_size=5`,
      hdrs,
    )

    if (Array.isArray(deals) && deals.length > 0) {
      parts.push(`CRM activity (${account.provider_name || account.provider}):`)
      for (const d of deals.slice(0, 5)) {
        const name = d.name ?? d.title ?? 'Untitled deal'
        const stage = d.stage ?? d.status ?? ''
        const amount = d.amount ? `$${Number(d.amount).toLocaleString()}` : ''
        const meta = [stage, amount].filter(Boolean).join(', ')
        parts.push(`  - ${name}${meta ? ` (${meta})` : ''}`)
      }
    }
  }

  return parts
}

// ── Provider category heuristics ───────────────────────────────────────────

const HRIS_PROVIDERS = new Set([
  'bamboohr', 'workday', 'gusto', 'adp', 'rippling', 'hibob', 'personio',
  'namely', 'paylocity', 'paycom', 'sage', 'successfactors', 'ukg', 'zenefits',
  'factorial', 'humaans', 'deel', 'remote', 'oyster',
])

const TICKETING_PROVIDERS = new Set([
  'jira', 'asana', 'linear', 'monday', 'clickup', 'shortcut', 'trello',
  'notion', 'height', 'github', 'gitlab', 'azure_devops', 'basecamp',
])

const CRM_PROVIDERS = new Set([
  'salesforce', 'hubspot', 'pipedrive', 'zoho', 'close', 'copper',
  'freshsales', 'apollo', 'outreach', 'salesloft',
])

function categorizeProvider(provider: string): 'hris' | 'ticketing' | 'crm' | 'unknown' {
  const p = provider.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (HRIS_PROVIDERS.has(p)) return 'hris'
  if (TICKETING_PROVIDERS.has(p)) return 'ticketing'
  if (CRM_PROVIDERS.has(p)) return 'crm'
  return 'unknown'
}

// ── Main enrichment function ───────────────────────────────────────────────

export async function fetchStackOneEnrichment(
  apiKey: string,
  accounts: StackOneAccount[],
  memberEmail: string,
  memberName: string,
  categories?: string[],
): Promise<EnrichmentResult> {
  const activeAccounts = accounts.filter(a => a.status === 'active' || !a.status)
  if (activeAccounts.length === 0) return { sections: [], sourcesUsed: [] }

  const allowedCategories = categories?.length
    ? new Set(categories)
    : new Set(['hris', 'ticketing', 'crm'])

  const fetchTasks: Promise<string[]>[] = []

  for (const account of activeAccounts) {
    const cat = categorizeProvider(account.provider)

    if (cat === 'hris' && allowedCategories.has('hris')) {
      fetchTasks.push(fetchHrisData(apiKey, account, memberEmail))
    } else if (cat === 'ticketing' && allowedCategories.has('ticketing')) {
      fetchTasks.push(fetchTicketingData(apiKey, account, memberEmail, memberName))
    } else if (cat === 'crm' && allowedCategories.has('crm')) {
      fetchTasks.push(fetchCrmData(apiKey, account, memberEmail))
    } else if (cat === 'unknown') {
      // Try all enabled categories in parallel for unknown providers
      if (allowedCategories.has('hris')) fetchTasks.push(fetchHrisData(apiKey, account, memberEmail))
      if (allowedCategories.has('ticketing')) fetchTasks.push(fetchTicketingData(apiKey, account, memberEmail, memberName))
    }
  }

  const results = await Promise.allSettled(fetchTasks)
  const sections: string[] = []
  const sourcesUsed: string[] = []

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.length > 0) {
      sections.push(...r.value)
    }
  }

  if (sections.length > 0) {
    sourcesUsed.push('stackone')
  }

  return { sections, sourcesUsed }
}

export async function getStackOneConfig(
  supabase: any,
  userId: string,
): Promise<{ apiKey: string; accounts: StackOneAccount[] } | null> {
  const { data: row } = await supabase
    .from('cos_mcp_integrations')
    .select('auth_value, is_connected')
    .eq('user_id', userId)
    .eq('integration_key', 'stackone')
    .maybeSingle()

  if (!row?.auth_value || !row?.is_connected) return null

  // Fetch accounts
  try {
    const resp = await fetch(`${STACKONE_API}/accounts`, {
      headers: {
        'Authorization': `Basic ${btoa(row.auth_value + ':')}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(8_000),
    })
    if (!resp.ok) return null
    const json = await resp.json()
    return { apiKey: row.auth_value, accounts: json.data ?? [] }
  } catch {
    return null
  }
}
