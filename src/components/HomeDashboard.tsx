import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { CATEGORIES, SIMCHA_TYPE_LABELS, type SimchaType } from '@/lib/constants';
import { UnreadBadge } from './UnreadBadge';
import { AdSlot } from './AdSlot';
import { User, ChevronRight, MailPlus } from 'lucide-react';

interface ChatRow {
  key: string;
  title: string;
  subtitle: string;
  unread: number;
  simchaType: SimchaType;
  city: string;
  lastAt: string | null;
}

interface Props {
  onOpenChat: (simchaType: SimchaType, city: string) => void;
  onOpenProfile: () => void;
  onOpenAdPurchase: () => void;
  onOpenInvitations: () => void;
}

export function HomeDashboard({ onOpenChat, onOpenProfile, onOpenAdPurchase, onOpenInvitations }: Props) {
  const { profile, isGuest } = useAuth();
  const [rows, setRows] = useState<ChatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setLoadError(false);
      try {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const { data: posts, error: postsError } = await supabase
          .from('simcha_posts')
          .select('id, simcha_type, target_city, created_at, user_id')
          .gte('created_at', since)
          .order('created_at', { ascending: false });
        if (postsError) throw postsError;

        // last_seen_posts is authenticated-only; guests skip unread tracking
        const seenMap = new Map<string, string>();
        if (!isGuest) {
          const { data: seen, error: seenError } = await supabase
            .from('last_seen_posts')
            .select('simcha_type, city, last_seen_at');
          if (seenError) throw seenError;
          (seen ?? []).forEach((s) => {
            seenMap.set(`${s.simcha_type}|${s.city}`, s.last_seen_at);
          });
        }
        const myId = profile?.id;
        const map = new Map<string, ChatRow>();
        (posts ?? []).forEach((p) => {
          const key = `${p.simcha_type}|${p.target_city}`;
          const seenAt = seenMap.get(key);
          const isUnread = !seenAt || p.created_at > seenAt;
          const isMine = p.user_id === myId;

          let row = map.get(key);
          if (!row) {
            row = {
              key,
              title: `${p.target_city} ${SIMCHA_TYPE_LABELS[p.simcha_type as SimchaType]}s`,
              subtitle: `${p.target_city} · ${SIMCHA_TYPE_LABELS[p.simcha_type as SimchaType]}`,
              unread: 0,
              simchaType: p.simcha_type as SimchaType,
              city: p.target_city,
              lastAt: p.created_at,
            };
            map.set(key, row);
          }
          if (p.created_at > (row.lastAt ?? '')) row.lastAt = p.created_at;
          if (isUnread && !isMine) row.unread += 1;
        });

        const arr = Array.from(map.values()).sort((a, b) => b.unread - a.unread || (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));
        if (active) setRows(arr);
      } catch (error) {
        console.error('Failed to load the home dashboard.', error);
        if (active) {
          setRows([]);
          setLoadError(true);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [profile?.id, isGuest, reloadKey]);

  return (
    <div className="pt-14 pb-24 min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-between pt-4 pb-2">
          <div>
            <h1 className="text-[34px] font-bold text-gray-900 tracking-tight">Mazel Tov</h1>
            <p className="text-gray-500 text-[15px]">Popular neighborhood chats · past day</p>
          </div>
          <button
            onClick={onOpenProfile}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors"
            aria-label="Profile"
          >
            <User size={20} />
          </button>
        </div>

        <button
          onClick={onOpenInvitations}
          className="w-full mt-3 mb-2 rounded-2xl bg-gradient-to-r from-[#fffaf0] to-[#f8f2e4] border border-[#e8d9b2] px-4 py-3.5 flex items-center gap-3 text-left hover:shadow-sm transition-shadow"
        >
          <span className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-[#987b3d] shrink-0">
            <MailPlus size={20} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-bold text-gray-900">Invitation Studio</span>
            <span className="block text-[12px] text-gray-500">Create an invitation and manage guest RSVPs</span>
          </span>
          <ChevronRight size={18} className="text-gray-400 shrink-0" />
        </button>

        {isGuest && (
          <div className="mt-2 mb-2 rounded-2xl bg-blue-50 border border-blue-100 p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <User size={18} className="text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-semibold text-blue-700">Browsing as Guest</p>
              <p className="text-[12px] text-blue-600">Want status? Sign up now!</p>
            </div>
            <button
              onClick={onOpenProfile}
              className="shrink-0 px-3 py-1.5 rounded-full bg-[#007AFF] text-white text-[13px] font-semibold hover:bg-[#0066D6] transition-colors"
            >
              Sign Up
            </button>
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-gray-400">Loading chats…</div>
        ) : loadError ? (
          <div className="py-12 text-center" role="alert">
            <p className="text-gray-600">Couldn’t load chats. Check your connection and try again.</p>
            <button
              type="button"
              onClick={() => setReloadKey((key) => key + 1)}
              className="mt-3 rounded-full bg-[#007AFF] px-4 py-2 text-sm font-semibold text-white"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="mt-2">
            {rows.map((row) => (
              <button
                key={row.key}
                onClick={() => onOpenChat(row.simchaType, row.city)}
                className="w-full flex items-center gap-3 py-3.5 px-1 border-b border-gray-100 hover:bg-gray-50/60 transition-colors text-left"
              >
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center text-xl shrink-0">
                  {CATEGORIES.find((c) => c.id === row.simchaType)?.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[17px] font-semibold text-gray-900 truncate">{row.title}</p>
                  <p className="text-[13px] text-gray-500 truncate">{row.subtitle}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <UnreadBadge count={row.unread} />
                  <ChevronRight size={18} className="text-gray-300" />
                </div>
              </button>
            ))}
            {rows.length > 0 && !loading && (
              <p className="text-center text-gray-400 text-[13px] py-6">
                Tap a category above to browse all neighborhoods
              </p>
            )}

            {rows.length === 0 && (
              <p className="py-12 text-center text-sm text-gray-500">
                No announcements in the past day. Choose a category above to explore neighborhoods.
              </p>
            )}

            {/* Ad slot */}
            <AdSlot onOpenPurchase={onOpenAdPurchase} />
          </div>
        )}
      </div>
    </div>
  );
}
