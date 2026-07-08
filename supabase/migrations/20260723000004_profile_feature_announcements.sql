-- Unified funnel (Idea #1) onboarding: a shared per-user flag store for
-- one-time in-product education moments (first-run callouts, rollout
-- banners), so each new feature doesn't need its own boolean column.
--
-- Shape: { "<flag_key>": true, ... }. Keys used by this feature:
--   - "unified_funnel_intro_seen"        — the first-synced-item callout (see
--     src/components/inbox/AutoSyncIntroCallout.tsx)
--   - "unified_funnel_announcement_seen" — the day-one rollout banner (see
--     src/components/inbox/UnifiedFunnelAnnouncementBanner.tsx)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS feature_announcements jsonb NOT NULL DEFAULT '{}'::jsonb;
