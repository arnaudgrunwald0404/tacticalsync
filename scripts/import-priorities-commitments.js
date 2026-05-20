#!/usr/bin/env node
/**
 * Import priorities & commitments from a spreadsheet.
 *
 * Supports two formats (auto-detected):
 *
 *   PRODUCT format ("Priorities & Commitments - Product.xlsx")
 *     - Row 1: quarter/month headers
 *     - Col A: person first name
 *     - Covers Q1 + Q2 2026; includes January
 *
 *   XLT format ("XLT Shared Quarterly Priorities and monthly Commitments.xlsx")
 *     - Rows 1-3: headers; row 3 has "reports to" / "Leader"
 *     - Col A: reports-to (manager), Col B: Leader (person name)
 *     - Covers Q1-Q4 2026; Q1 has no January (starts at February)
 *     - Gap column every 4 columns
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/import-priorities-commitments.js <path> [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL) { console.error('❌  VITE_SUPABASE_URL is required'); process.exit(1); }
if (!SERVICE_ROLE_KEY && !ANON_KEY) {
  console.error('❌  SUPABASE_SERVICE_ROLE_KEY (preferred) or VITE_SUPABASE_ANON_KEY is required');
  process.exit(1);
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const xlsxPath = args.find(a => !a.startsWith('--'));
if (!xlsxPath) {
  console.error('❌  Usage: node scripts/import-priorities-commitments.js <path-to-xlsx> [--dry-run]');
  process.exit(1);
}

if (DRY_RUN) console.log('🔍  DRY RUN — no database writes will occur\n');

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY ?? ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Quarter definitions ───────────────────────────────────────────────────────

const ALL_QUARTER_DEFS = {
  'Q1 2026': { start_date: '2026-01-01', end_date: '2026-03-31' },
  'Q2 2026': { start_date: '2026-04-01', end_date: '2026-06-30' },
  'Q3 2026': { start_date: '2026-07-01', end_date: '2026-09-30' },
  'Q4 2026': { start_date: '2026-10-01', end_date: '2026-12-31' },
};

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Format layouts ────────────────────────────────────────────────────────────

/**
 * PRODUCT format layout.
 * nameCol=0, headerRows=1.
 * Q1 priorities at cols 1-3, then Jan/Feb/Mar at 4-6/7-9/10-12.
 * Q2 priorities at 13-15, then Apr/May/Jun at 16-18/19-21/22-24.
 */
const PRODUCT_LAYOUT = {
  nameCol: 0,
  headerRows: 1,
  quarters: [
    {
      label: 'Q1 2026',
      priorityCols: [1, 2, 3],
      months: [
        { monthNumber: 1, monthName: 'January',  cols: [4,  5,  6]  },
        { monthNumber: 2, monthName: 'February', cols: [7,  8,  9]  },
        { monthNumber: 3, monthName: 'March',    cols: [10, 11, 12] },
      ],
    },
    {
      label: 'Q2 2026',
      priorityCols: [13, 14, 15],
      months: [
        { monthNumber: 1, monthName: 'April', cols: [16, 17, 18] },
        { monthNumber: 2, monthName: 'May',   cols: [19, 20, 21] },
        { monthNumber: 3, monthName: 'June',  cols: [22, 23, 24] },
      ],
    },
  ],
};

/**
 * XLT format layout.
 * nameCol=1 (col 0 = "reports to"), headerRows=3.
 * Gap column every 4 cols. Q1 skips January.
 */
