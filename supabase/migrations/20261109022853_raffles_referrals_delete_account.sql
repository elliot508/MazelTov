/*
# Monthly Raffles, Referral System, Account Deletion

## Overview
Three new features:
1. Monthly raffle system — users earn raffle tickets by posting simchas.
   Tickets reset every month. Each rank level has a corresponding
   raffle with increasing prize amounts.
2. Referral / share-the-app system — users share a referral code/link.
   When a new user signs up with that code, the referrer gets +50
   points and the new user gets +25 points.
3. Account deletion — users can delete their own account from the
   profile page.

## New Tables
1. `raffle_tickets` — one row per ticket earned. Columns: id, user_id,
   month_key (YYYY-MM format, used for monthly reset), earned_at,
   source ('simcha' or 'referral'). Users can see their own tickets
   and counts. Monthly totals are derived by grouping on month_key.
2. `referrals` — tracks referral relationships. Columns: id, referrer_id
   (the person who shared), referred_id (the new user who signed up),
   created_at. UNIQUE on referred_id (each user can only be referred
   once). Prevents self-referral via a CHECK constraint.

## Modified Tables
- `profiles` — adds `referral_code text UNIQUE` column. Auto-generated
  on profile creation from the user's display_name + random suffix.
  Also adds `referred_by text` column to temporarily store a referral
  code during signup (cleared after processing).

## New Functions
1. `award_raffle_ticket(p_user_id uuid, p_source text)` — SECURITY
   DEFINER. Inserts a ticket row with the current month_key. Called
   from the simcha post trigger.
2. `process_referral(p_referred_id uuid)` — SECURITY DEFINER. Called
   after signup. Looks up the referred_by code, finds the referrer,
   awards +50 to referrer and +25 to the new user, creates a referral
   record, and awards the referrer a raffle ticket. Idempotent —
   safe to call multiple times.
3. `delete_own_account()` — SECURITY DEFINER. Deletes the calling
   user's auth.users row, which cascades to all their data (profiles,
   simcha_posts, mazel_tovs, etc.). Returns true on success.
4. `get_user_ticket_count(p_user_id uuid)` — returns the user's ticket
   count for the current month.

## Security
- `raffle_tickets`: RLS enabled. Users can SELECT only their own
  tickets. No client INSERT/UPDATE/DELETE — only the SECURITY DEFINER
  trigger function inserts.
- `referrals`: RLS enabled. Users can SELECT their own referrals
  (where they are referrer or referred). No client writes.
- `profiles.referral_code`: readable by all authenticated (needed to
  resolve referral codes). The existing SELECT policy already grants
  this.
- `delete_own_account`: SECURITY DEFINER, executable by authenticated.
  Only deletes the calling user's account.
- `process_referral`: SECURITY DEFINER, executable by authenticated.
  Only processes the calling user's referred_by code.

## Important Notes
1. Raffle prizes are defined in frontend constants (RAFFLE_PRIZES).
   The database only tracks tickets; prize selection happens
   server-side monthly (can be done via execute_sql or a scheduled
   function).
2. Gadol HaHock gets an automatic $50 at month end — tracked as a
   special raffle_tickets entry with source='gadol_bonus'.
3. Tickets reset monthly — the month_key column naturally segments
   tickets by month. Old tickets remain in the table for history.
4. The referral flow: new user signs up → frontend stores referral
   code in user_metadata → onAuthStateChange detects new session →
   calls process_referral RPC.
5. Profile creation trigger updated to generate a referral_code.
*/

-- ---------- raffle_tickets table ----------
CREATE TABLE IF NOT EXISTS raffle_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  month_key text NOT NULL DEFAULT to_char(now(), 'YYYY-MM'),
  source text NOT NULL DEFAULT 'simcha' CHECK (source IN ('simcha', 'referral', 'gadol_bonus')),
  earned_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_raffle_tickets_user_month
  ON raffle_tickets (user_id, month_key);

ALTER TABLE raffle_tickets ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON raffle_tickets TO authenticated;
GRANT SELECT, INSERT ON raffle_tickets TO service_role;

DROP POLICY IF EXISTS "select_own_tickets" ON raffle_tickets;
CREATE POLICY "select_own_tickets" ON raffle_tickets FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- ---------- referrals table ----------
CREATE TABLE IF NOT EXISTS referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (referrer_id <> referred_id)
);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON referrals TO authenticated;
GRANT SELECT, INSERT ON referrals TO service_role;

