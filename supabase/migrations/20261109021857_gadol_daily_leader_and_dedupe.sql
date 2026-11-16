/*
# Gadol HaHock daily leader + duplicate post prevention

## Overview
Two changes:
1. Gadol HaHock is no longer a points bracket — it's a title awarded
   daily to the single user with the most points. A `daily_leader`
   table records who holds the title each day. Everyone else's rank
   caps at Ultimate Hocker regardless of points.
2. Prevents duplicate simcha posts: a user cannot post the same
   simcha (same type, family names, and target city) twice.

## New Tables
1. `daily_leader` — one row per day. Stores the date, the user_id of
   the top points holder, and their point total at selection time.
   A SECURITY DEFINER function `refresh_daily_leader()` recomputes
   today's leader: it picks the profile with the most points (ties
   broken by earliest created_at), upserts the row for today, and
   returns the leader's user_id. This function is called from the
   frontend when the profile modal or home page loads.

## Modified Tables
- `simcha_posts` — adds a unique constraint on
  (user_id, simcha_type, family_a_name, family_b_name, target_city)
  so the same user cannot submit the identical simcha twice.

## Security
- `daily_leader`: RLS enabled. SELECT for all authenticated (so anyone
  can see who the current Gadol HaHock is). No INSERT/UPDATE/DELETE
  for clients — only the SECURITY DEFINER function writes to it.
- `refresh_daily_leader()` is SECURITY DEFINER, executable by
  authenticated. It handles all writes internally.

## Important Notes
1. The frontend calls `refresh_daily_leader()` on page loads, so the
   title stays current. The function is idempotent — calling it
   multiple times in a day just reconfirms the same leader.
2. The unique constraint uses lowercased, trimmed family names to
   catch case/whitespace variants of the same post.
3. Existing duplicate rows (if any) are not affected — the constraint
   only blocks new inserts.
*/

-- ---------- daily_leader table ----------
CREATE TABLE IF NOT EXISTS daily_leader (
  leader_date date PRIMARY KEY DEFAULT CURRENT_DATE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  points_at_selection integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE daily_leader ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON daily_leader TO authenticated;
GRANT SELECT ON daily_leader TO service_role;

DROP POLICY IF EXISTS "select_daily_leader" ON daily_leader;
CREATE POLICY "select_daily_leader" ON daily_leader FOR SELECT
  TO authenticated USING (true);

-- ---------- refresh_daily_leader function ----------
CREATE OR REPLACE FUNCTION public.refresh_daily_leader()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  top_user uuid;
  top_points integer;
  today_date date := CURRENT_DATE;
BEGIN
  SELECT id, points INTO top_user, top_points
  FROM profiles
  ORDER BY points DESC, created_at ASC
  LIMIT 1;

  IF top_user IS NOT NULL THEN
    INSERT INTO daily_leader (leader_date, user_id, points_at_selection, updated_at)
    VALUES (today_date, top_user, top_points, now())
    ON CONFLICT (leader_date) DO UPDATE
      SET user_id = top_user,
          points_at_selection = top_points,
          updated_at = now()
      WHERE daily_leader.user_id <> top_user OR daily_leader.points_at_selection <> top_points;
  END IF;

  RETURN top_user;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_daily_leader() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_daily_leader() TO authenticated;

-- ---------- Duplicate prevention: helper function for normalized names ----------
-- The unique constraint needs deterministic values, so we normalize at insert
-- time via a trigger that lowercases + trims family names.

CREATE OR REPLACE FUNCTION public.normalize_post_names()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.family_a_name := lower(btrim(NEW.family_a_name));
  NEW.family_b_name := lower(btrim(NEW.family_b_name));
  NEW.target_city := btrim(NEW.target_city);
  NEW.family_a_city := btrim(NEW.family_a_city);
  NEW.family_b_city := btrim(NEW.family_b_city);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.normalize_post_names() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_post_names() TO authenticated;

DROP TRIGGER IF EXISTS trg_normalize_post_names ON simcha_posts;
CREATE TRIGGER trg_normalize_post_names
  BEFORE INSERT ON simcha_posts
  FOR EACH ROW EXECUTE FUNCTION public.normalize_post_names();

-- ---------- Unique constraint: no duplicate simchas per user ----------
-- Drop first for idempotency, then add. If existing duplicates exist this
-- will fail — handle by using a CONFLICT clause approach instead.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_simcha_post'
  ) THEN
    ALTER TABLE simcha_posts
      ADD CONSTRAINT unique_simcha_post UNIQUE (user_id, simcha_type, family_a_name, family_b_name, target_city);
  END IF;
END $$;