const XLT_LAYOUT = {
  nameCol: 1,
  managerCol: 0,
  headerRows: 3,
  quarters: [
    {
      label: 'Q1 2026',
      priorityCols: [3, 4, 5],
      months: [
        // No January in XLT
        { monthNumber: 2, monthName: 'February', cols: [7,  8,  9]  },
        { monthNumber: 3, monthName: 'March',    cols: [11, 12, 13] },
      ],
    },
    {
      label: 'Q2 2026',
      priorityCols: [15, 16, 17],
      months: [
        { monthNumber: 1, monthName: 'April',     cols: [19, 20, 21] },
        { monthNumber: 2, monthName: 'May',       cols: [23, 24, 25] },
        { monthNumber: 3, monthName: 'June',      cols: [27, 28, 29] },
      ],
    },
    {
      label: 'Q3 2026',
      priorityCols: [31, 32, 33],
      months: [
        { monthNumber: 1, monthName: 'July',      cols: [35, 36, 37] },
        { monthNumber: 2, monthName: 'August',    cols: [39, 40, 41] },
        { monthNumber: 3, monthName: 'September', cols: [43, 44, 45] },
      ],
    },
    {
      label: 'Q4 2026',
      priorityCols: [47, 48, 49],
      months: [
        { monthNumber: 1, monthName: 'October',  cols: [51, 52, 53] },
        { monthNumber: 2, monthName: 'November', cols: [55, 56, 57] },
        { monthNumber: 3, monthName: 'December', cols: [59, 60, 61] },
      ],
    },
  ],
};

// ── Format detection ──────────────────────────────────────────────────────────

