-- Setup Storage Bucket for Avatars
-- 
-- IMPORTANT: This migration sets up storage policies, but the bucket itself
-- must be created manually in the Supabase Dashboard or via the Storage API.
--
-- To create the bucket:
-- 1. Go to your Supabase Dashboard
-- 2. Navigate to Storage
-- 3. Click "New bucket"
-- 4. Name it: "avatars"
-- 5. Make it PUBLIC (so avatar images can be accessed)
-- 6. Click "Create bucket"
--
-- Alternatively, you can create it via the Supabase CLI:
-- supabase storage create avatars --public
--
-- After creating the bucket, run this migration to set up the storage policies.

-- Note: RLS is already enabled on storage.objects by default in Supabase
-- We only need to create the policies below

-- Policy: Allow authenticated users to upload their own avatars
DROP POLICY IF EXISTS "Users can upload their own avatars" ON storage.objects;
CREATE POLICY "Users can upload their own avatars"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text OR
  name LIKE (auth.uid()::text || '/%')
);

-- Policy: Allow authenticated users to update their own avatars
DROP POLICY IF EXISTS "Users can update their own avatars" ON storage.objects;
CREATE POLICY "Users can update their own avatars"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  ((storage.foldername(name))[1] = auth.uid()::text OR name LIKE (auth.uid()::text || '/%'))
)
WITH CHECK (
  bucket_id = 'avatars' AND
  ((storage.foldername(name))[1] = auth.uid()::text OR name LIKE (auth.uid()::text || '/%'))
);

-- Policy: Allow authenticated users to delete their own avatars
DROP POLICY IF EXISTS "Users can delete their own avatars" ON storage.objects;
CREATE POLICY "Users can delete their own avatars"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  ((storage.foldername(name))[1] = auth.uid()::text OR name LIKE (auth.uid()::text || '/%'))
);

-- Policy: Allow public read access to avatars (since bucket is public)
DROP POLICY IF EXISTS "Public can view avatars" ON storage.objects;
CREATE POLICY "Public can view avatars"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- Policy: Allow authenticated users to list their own avatar folder
DROP POLICY IF EXISTS "Users can list their own avatar folder" ON storage.objects;
CREATE POLICY "Users can list their own avatar folder"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars' AND
  ((storage.foldername(name))[1] = auth.uid()::text OR name LIKE (auth.uid()::text || '/%'))
);

