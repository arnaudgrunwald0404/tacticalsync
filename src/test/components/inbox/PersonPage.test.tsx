import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/test-utils';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PersonPage } from '@/components/inbox/PersonPage';

// Idea #7 (Relationship memory) — PLAN_idea7_relationship_memory.md §7a.1/§7a.5.
// Acceptance criterion: no section of the person page shows a bare "No data"
// or blank state — every empty state names the action that populates it.
// These tests pin that contract at the component level.

const MEMBER_ID = 'member-1';
const USER_ID = 'user-1';

type MockRow = Record<string, unknown> | null;

function buildSupabaseMock(overrides: {
  member?: MockRow;
  personTag?: MockRow;
  relationshipDoc?: MockRow;
  prepHistory?: MockRow[];
  itemTags?: MockRow[];
  topics?: MockRow[];
  commitments?: MockRow[];
}) {
  const {
    member = { id: MEMBER_ID, name: 'Alex Rivera', role: 'Engineer', relationship_type: 'direct_report', last_1on1_date: null, context_notes: null },
    personTag = null,
    relationshipDoc = null,
    prepHistory = [],
    itemTags = [],
    topics = [],
    commitments = [],
  } = overrides;

  return {
    auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: USER_ID } } })) },
    from: vi.fn((table: string) => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        maybeSingle: vi.fn(() => {
          if (table === 'cos_team_members') return Promise.resolve({ data: member });
          if (table === 'inbox_tags') return Promise.resolve({ data: personTag });
          if (table === 'cos_relationship_documents') return Promise.resolve({ data: relationshipDoc });
          return Promise.resolve({ data: null });
        }),
        then: (resolve: (v: { data: unknown }) => void) => {
          if (table === 'cos_one_on_one_prep') return resolve({ data: prepHistory });
          if (table === 'inbox_item_tags') return resolve({ data: itemTags });
          if (table === 'cos_relationship_topics') return resolve({ data: topics });
          if (table === 'cos_forgotten_commitments') return resolve({ data: commitments });
          return resolve({ data: [] });
        },
      };
      return chain;
    }),
  };
}

vi.mock('@/integrations/supabase/client', () => ({
  get supabase() {
    return globalThis.__personPageSupabaseMock;
  },
}));

function setSupabaseMock(mock: unknown) {
  (globalThis as unknown as { __personPageSupabaseMock: unknown }).__personPageSupabaseMock = mock;
}

function renderPersonPage() {
  return render(
    <TooltipProvider>
      <PersonPage userId={USER_ID} memberId={MEMBER_ID} onBack={vi.fn()} onOpenItem={vi.fn()} />
    </TooltipProvider>,
  );
}

describe('PersonPage empty states (cold start)', () => {
  it('shows the cold-start banner and named empty states when the person has almost no history', async () => {
    setSupabaseMock(buildSupabaseMock({}));
    renderPersonPage();

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Alex Rivera' })).toBeInTheDocument());

    // Page-level cold-start banner
    expect(screen.getByText(/This page is just getting started/i)).toBeInTheDocument();

    // Every empty state names the action that fills it in — never a bare
    // "No data" (the acceptance criterion in PLAN §7a.5).
    expect(screen.getByText(/Tag a task or note with their name/i)).toBeInTheDocument();
    expect(screen.getByText(/Recurring themes will appear here/i)).toBeInTheDocument();
    expect(screen.getByText(/relationship summary builds itself/i)).toBeInTheDocument();
    expect(screen.getByText(/Prep notes from your 1:1s/i)).toBeInTheDocument();

    // None of the empty states should read as a bare "No data" / blank state.
    expect(screen.queryByText(/^No data$/i)).not.toBeInTheDocument();
  });

  it('shows a positive ("caught up") message rather than a blank state when there are no overdue commitments', async () => {
    setSupabaseMock(buildSupabaseMock({}));
    renderPersonPage();

    await waitFor(() => expect(screen.getByText(/Nothing overdue/i)).toBeInTheDocument());
    expect(screen.getByText(/You're caught up with Alex Rivera/i)).toBeInTheDocument();
  });

  it('does not show the cold-start banner once there is meaningful history', async () => {
    setSupabaseMock(buildSupabaseMock({
      relationshipDoc: { id: 'doc-1', content: 'Alex is doing great work on the migration project.', version_count: 3, last_updated_at: new Date().toISOString() },
      prepHistory: [{ id: 'prep-1', content: 'Discussed roadmap', prep_date: '2026-07-01' }],
    }));
    renderPersonPage();

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Alex Rivera' })).toBeInTheDocument());
    expect(screen.queryByText(/This page is just getting started/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Alex is doing great work/i)).toBeInTheDocument();
  });

  it('shows a "person not found" state rather than crashing when the member does not exist or is not accessible', async () => {
    setSupabaseMock(buildSupabaseMock({ member: null }));
    renderPersonPage();

    await waitFor(() => expect(screen.getByText(/Person not found/i)).toBeInTheDocument());
  });
});
