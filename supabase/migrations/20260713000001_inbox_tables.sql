-- Inbox: unified tag-based item stream (parallel experiment alongside /chief-of-staff)

-- Tags (projects, people, urgency, folders, context)
CREATE TABLE inbox_tags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  type        text NOT NULL CHECK (type IN ('project', 'person', 'urgency', 'folder', 'context')),
  color       text NOT NULL DEFAULT '#6366f1',
  member_id   uuid REFERENCES cos_team_members(id) ON DELETE SET NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

ALTER TABLE inbox_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inbox_tags: own rows" ON inbox_tags
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Inbox items (tasks, notes, agent nudges, agent questions, meeting insights, brief items)
CREATE TABLE inbox_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type           text NOT NULL DEFAULT 'task'
                   CHECK (type IN ('task', 'note', 'agent_nudge', 'agent_question', 'meeting_insight', 'brief_item')),
  text           text NOT NULL DEFAULT '',
  body           text,                    -- optional expanded notes / rich text
  status         text NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'done', 'archived', 'snoozed')),
  done_at        timestamptz,
  archived_at    timestamptz,
  snoozed_until  timestamptz,
  agent_payload  jsonb,                   -- { source, rationale, action_required, cta_label, cta_action }
  source_ref     jsonb,                   -- { type: 'zoom_recording'|'dci_brief'|..., id: '...' }
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inbox_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inbox_items: own rows" ON inbox_items
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Many-to-many: items ↔ tags
CREATE TABLE inbox_item_tags (
  item_id  uuid NOT NULL REFERENCES inbox_items(id) ON DELETE CASCADE,
  tag_id   uuid NOT NULL REFERENCES inbox_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
);

ALTER TABLE inbox_item_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inbox_item_tags: own rows" ON inbox_item_tags
  USING (
    EXISTS (SELECT 1 FROM inbox_items WHERE id = item_id AND user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM inbox_items WHERE id = item_id AND user_id = auth.uid())
  );

-- Saved filter views
CREATE TABLE inbox_views (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  filter_json jsonb NOT NULL DEFAULT '{}',
  sort_json   jsonb NOT NULL DEFAULT '{}',
  is_starred  boolean NOT NULL DEFAULT false,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inbox_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inbox_views: own rows" ON inbox_views
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Indexes for common queries
CREATE INDEX inbox_items_user_status ON inbox_items (user_id, status);
CREATE INDEX inbox_items_user_created ON inbox_items (user_id, created_at DESC);
CREATE INDEX inbox_item_tags_item ON inbox_item_tags (item_id);
CREATE INDEX inbox_item_tags_tag ON inbox_item_tags (tag_id);
CREATE INDEX inbox_tags_user ON inbox_tags (user_id, type, sort_order);

-- Add explicit bucket for Now/Next/Later grouping mode.
ALTER TABLE inbox_items
  ADD COLUMN bucket text CHECK (bucket IN ('now', 'next', 'later')) DEFAULT NULL;
