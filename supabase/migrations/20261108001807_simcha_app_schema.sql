/*
# Simcha Announcement Board — Core Schema

## Overview
Creates the data model for a community simcha announcement app with an
iMessage-style layout. Users submit simchas (engagements, brissim, vorts,
bar mitzvahs, births), browse announcement channels organized by
neighborhood + category, and tap a "Mazel Tov" heart to congratulate.

## New Tables
1. `profiles` — one row per auth user. Stores display_name and total
   frum-rank points. Points are the source of truth for rank badges
   (Guest / Balabos / The Maven / The Hocker / The Gadol HaHock).
2. `simcha_posts` — each row is one announcement. Links a category
   (wedding / bris / vort / bar_mitzvah / birth), two family names + cities,
   and the target city feed. The author earns +5 points on insert.
3. `mazel_tovs` — one row per "Mazel Tov" heart tap on a post. Each
   unique (user, post) pair can like once. The post author earns +1
   point per like.
4. `last_seen_posts` — per-user, per-channel (category+city) last-opened
   timestamp. Drives the circular unread badges.

## Point System (enforced in DB via triggers)
- New simcha submitted -> author +5 points.
- Another user taps Mazel Tov on a post -> author +1 point.
- Tapping your own post is ignored (no points).
- Unliking reverses the +1.

## Security
- RLS enabled on every table.
- `profiles`: owner can read/update own row; anyone authenticated can read.
- `simcha_posts`: any authenticated user can read (public announcements)
  and insert (author only via DEFAULT auth.uid()); author can delete own.
- `mazel_tovs`: any authenticated user can read; user can insert/delete
  only their own like rows.
- `last_seen_posts`: owner-only CRUD.
- Grants restricted to authenticated (sign-in app). service_role granted
  on all tables for trigger-maintained columns.
- SECURITY DEFINER trigger functions award points so users cannot
  directly write points; they can only UPDATE their own display_name.

## Important Notes
1. `user_id` columns default to `auth.uid()` so client inserts omitting
   the owner still satisfy RLS WITH CHECK.
2. Point increments happen in triggers, never in client code.
3. All timestamps are timestamptz, default now().
*/

-- ---------- profiles ----------
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT 'Friend',
  points integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON profiles TO authenticated;
GRANT UPDATE (display_name) ON profiles TO authenticated;
GRANT SELECT, UPDATE ON profiles TO service_role;

DROP POLICY IF EXISTS "select_profiles" ON profiles;
CREATE POLICY "select_profiles" ON profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Auto-create a profile row when a new auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', 'Friend'))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------- simcha_posts ----------
CREATE TABLE IF NOT EXISTS simcha_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  simcha_type text NOT NULL CHECK (simcha_type IN ('wedding','bris','vort','bar_mitzvah','birth')),
  family_a_name text NOT NULL,
  family_a_city text NOT NULL DEFAULT '',
  family_b_name text NOT NULL,
  family_b_city text NOT NULL DEFAULT '',
  target_city text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE simcha_posts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON simcha_posts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON simcha_posts TO service_role;

CREATE INDEX IF NOT EXISTS idx_posts_channel_time
  ON simcha_posts (simcha_type, target_city, created_at DESC);

DROP POLICY IF EXISTS "select_posts" ON simcha_posts;
CREATE POLICY "select_posts" ON simcha_posts FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_post" ON simcha_posts;
CREATE POLICY "insert_own_post" ON simcha_posts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_post" ON simcha_posts;
CREATE POLICY "delete_own_post" ON simcha_posts FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ---------- mazel_tovs ----------
CREATE TABLE IF NOT EXISTS mazel_tovs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES simcha_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);

ALTER TABLE mazel_tovs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON mazel_tovs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON mazel_tovs TO service_role;

DROP POLICY IF EXISTS "select_mazel_tovs" ON mazel_tovs;
CREATE POLICY "select_mazel_tovs" ON mazel_tovs FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_mazel_tov" ON mazel_tovs;
CREATE POLICY "insert_own_mazel_tov" ON mazel_tovs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_mazel_tov" ON mazel_tovs;
CREATE POLICY "delete_own_mazel_tov" ON mazel_tovs FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ---------- last_seen_posts ----------
CREATE TABLE IF NOT EXISTS last_seen_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  simcha_type text NOT NULL,
  city text NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, simcha_type, city)
);

ALTER TABLE last_seen_posts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON last_seen_posts TO authenticated;

DROP POLICY IF EXISTS "select_own_last_seen" ON last_seen_posts;
CREATE POLICY "select_own_last_seen" ON last_seen_posts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_last_seen" ON last_seen_posts;
CREATE POLICY "insert_own_last_seen" ON last_seen_posts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_last_seen" ON last_seen_posts;
CREATE POLICY "update_own_last_seen" ON last_seen_posts FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_last_seen" ON last_seen_posts;
CREATE POLICY "delete_own_last_seen" ON last_seen_posts FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ---------- Point-awarding trigger: new simcha (+5 author) ----------
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
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.award_post_points() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_post_points() TO authenticated;

DROP TRIGGER IF EXISTS trg_award_post_points ON simcha_posts;
CREATE TRIGGER trg_award_post_points
  AFTER INSERT ON simcha_posts
  FOR EACH ROW EXECUTE FUNCTION public.award_post_points();

-- ---------- Point-awarding trigger: mazel tov (+1 author) ----------
CREATE OR REPLACE FUNCTION public.award_mazel_tov_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  post_author uuid;
BEGIN
  SELECT user_id INTO post_author FROM public.simcha_posts WHERE id = NEW.post_id;
  IF post_author IS NOT NULL AND post_author <> NEW.user_id THEN
    UPDATE public.profiles
    SET points = points + 1
    WHERE id = post_author;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.award_mazel_tov_points() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_mazel_tov_points() TO authenticated;

DROP TRIGGER IF EXISTS trg_award_mazel_tov ON mazel_tovs;
CREATE TRIGGER trg_award_mazel_tov
  AFTER INSERT ON mazel_tovs
  FOR EACH ROW EXECUTE FUNCTION public.award_mazel_tov_points();

-- ---------- Reverse point on unlike ----------
CREATE OR REPLACE FUNCTION public.reverse_mazel_tov_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  post_author uuid;
BEGIN
  SELECT user_id INTO post_author FROM public.simcha_posts WHERE id = OLD.post_id;
  IF post_author IS NOT NULL AND post_author <> OLD.user_id THEN
    UPDATE public.profiles
    SET points = GREATEST(0, points - 1)
    WHERE id = post_author;
  END IF;
  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reverse_mazel_tov_points() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_mazel_tov_points() TO authenticated;

DROP TRIGGER IF EXISTS trg_reverse_mazel_tov ON mazel_tovs;
CREATE TRIGGER trg_reverse_mazel_tov
  AFTER DELETE ON mazel_tovs
  FOR EACH ROW EXECUTE FUNCTION public.reverse_mazel_tov_points();