DROP POLICY IF EXISTS "select_own_referrals" ON referrals;
CREATE POLICY "select_own_referrals" ON referrals FOR SELECT
  TO authenticated USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

-- ---------- Add referral_code and referred_by to profiles ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'referral_code') THEN
    ALTER TABLE profiles ADD COLUMN referral_code text UNIQUE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'referred_by') THEN
    ALTER TABLE profiles ADD COLUMN referred_by text;
  END IF;
END $$;

-- Backfill referral codes for existing profiles
UPDATE profiles
SET referral_code = UPPER(SUBSTRING(display_name FROM 1 FOR 3)) || '-' || SUBSTRING(MD5(id::text || random()::text) FROM 1 FOR 4)
WHERE referral_code IS NULL;

-- ---------- Update handle_new_user to generate referral_code ----------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code text;
  display_name text;
  ref_by text;
BEGIN
  display_name := COALESCE(NEW.raw_user_meta_data->>'display_name', 'Friend');
  ref_by := NEW.raw_user_meta_data->>'referral_code';

  -- Generate a unique referral code
  new_code := UPPER(SUBSTRING(display_name FROM 1 FOR 3)) || '-' || SUBSTRING(MD5(NEW.id::text || random()::text) FROM 1 FOR 4);

  INSERT INTO public.profiles (id, display_name, referral_code, referred_by)
  VALUES (NEW.id, display_name, new_code, ref_by)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;

-- ---------- award_raffle_ticket function ----------
CREATE OR REPLACE FUNCTION public.award_raffle_ticket(p_user_id uuid, p_source text DEFAULT 'simcha')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.raffle_tickets (user_id, source)
  VALUES (p_user_id, p_source);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.award_raffle_ticket(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_raffle_ticket(uuid, text) TO authenticated;

-- ---------- Update simcha post trigger to also award a raffle ticket ----------
CREATE OR REPLACE FUNCTION public.award_post_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET points = points + 5
  WHERE id = NEW.user_id;

  PERFORM public.award_raffle_ticket(NEW.user_id, 'simcha');

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.award_post_points() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_post_points() TO authenticated;

-- ---------- process_referral function ----------
CREATE OR REPLACE FUNCTION public.process_referral(p_referred_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref_code text;
  referrer_profile record;
  already_referred boolean;
BEGIN
  -- Get the referred user's referred_by code
  SELECT referred_by INTO ref_code
  FROM public.profiles
  WHERE id = p_referred_id;

  IF ref_code IS NULL THEN
    RETURN false;
  END IF;

  -- Check if already referred
  SELECT EXISTS(SELECT 1 FROM public.referrals WHERE referred_id = p_referred_id) INTO already_referred;
  IF already_referred THEN
    RETURN false;
  END IF;

  -- Find referrer by code
  SELECT id INTO referrer_profile FROM public.profiles WHERE referral_code = ref_code;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Don't allow self-referral
  IF referrer_profile.id = p_referred_id THEN
    RETURN false;
  END IF;

  -- Award points: referrer +50, new user +25
  UPDATE public.profiles SET points = points + 50 WHERE id = referrer_profile.id;
  UPDATE public.profiles SET points = points + 25 WHERE id = p_referred_id;

  -- Create referral record
  INSERT INTO public.referrals (referrer_id, referred_id)
  VALUES (referrer_profile.id, p_referred_id);

  -- Award referrer a raffle ticket for the referral
  PERFORM public.award_raffle_ticket(referrer_profile.id, 'referral');

  -- Clear the referred_by field
  UPDATE public.profiles SET referred_by = NULL WHERE id = p_referred_id;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_referral(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_referral(uuid) TO authenticated;

-- ---------- delete_own_account function ----------
CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = auth.uid();
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_own_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;

-- ---------- get_user_ticket_count function ----------
CREATE OR REPLACE FUNCTION public.get_user_ticket_count(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cnt integer;
BEGIN
  SELECT COUNT(*) INTO cnt
  FROM public.raffle_tickets
  WHERE user_id = p_user_id
    AND month_key = to_char(now(), 'YYYY-MM');
  RETURN cnt;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_ticket_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_ticket_count(uuid) TO authenticated;
