# Setup Avatars Storage Bucket

The application requires a storage bucket named `avatars` to store user profile photos. This bucket needs to be created in your Supabase project.

## Quick Setup (Recommended)

### Option 1: Via Supabase Dashboard

1. Go to your [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Navigate to **Storage** in the left sidebar
4. Click **"New bucket"** button
5. Configure the bucket:
   - **Name**: `avatars`
   - **Public bucket**: ✅ **Enable this** (so avatar images can be accessed publicly)
   - **File size limit**: 5MB (optional, but recommended)
   - **Allowed MIME types**: `image/*` (optional, but recommended)
6. Click **"Create bucket"**

### Option 2: Via Supabase CLI

If you have the Supabase CLI installed:

```bash
supabase storage create avatars --public
```

## Storage Policies

After creating the bucket, run the migration to set up storage policies:

```bash
# If using Supabase CLI locally
supabase migration up

# Or apply the migration manually in the Supabase SQL Editor
# File: supabase/migrations/20250101000000_setup_avatars_storage.sql
```

The migration sets up the following policies:
- ✅ Users can upload their own avatars (in their user ID folder)
- ✅ Users can update their own avatars
- ✅ Users can delete their own avatars
- ✅ Public can view avatars (read access)
- ✅ Users can list files in their own avatar folder

## Verify Setup

After creating the bucket and running the migration, try uploading a profile photo in the app. The upload should work without the "Bucket not found" error.

## Troubleshooting

### Error: "Bucket not found"
- Make sure the bucket is named exactly `avatars` (lowercase)
- Verify the bucket exists in your Supabase Dashboard

### Error: "Upload failed" or "Access denied"
- Make sure the bucket is set to **Public**
- Verify the storage policies were applied correctly
- Check that you're authenticated when uploading

### Error: "File too large"
- The bucket has a default 50MB limit, but the app enforces 5MB
- You can set a custom file size limit in the bucket settings





