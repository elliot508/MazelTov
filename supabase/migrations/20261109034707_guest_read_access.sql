/*
# Guest (read-only) access for unauthenticated visitors

## Overview
Allows visitors to browse the Simcha Board without creating an account.
Guests can READ announcements, mazel tov counts, author profiles, ads,
and the daily leader. Guests CANNOT post, like, mark-as-seen, manage
raffle/referrals, or edit a profile — those remain authenticated-only.

## Security changes
- Grants SELECT on the public-read tables to the `anon` role:
  simcha_posts, mazel_tovs, profiles, ads, daily_leader.
- Adds SELECT policies scoped TO anon, authenticated on those tables
  so the anon-key client (used by guests) can actually read rows.
  (RLS still applies; the grant alone is not enough.)
- No write grants or write policies are added for anon, so guests
  cannot insert/update/delete anything.
- last_seen_posts, raffle_tickets, referrals stay authenticated-only
  (guests have no user_id to track state against).

## Important Notes
1. Guest = no auth session. The frontend uses the anon-key Supabase
   client, which runs as the `anon` role. These grants + policies make
   the board readable without signing in.
2. Writes from guests fail at the database (no grant / no policy),
   so the frontend gates them with a sign-in prompt as defense-in-depth.
3. The existing `refresh_daily_leader()` RPC is executable by
   `authenticated` only; guests skip that call (the leader is read
   directly from the daily_leader table instead).
*/

-- ---------- simcha_posts: guest read ----------
GRANT SELECT ON simcha_posts TO anon;

DROP POLICY IF EXISTS "select_posts_guest" ON simcha_posts;
CREATE POLICY "select_posts_guest" ON simcha_posts FOR SELECT
  TO anon USING (true);

-- ---------- mazel_tovs: guest read ----------
GRANT SELECT ON mazel_tovs TO anon;

DROP POLICY IF EXISTS "select_mazel_tovs_guest" ON mazel_tovs;
CREATE POLICY "select_mazel_tovs_guest" ON mazel_tovs FOR SELECT
  TO anon USING (true);

-- ---------- profiles: guest read ----------
GRANT SELECT ON profiles TO anon;

DROP POLICY IF EXISTS "select_profiles_guest" ON profiles;
CREATE POLICY "select_profiles_guest" ON profiles FOR SELECT
  TO anon USING (true);

-- ---------- ads: guest read ----------
GRANT SELECT ON ads TO anon;

DROP POLICY IF EXISTS "select_ads_guest" ON ads;
CREATE POLICY "select_ads_guest" ON ads FOR SELECT
  TO anon USING (true);

-- ---------- daily_leader: guest read ----------
GRANT SELECT ON daily_leader TO anon;

DROP POLICY IF EXISTS "select_daily_leader_guest" ON daily_leader;
CREATE POLICY "select_daily_leader_guest" ON daily_leader FOR SELECT
  TO anon USING (true);
