-- Weekend vibes: Friday banner generation + Monday reflection
CREATE TABLE IF NOT EXISTS cos_weekend_vibes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_of date NOT NULL,
  friday_prompt text,
  art_style text,
  image_url text,
  monday_reflection text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, week_of)
);

ALTER TABLE cos_weekend_vibes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'cos_weekend_vibes' AND policyname = 'Users can manage own weekend vibes'
  ) THEN
    CREATE POLICY "Users can manage own weekend vibes"
      ON cos_weekend_vibes FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Storage bucket for generated banner images
INSERT INTO storage.buckets (id, name, public) VALUES ('weekend-banners', 'weekend-banners', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Users can upload own weekend banners'
  ) THEN
    CREATE POLICY "Users can upload own weekend banners"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'weekend-banners' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Anyone can view weekend banners'
  ) THEN
    CREATE POLICY "Anyone can view weekend banners"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'weekend-banners');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Users can update own weekend banners'
  ) THEN
    CREATE POLICY "Users can update own weekend banners"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'weekend-banners' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Users can delete own weekend banners'
  ) THEN
    CREATE POLICY "Users can delete own weekend banners"
      ON storage.objects FOR DELETE
      USING (bucket_id = 'weekend-banners' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;
