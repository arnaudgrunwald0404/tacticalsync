ALTER TABLE dci_suggested_tasks ADD COLUMN IF NOT EXISTS source_url text;

ALTER TABLE cos_zoom_recordings ADD COLUMN IF NOT EXISTS share_url text;
