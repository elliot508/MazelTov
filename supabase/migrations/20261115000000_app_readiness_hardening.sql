-- Ticket awards are only performed by trusted database functions/triggers.
REVOKE EXECUTE ON FUNCTION public.award_raffle_ticket(uuid, text) FROM authenticated;

CREATE OR REPLACE FUNCTION public.process_referral(p_referred_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref_code text;
  referrer_id uuid;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_referred_id THEN
    RAISE EXCEPTION 'Users can only process their own referral';
  END IF;

  SELECT referred_by INTO ref_code
  FROM public.profiles
  WHERE id = p_referred_id
  FOR UPDATE;

  IF ref_code IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (SELECT 1 FROM public.referrals WHERE referred_id = p_referred_id) THEN
    RETURN false;
  END IF;

  SELECT id INTO referrer_id
  FROM public.profiles
  WHERE referral_code = ref_code;

  IF NOT FOUND OR referrer_id = p_referred_id THEN
    RETURN false;
  END IF;

  UPDATE public.profiles SET points = points + 50 WHERE id = referrer_id;
  UPDATE public.profiles SET points = points + 25 WHERE id = p_referred_id;

  INSERT INTO public.referrals (referrer_id, referred_id)
  VALUES (referrer_id, p_referred_id);

  PERFORM public.award_raffle_ticket(referrer_id, 'referral');

  UPDATE public.profiles SET referred_by = NULL WHERE id = p_referred_id;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_referral(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_referral(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_user_ticket_count(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cnt integer;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Users can only view their own ticket count';
  END IF;

  SELECT COUNT(*) INTO cnt
  FROM public.raffle_tickets
  WHERE user_id = p_user_id
    AND month_key = to_char(now(), 'YYYY-MM');

  RETURN cnt;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_ticket_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_ticket_count(uuid) TO authenticated;
