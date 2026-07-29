-- User-supplied free-text instructions passed alongside a delegation's
-- item_id/user_id when the user types context into the Assistant-mode
-- composer while a task's sidebar is open (see InboxAssistantPanel.tsx
-- composerSubmit). Folded into the delegation's planning prompt.
ALTER TABLE inbox_delegations ADD COLUMN instructions text;
