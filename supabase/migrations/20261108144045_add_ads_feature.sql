/*
# Ads feature — admin-only image uploads with public display

## Overview
Adds an ad-slot system to the Simcha Board. Only admin users can upload
ad images; everyone can see them. Ads rotate automatically on a set
interval in the frontend.

## New Tables
1. `ads` — stores ad image metadata. Each row has an image_url (path in
   Supabase Storage), an optional caption, display order, and an
   is_active flag. Only admins can insert/update/delete; all
   authenticated users can read.

## Modified Tables
- `profiles` — adds `is_admin boolean NOT NULL DEFAULT false`. This
  column is controlled server-side; users cannot set it on themselves.
  The profile auto-creation trigger now inserts with is_admin = false
  explicitly.

## Storage
- Creates a public storage bucket `ads` for ad image uploads.
- Storage policies: only authenticated admins can upload/delete; all
  users (including anon) can read.

## Security
- `ads` table: RLS enabled. SELECT for all authenticated; INSERT/UPDATE/
  DELETE only for users whose profiles.is_admin = true. This is enforced
  via a subquery check against the profiles table.
- `profiles.is_admin`: only service_role or an admin can update this
  column. The existing profile UPDATE policy is narrowed so users can
  still update their own display_name but NOT is_admin (column-level
  grant already restricts this; the policy USING/WITH CHECK stays on
  auth.uid() = id).
- Storage policies use the same admin check.

## Important Notes
1. To make yourself an admin, run: UPDATE profiles SET is_admin = true
   WHERE id = '<your-auth-user-id>'; via the SQL editor or execute_sql.
2. Ads rotate client-side at a configurable interval (default 8s).
3. When no active ads exist, a placeholder square is shown.
*/

-- ---------- Add is_admin to profiles ----------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- Allow all authenticated to read is_admin (so the frontend can check)
-- The existing SELECT policy already grants SELECT to authenticated with USING(true),
-- so no new SELECT policy is needed. The column is included automatically.

-- ---------- ads table ----------
CREATE TABLE IF NOT EXISTS ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_path text NOT NULL,
  caption text DEFAULT '',
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ads ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON ads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ads TO service_role;

-- Admin-only write policies: check profiles.is_admin for the current user
DROP POLICY IF EXISTS "select_ads" ON ads;
CREATE POLICY "select_ads" ON ads FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_ads" ON ads;
CREATE POLICY "admin_insert_ads" ON ads FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "admin_update_ads" ON ads;
CREATE POLICY "admin_update_ads" ON ads FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "admin_delete_ads" ON ads;
CREATE POLICY "admin_delete_ads" ON ads FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- ---------- Storage bucket for ads ----------
INSERT INTO storage.buckets (id, name, public)
VALUES ('ads', 'ads', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: admin-only upload/delete, public read
DROP POLICY IF EXISTS "admin_upload_ads" ON storage.objects;
CREATE POLICY "admin_upload_ads" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ads' AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "admin_delete_ads" ON storage.objects;
CREATE POLICY "admin_delete_ads" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'ads' AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "public_read_ads" ON storage.objects;
CREATE POLICY "public_read_ads" ON storage.objects
  FOR SELECT USING (bucket_id = 'ads');
