/*
# Ad Purchase Requests + Ad Expiry + Profile Edit

## Overview
Three changes:
1. Allows any signed-in user to submit an ad purchase request. They
   pick a duration (1/2/3+ days), enter contact info + caption, upload
   an image, and the request goes to admin for review. When admin
   approves, the ad goes live instantly with an expiry date.
2. Adds `expires_at` to the `ads` table so purchased ads auto-expire
   after their paid duration. Admin-uploaded ads can have no expiry.
3. No schema change needed for profile editing — the existing
   `update_own_profile` policy + `GRANT UPDATE (display_name)` already
   allows users to edit their display name. The frontend just wasn't
   using it.

## New Tables
1. `ad_requests` — one row per ad purchase submission. Columns:
   - id, user_id (submitter), business_name, contact_email,
     caption, image_path (uploaded to ads storage bucket),
     duration_days (1/2/3+), price_cents (calculated server-side),
     status ('pending' / 'approved' / 'rejected'),
     admin_note (optional feedback from admin),
     created_at, reviewed_at, reviewed_by.
   - When approved, a trigger inserts a row into `ads` with
     is_active=true, display_order=next available, and expires_at
     = now() + duration_days. The ad goes live instantly.

## Modified Tables
- `ads` — adds `expires_at timestamptz` column. NULL means no expiry
  (admin-uploaded ads). The frontend filters out expired ads by
  checking expires_at > now().

## Pricing (enforced server-side in the approve function)
- 1 day = $25 (2500 cents)
- 2 days = $45 (4500 cents)
- 3+ days = $20/day (2000 cents * duration_days)
Price is recalculated server-side on approval; the client-sent
price is ignored to prevent tampering. Payment is handled separately
via Stripe (not yet configured — the flow records the request for
admin review; actual charging happens when Stripe is set up).

## Security
- `ad_requests`: RLS enabled.
  - Users can SELECT only their own requests.
  - Users can INSERT only their own requests (user_id = auth.uid()).
  - Admins can SELECT all requests, UPDATE status/admin_note/reviewed_by
    on any request, and DELETE any request.
  - No user UPDATE/DELETE — once submitted, a request is immutable
    by the user.
- `ads.expires_at`: included in the existing SELECT grant; the
  existing admin write policies already cover the column.
- `approve_ad_request()` is SECURITY DEFINER, executable by
  authenticated. It checks the caller is an admin before approving.
  It inserts into ads and marks the request approved in one operation.

## Important Notes
1. The image is uploaded to the same `ads` storage bucket before
   submitting the request. The storage upload policy currently allows
   only admins. We add a new policy allowing any authenticated user
   to upload to a `ad-requests/` prefix within the ads bucket, so
   user-submitted ad images are separated from live admin ads.
2. When admin approves, the image is already in the bucket — the
   approve function just creates the `ads` row pointing to it.
3. Expired ads (expires_at < now()) are filtered out by the frontend
   query. A scheduled cleanup can deactivate them later.
4. Payment: since Stripe is not yet configured, the flow is
   "submit for review" → admin approves → ad goes live. When Stripe
   is connected, a payment step will be inserted before submission.
*/

-- ---------- Add expires_at to ads ----------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ads' AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE ads ADD COLUMN expires_at timestamptz;
  END IF;
END $$;

-- ---------- ad_requests table ----------
CREATE TABLE IF NOT EXISTS ad_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name text NOT NULL,
  contact_email text NOT NULL,
  caption text NOT NULL DEFAULT '',
  image_path text NOT NULL,
  duration_days integer NOT NULL DEFAULT 1 CHECK (duration_days >= 1),
  price_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_note text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ad_requests_status ON ad_requests (status, created_at DESC);

ALTER TABLE ad_requests ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON ad_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ad_requests TO service_role;

-- Users can read their own requests
DROP POLICY IF EXISTS "select_own_ad_requests" ON ad_requests;
CREATE POLICY "select_own_ad_requests" ON ad_requests FOR SELECT
  TO authenticated USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Users can insert their own requests
DROP POLICY IF EXISTS "insert_own_ad_requests" ON ad_requests;
CREATE POLICY "insert_own_ad_requests" ON ad_requests FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- Admins can update request status
DROP POLICY IF EXISTS "admin_update_ad_requests" ON ad_requests;
CREATE POLICY "admin_update_ad_requests" ON ad_requests FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Admins can delete requests
DROP POLICY IF EXISTS "admin_delete_ad_requests" ON ad_requests;
CREATE POLICY "admin_delete_ad_requests" ON ad_requests FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- ---------- Storage: allow users to upload ad request images ----------
-- Users can upload to the 'ad-requests/' prefix in the ads bucket
DROP POLICY IF EXISTS "user_upload_ad_requests" ON storage.objects;
CREATE POLICY "user_upload_ad_requests" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ads' AND
    name LIKE 'ad-requests/%'
  );

-- Users can read ad request images (they need to see their own submission preview)
-- The existing public_read_ads policy already covers all objects in the ads bucket.

-- ---------- approve_ad_request function ----------
CREATE OR REPLACE FUNCTION public.approve_ad_request(p_request_id uuid, p_admin_note text DEFAULT '')
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req record;
  next_order integer;
  is_admin boolean;
  calc_price integer;
BEGIN
  -- Verify caller is admin
  SELECT is_admin INTO is_admin FROM profiles WHERE id = auth.uid();
  IF NOT is_admin THEN
    RAISE EXCEPTION 'Only admins can approve ad requests';
  END IF;

  -- Load the request
  SELECT * INTO req FROM ad_requests WHERE id = p_request_id AND status = 'pending';
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Calculate price server-side (cannot trust client-sent price)
  IF req.duration_days = 1 THEN
    calc_price := 2500;
  ELSIF req.duration_days = 2 THEN
    calc_price := 4500;
  ELSE
    calc_price := 2000 * req.duration_days;
  END IF;

  -- Get next display_order
  SELECT COALESCE(MAX(display_order), 0) + 1 INTO next_order FROM ads;

  -- Insert into ads (goes live instantly)
  INSERT INTO ads (image_path, caption, display_order, is_active, expires_at)
  VALUES (req.image_path, req.caption, next_order, true, now() + (req.duration_days || ' days')::interval);

  -- Mark request as approved
  UPDATE ad_requests
  SET status = 'approved',
      admin_note = p_admin_note,
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      price_cents = calc_price
  WHERE id = p_request_id;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_ad_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_ad_request(uuid, text) TO authenticated;

-- ---------- reject_ad_request function ----------
CREATE OR REPLACE FUNCTION public.reject_ad_request(p_request_id uuid, p_admin_note text DEFAULT '')
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean;
BEGIN
  SELECT is_admin INTO is_admin FROM profiles WHERE id = auth.uid();
  IF NOT is_admin THEN
    RAISE EXCEPTION 'Only admins can reject ad requests';
  END IF;

  UPDATE ad_requests
  SET status = 'rejected',
      admin_note = p_admin_note,
      reviewed_at = now(),
      reviewed_by = auth.uid()
  WHERE id = p_request_id AND status = 'pending';

  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_ad_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_ad_request(uuid, text) TO authenticated;
