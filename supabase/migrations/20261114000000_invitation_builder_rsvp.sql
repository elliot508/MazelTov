-- Invitations are private to their host; guests access invitation details and
-- submit RSVPs only through the narrowly scoped public RPCs below.
CREATE TABLE IF NOT EXISTS public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  template text NOT NULL CHECK (template IN ('classic_gold', 'modern_navy', 'floral', 'traditional')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  honorees text NOT NULL CHECK (length(btrim(honorees)) BETWEEN 1 AND 160),
  event_date date NOT NULL,
  event_time text NOT NULL DEFAULT '' CHECK (length(event_time) <= 30),
  venue_address text NOT NULL DEFAULT '' CHECK (length(venue_address) <= 300),
  dress_code text NOT NULL DEFAULT '' CHECK (length(dress_code) <= 120),
  schedule text NOT NULL DEFAULT '' CHECK (length(schedule) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitations_user_created
  ON public.invitations (user_id, created_at DESC);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invitations TO authenticated;

DROP POLICY IF EXISTS "select_own_invitations" ON public.invitations;
CREATE POLICY "select_own_invitations" ON public.invitations FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_invitations" ON public.invitations;
CREATE POLICY "insert_own_invitations" ON public.invitations FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_invitations" ON public.invitations;
CREATE POLICY "update_own_invitations" ON public.invitations FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_invitations" ON public.invitations;
CREATE POLICY "delete_own_invitations" ON public.invitations FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.invitation_rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid NOT NULL REFERENCES public.invitations(id) ON DELETE CASCADE,
  guest_name text NOT NULL CHECK (length(btrim(guest_name)) BETWEEN 1 AND 100),
  attending_status text NOT NULL CHECK (attending_status IN ('accepts', 'declines')),
  adults integer NOT NULL CHECK (adults BETWEEN 0 AND 50),
  kids integer NOT NULL CHECK (kids BETWEEN 0 AND 50),
  dietary_notes text NOT NULL DEFAULT '' CHECK (length(dietary_notes) <= 1000),
  mazel_tov_message text NOT NULL DEFAULT '' CHECK (length(mazel_tov_message) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitation_rsvps_invitation_created
  ON public.invitation_rsvps (invitation_id, created_at DESC);

ALTER TABLE public.invitation_rsvps ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.invitation_rsvps TO authenticated;

DROP POLICY IF EXISTS "select_host_invitation_rsvps" ON public.invitation_rsvps;
CREATE POLICY "select_host_invitation_rsvps" ON public.invitation_rsvps FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.invitations
      WHERE invitations.id = invitation_rsvps.invitation_id
        AND invitations.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.get_public_invitation(p_invitation_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', id,
    'template', template,
    'title', title,
    'honorees', honorees,
    'event_date', event_date,
    'event_time', event_time,
    'venue_address', venue_address,
    'dress_code', dress_code,
    'schedule', schedule
  )
  FROM public.invitations
  WHERE id = p_invitation_id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_invitation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_invitation(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_invitation_rsvp(
  p_invitation_id uuid,
  p_guest_name text,
  p_attending_status text,
  p_adults integer,
  p_kids integer,
  p_dietary_notes text DEFAULT '',
  p_mazel_tov_message text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_rsvp_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.invitations WHERE id = p_invitation_id) THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  IF p_guest_name IS NULL OR length(btrim(p_guest_name)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Guest name must be between 1 and 100 characters';
  END IF;
  IF p_attending_status NOT IN ('accepts', 'declines') THEN
    RAISE EXCEPTION 'Attending status is invalid';
  END IF;
  IF p_adults IS NULL OR p_adults NOT BETWEEN 0 AND 50
     OR p_kids IS NULL OR p_kids NOT BETWEEN 0 AND 50 THEN
    RAISE EXCEPTION 'Guest counts must be between 0 and 50';
  END IF;
  IF length(COALESCE(p_dietary_notes, '')) > 1000
     OR length(COALESCE(p_mazel_tov_message, '')) > 2000 THEN
    RAISE EXCEPTION 'RSVP notes exceed the allowed length';
  END IF;

  INSERT INTO public.invitation_rsvps (
    invitation_id, guest_name, attending_status, adults, kids,
    dietary_notes, mazel_tov_message
  )
  VALUES (
    p_invitation_id, btrim(p_guest_name), p_attending_status, p_adults, p_kids,
    COALESCE(p_dietary_notes, ''), COALESCE(p_mazel_tov_message, '')
  )
  RETURNING id INTO new_rsvp_id;

  RETURN new_rsvp_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_invitation_rsvp(uuid, text, text, integer, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_invitation_rsvp(uuid, text, text, integer, integer, text, text) TO anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'invitation_rsvps'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.invitation_rsvps;
  END IF;
END;
$$;
