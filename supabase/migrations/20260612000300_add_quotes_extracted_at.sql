-- Track which transcripts have been processed for quote extraction.
ALTER TABLE cos_zoom_transcripts
  ADD COLUMN IF NOT EXISTS quotes_extracted_at timestamptz;
