import type { SimchaType } from './constants';

export interface Profile {
  id: string;
  display_name: string;
  points: number;
  is_admin: boolean;
  referral_code: string | null;
  created_at: string;
}

export interface Ad {
  id: string;
  image_path: string;
  caption: string;
  display_order: number;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

export interface AdRequest {
  id: string;
  user_id: string;
  business_name: string;
  contact_email: string;
  caption: string;
  image_path: string;
  duration_days: number;
  price_cents: number;
  status: 'pending' | 'approved' | 'rejected';
  admin_note: string;
  created_at: string;
  reviewed_at: string | null;
}

export interface SimchaPost {
  id: string;
  user_id: string;
  simcha_type: SimchaType;
  family_a_name: string;
  family_a_city: string;
  family_b_name: string;
  family_b_city: string;
  target_city: string;
  created_at: string;
}

export interface MazelTov {
  id: string;
  post_id: string;
  user_id: string;
  created_at: string;
}

export interface LastSeenPost {
  id: string;
  user_id: string;
  simcha_type: SimchaType;
  city: string;
  last_seen_at: string;
}

export interface PostWithMeta extends SimchaPost {
  author_name?: string;
  author_points?: number;
  mazel_tov_count?: number;
  liked_by_me?: boolean;
}

export type InvitationTemplate = 'classic_gold' | 'modern_navy' | 'floral' | 'traditional';
export type InvitationAttendance = 'accepts' | 'declines';

export interface Invitation {
  id: string;
  user_id: string;
  template: InvitationTemplate;
  title: string;
  honorees: string;
  event_date: string;
  event_time: string;
  venue_address: string;
  dress_code: string;
  schedule: string;
  created_at: string;
}

export interface InvitationRsvp {
  id: string;
  invitation_id: string;
  guest_name: string;
  attending_status: InvitationAttendance;
  adults: number;
  kids: number;
  dietary_notes: string;
  mazel_tov_message: string;
  created_at: string;
}
