-- Add "flagged" (red-hot) toggle to CoS priorities and person topics
ALTER TABLE cos_priorities    ADD COLUMN IF NOT EXISTS flagged boolean NOT NULL DEFAULT false;
ALTER TABLE cos_person_topics ADD COLUMN IF NOT EXISTS flagged boolean NOT NULL DEFAULT false;
