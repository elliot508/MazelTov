/*
# Hocker Chat — exclusive chat channel for Hocker+ users

## Overview
Adds a special chat room that only users with Hocker rank or above
(1000+ points) can join and send messages in. This is a free-text chat
(not simcha announcements) where hockers can talk about whatever they like.

## New Tables
1. `hocker_chat_messages` — stores messages in the hocker chat. Each row
   has user_id (author), body (message text), created_at. RLS ensures
   only users with 1000+ points can read and write.

## Security
- `hocker_chat_messages`: RLS enabled.
  - SELECT/INSERT for authenticated users whose profile has 1000+ points.
  - No UPDATE or DELETE for clients (messages are permanent).
  - service_role has full access for admin operations.
- The 1000+ point threshold is checked via a subquery against profiles.
  This matches the "Hocker" rank (min 1000) and above.
*/

CREATE TABLE IF NOT EXISTS hocker_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hocker_chat_created
  ON hocker_chat_messages (created_at DESC);

ALTER TABLE hocker_chat_messages ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON hocker_chat_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON hocker_chat_messages TO service_role;

DROP POLICY IF EXISTS "select_hocker_chat" ON hocker_chat_messages;
CREATE POLICY "select_hocker_chat" ON hocker_chat_messages FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND points >= 1000)
  );

DROP POLICY IF EXISTS "insert_hocker_chat" ON hocker_chat_messages;
CREATE POLICY "insert_hocker_chat" ON hocker_chat_messages FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND points >= 1000)
  );