function detectFormat(rows) {
  // XLT: row 3 (index 2) has "reports to" in col 0
  const row3Col0 = rows[2]?.[0];
  if (typeof row3Col0 === 'string' && row3Col0.toLowerCase().trim() === 'reports to') {
    return XLT_LAYOUT;
  }
  return PRODUCT_LAYOUT;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function cellStr(row, idx) {
  const v = row[idx];
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function isDataRow(row, layout) {
  const name = row[layout.nameCol];
  if (!name) return false;
  const n = String(name).trim().toLowerCase();
  if (!n) return false;
  // Skip header-ish values
  const skip = new Set(["q1'26","q2'26",'q1','q2','q3','q4','leader','name','person','reports to']);
  return !skip.has(n) && !/^\d+$/.test(n);
}

// Look up user by name — handles "Jason I" style names with initials
function resolveUserId(rawName, byFirstName, profiles) {
  const trimmed = rawName.trim();

  // Exact first-name match
  const direct = byFirstName.get(trimmed.toLowerCase());
  if (direct) return direct;

  // "FirstName I" — name with last-name initial
  const parts = trimmed.split(/\s+/);
  if (parts.length === 2 && parts[1].length === 1) {
    const firstName = parts[0].toLowerCase();
    const initial = parts[1].toLowerCase();
    const matches = profiles.filter(p =>
      p.first_name?.toLowerCase() === firstName &&
      p.last_name?.toLowerCase().startsWith(initial),
    );
    if (matches.length === 1) return matches[0].id;
  }

  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n📂  Reading: ${path.resolve(xlsxPath)}\n`);

  // 1. Parse spreadsheet
  const wb = XLSX.readFile(xlsxPath);
  const ws = wb.Sheets['Sheet1'] ?? wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  const layout = detectFormat(rows);
  console.log(`📐  Format detected: ${layout === XLT_LAYOUT ? 'XLT (4 quarters, gap cols, no January)' : 'Product (2 quarters)'}\n`);

  const dataRows = rows.slice(layout.headerRows).filter(r => isDataRow(r, layout));
  console.log(`📊  Found ${dataRows.length} person rows\n`);

  // 2. Fetch profiles
  const { data: profiles, error: profileErr } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, full_name, email');
  if (profileErr) { console.error('❌  profiles fetch failed:', profileErr.message); process.exit(1); }

  const byFirstName = new Map();
  for (const p of profiles ?? []) {
    if (p.first_name) byFirstName.set(p.first_name.trim().toLowerCase(), p.id);
  }

  // 3. Fetch teams
  const { data: teams, error: teamErr } = await supabase.from('teams').select('id, name').limit(10);
  if (teamErr) { console.error('❌  teams fetch failed:', teamErr.message); process.exit(1); }
  if (!teams?.length) { console.error('❌  No teams found in database'); process.exit(1); }

  const teamId = process.env.TEAM_ID ?? teams[0].id;
  console.log(`🏢  Team: ${teams.find(t => t.id === teamId)?.name ?? teamId}\n`);

  // 4. Find or create all quarters referenced by this layout
  const { data: existingQuarters } = await supabase
    .from('commitment_quarters')
    .select('id, label')
    .eq('team_id', teamId);

  const quarterIds = {};
  for (const q of layout.quarters) {
    const existing = existingQuarters?.find(eq => eq.label === q.label);
    if (existing) {
      quarterIds[q.label] = existing.id;
      console.log(`✅  Quarter found:   ${q.label} (${existing.id})`);
    } else if (DRY_RUN) {
      quarterIds[q.label] = `[would-create:${q.label}]`;
      console.log(`🔍  Quarter missing: ${q.label} (would be created on real run)`);
    } else {
      const def = ALL_QUARTER_DEFS[q.label];
      const { data: created, error: qErr } = await supabase
        .from('commitment_quarters')
        .insert({ label: q.label, ...def, team_id: teamId, status: 'active' })
        .select()
        .single();
      if (qErr) { console.error(`❌  Failed to create quarter ${q.label}:`, qErr.message); process.exit(1); }
      quarterIds[q.label] = created.id;
      console.log(`🆕  Quarter created: ${q.label} (${created.id})`);
    }
  }

  console.log('');

  // 5. Process each person row
  let imported = 0;
  let skipped = 0;

  for (const row of dataRows) {
    const rawName = cellStr(row, layout.nameCol) ?? '';
    const userId = resolveUserId(rawName, byFirstName, profiles ?? []);

    if (!userId) {
      console.warn(`⚠️   No profile found for "${rawName}" — skipping`);
      skipped++;
      continue;
    }

    const quarterIdsToTouch = layout.quarters.map(q => quarterIds[q.label]).filter(id => !id.startsWith?.('['));
    console.log(`👤  Importing: ${rawName}`);

    if (!DRY_RUN && quarterIdsToTouch.length) {
      await Promise.all([
        supabase.from('personal_priorities').delete()
          .eq('user_id', userId).in('quarter_id', quarterIdsToTouch),
        supabase.from('monthly_commitments').delete()
          .eq('user_id', userId).in('quarter_id', quarterIdsToTouch),
      ]);
    }

    const priorities = [];
    const commitments = [];

    for (const q of layout.quarters) {
      const qId = quarterIds[q.label];

      // Quarterly priorities
      for (let i = 0; i < q.priorityCols.length; i++) {
        const title = cellStr(row, q.priorityCols[i]);
        if (title) priorities.push({ quarter_id: qId, user_id: userId, title, display_order: i + 1 });
      }

      // Monthly commitments
      for (const m of q.months) {
        for (let i = 0; i < m.cols.length; i++) {
          const title = cellStr(row, m.cols[i]);
          if (title) commitments.push({
            quarter_id: qId,
            user_id: userId,
            month_number: m.monthNumber,
            title,
            status: 'pending',
            display_order: i + 1,
          });
        }
      }
    }

    if (priorities.length) {
      if (DRY_RUN) {
        console.log(`  📌  ${priorities.length} priorities would be imported:`);
        priorities.forEach(p => {
          const qLabel = layout.quarters.find(q => quarterIds[q.label] === p.quarter_id)?.label ?? p.quarter_id;
          console.log(`     [${qLabel} #${p.display_order}] ${p.title.slice(0, 90).replace(/\n[\s\S]*/s, '…')}`);
        });
      } else {
        const { error } = await supabase.from('personal_priorities').insert(priorities);
        if (error) console.error(`  ❌  priorities insert failed:`, error.message);
        else console.log(`  ✅  ${priorities.length} priorities`);
      }
    }

    if (commitments.length) {
      if (DRY_RUN) {
        console.log(`  📅  ${commitments.length} commitments would be imported:`);
        commitments.forEach(c => {
          const q = layout.quarters.find(q => quarterIds[q.label] === c.quarter_id);
          const m = q?.months.find(m => m.monthNumber === c.month_number);
          console.log(`     [${m?.monthName ?? '?'} #${c.display_order}] ${c.title.slice(0, 90).replace(/\n[\s\S]*/s, '…')}`);
        });
      } else {
        const { error } = await supabase.from('monthly_commitments').insert(commitments);
        if (error) console.error(`  ❌  commitments insert failed:`, error.message);
        else console.log(`  ✅  ${commitments.length} commitments`);
      }
    }

    imported++;
  }

  console.log(`\n🎉  Done — imported: ${imported}, skipped: ${skipped}\n`);
}

main().catch(err => { console.error('💥 ', err); process.exit(1); });
