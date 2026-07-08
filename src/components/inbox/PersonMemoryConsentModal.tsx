import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction,
} from '@/components/ui/alert-dialog';

/**
 * First-run consent / expectations modal for person pages and pre-1:1
 * briefs (PLAN_idea7_relationship_memory.md §7a.4). Shown once, before the
 * user's first person-page view or first received brief.
 *
 * The "Who can see it: only you" claim below is verified against this
 * repo's actual RLS policies (every table involved — inbox_items,
 * inbox_tags, inbox_item_tags, cos_team_members, cos_relationship_documents,
 * cos_relationship_topics, cos_one_on_one_prep, cos_meeting_actions,
 * cos_forgotten_commitments — scopes strictly to auth.uid() = user_id, and
 * cos_forgotten_commitments is a plain, non-SECURITY-DEFINER view so it
 * inherits that scoping rather than bypassing it) and by the RLS test suite
 * in src/test/rls/personMemoryPrivacy.test.ts. Do not soften or remove that
 * verification — if any of those tables' access model ever changes to allow
 * a manager, HR admin, or shared-workspace view, this copy must change too.
 */

interface PersonMemoryConsentModalProps {
  open: boolean;
  memberNameExample?: string;
  onAcknowledge: () => void;
  onManageSettings?: () => void;
}

export function PersonMemoryConsentModal({
  open, memberNameExample, onAcknowledge, onManageSettings,
}: PersonMemoryConsentModalProps) {
  const name = memberNameExample ?? 'someone';

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>About person pages and 1:1 briefs</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-gray-600 text-left">
              <p>
                This page pulls together everything you've tagged to {name} — notes, tasks,
                meeting insights, and 1:1 prep — plus a running summary and pre-1:1 briefs
                generated from that history.
              </p>
              <p>
                <span className="font-medium text-gray-800">What feeds it:</span> items you tag to{' '}
                {name}, your 1:1 prep notes, and (if connected) Zoom summaries from meetings you
                both attended.
              </p>
              <p>
                <span className="font-medium text-gray-800">Who can see it:</span> only you. This is
                your private working memory of the relationship — {name} and other teammates
                cannot see this page, your notes, or your briefs.
              </p>
              <p>
                <span className="font-medium text-gray-800">Your call:</span> keep tagging items and
                this gets more useful over time. You can turn off pre-1:1 briefs anytime in
                Settings &rarr; Agent.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-between">
          {onManageSettings && (
            <button
              onClick={onManageSettings}
              className="text-xs text-gray-500 hover:text-gray-800 transition-colors underline underline-offset-2"
            >
              Manage settings
            </button>
          )}
          <AlertDialogAction onClick={onAcknowledge}>Got it</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
