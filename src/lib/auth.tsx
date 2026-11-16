import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile } from './types';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  gadolLeaderId: string | null;
  isGuest: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, displayName: string, referralCode?: string) => Promise<{ error: string | null }>;
  continueAsGuest: () => void;
  exitGuest: () => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [gadolLeaderId, setGadolLeaderId] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadGadolLeader() {
    const { data: rpc } = await supabase.rpc('refresh_daily_leader');
    if (rpc) setGadolLeaderId(rpc as string);
  }

  async function loadProfile(uid: string) {
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, points, is_admin, referral_code, created_at')
      .eq('id', uid)
      .maybeSingle();
    setProfile((data as Profile) ?? null);
  }

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        await loadGadolLeader();
        loadProfile(data.session.user.id).finally(() => mounted && setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      (async () => {
        setSession(sess);
        if (sess?.user) {
          setIsGuest(false);
          await loadGadolLeader();
          await loadProfile(sess.user.id);
        } else {
          setProfile(null);
          setGadolLeaderId(null);
        }
        setLoading(false);
      })();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value: AuthState = {
    session,
    user: session?.user ?? null,
    profile,
    gadolLeaderId,
    isGuest,
    loading,
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    },
    async signUp(email, password, displayName, referralCode) {
      const options: Record<string, unknown> = { display_name: displayName };
      if (referralCode) options.referral_code = referralCode;
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: options },
      });
      return { error: error?.message ?? null };
    },
    continueAsGuest() {
      setIsGuest(true);
      setLoading(false);
    },
    exitGuest() {
      setIsGuest(false);
    },
    async signOut() {
      await supabase.auth.signOut();
      setProfile(null);
      setIsGuest(false);
    },
    async refreshProfile() {
      if (session?.user) await loadProfile(session.user.id);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
