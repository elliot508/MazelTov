import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { NEIGHBORHOODS, SIMCHA_TYPE_LABELS, type SimchaType } from '@/lib/constants';
import { UnreadBadge } from './UnreadBadge';
import { ChevronRight } from 'lucide-react';

interface PlaceRow {
  city: string;
  unread: number;
  lastAt: string | null;
}

interface Props {
  simchaType: SimchaType;
  onOpenChat: (simchaType: SimchaType, city: string) => void;
}

export function PlacesPage({ simchaType, onOpenChat }: Props) {
  const { profile, isGuest } = useAuth();
  const [rows, setRows] = useState<PlaceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data: posts } = await supabase
        .from('simcha_posts')
        .select('id, target_city, created_at, user_id')
        .eq('simcha_type', simchaType)
        .gte('created_at', since);

      let seenMap = new Map<string, string>();
      if (!isGuest) {
        const { data: seen } = await supabase
          .from('last_seen_posts')
          .select('city, last_seen_at')
          .eq('simcha_type', simchaType);
        (seen ?? []).forEach((s) => seenMap.set(s.city, s.last_seen_at));
      }

      const myId = profile?.id;
      const counts = new Map<string, { unread: number; lastAt: string | null }>();

      (posts ?? []).forEach((p) => {
        const seenAt = seenMap.get(p.target_city);
        const isUnread = !seenAt || p.created_at > seenAt;
        const isMine = p.user_id === myId;
        let entry = counts.get(p.target_city);
        if (!entry) {
          entry = { unread: 0, lastAt: p.created_at };
          counts.set(p.target_city, entry);
        }
        if (p.created_at > (entry.lastAt ?? '')) entry.lastAt = p.created_at;
        if (isUnread && !isMine) entry.unread += 1;
      });

      const all: PlaceRow[] = NEIGHBORHOODS.map((city) => ({
        city,
        unread: counts.get(city)?.unread ?? 0,
        lastAt: counts.get(city)?.lastAt ?? null,
      })).sort((a, b) => b.unread - a.unread || (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));

      setRows(all);
      setLoading(false);
    }
    load();
  }, [simchaType, profile?.id, isGuest]);

  return (
    <div className="pt-14 pb-24 min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4">
        <h1 className="text-[34px] font-bold text-gray-900 tracking-tight pt-4">
          {SIMCHA_TYPE_LABELS[simchaType]}s
        </h1>
        <p className="text-gray-500 text-[15px] mb-2">Choose a neighborhood</p>

        {loading ? (
          <div className="py-16 text-center text-gray-400">Loading neighborhoods…</div>
        ) : (
          <div>
            {rows.map((row) => (
              <button
                key={row.city}
                onClick={() => onOpenChat(simchaType, row.city)}
                className="w-full flex items-center gap-3 py-3.5 px-1 border-b border-gray-100 hover:bg-gray-50/60 transition-colors text-left"
              >
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center text-[15px] font-bold text-[#007AFF] shrink-0">
                  {row.city.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[17px] font-semibold text-gray-900 truncate">
                    {row.city} {SIMCHA_TYPE_LABELS[simchaType]}s
                  </p>
                  <p className="text-[13px] text-gray-500 truncate">
                    {row.unread > 0 ? `${row.unread} new` : 'No new posts today'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <UnreadBadge count={row.unread} />
                  <ChevronRight size={18} className="text-gray-300" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
