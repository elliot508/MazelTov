import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { SIMCHA_TYPE_LABELS, getRank, formatRelativeTime, type SimchaType } from '@/lib/constants';
import type { PostWithMeta } from '@/lib/types';
import { UnreadBadge } from './UnreadBadge';
import { Heart, Plus, ChevronLeft } from 'lucide-react';

interface Props {
  simchaType: SimchaType;
  city: string;
  onBack: () => void;
  onAddSimcha: () => void;
  onRequestSignIn?: () => void;
}

export function ChatChannel({ simchaType, city, onBack, onAddSimcha, onRequestSignIn }: Props) {
  const { user, profile, refreshProfile, gadolLeaderId, isGuest } = useAuth();
  const [posts, setPosts] = useState<PostWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const channelName = `${city} ${SIMCHA_TYPE_LABELS[simchaType]}s`;
  const [unreadCount, setUnreadCount] = useState(0);

  const loadPosts = useCallback(async () => {
    const { data, error } = await supabase
      .from('simcha_posts')
      .select(`
        id, user_id, simcha_type, family_a_name, family_a_city,
        family_b_name, family_b_city, target_city, created_at
      `)
      .eq('simcha_type', simchaType)
      .eq('target_city', city)
      .order('created_at', { ascending: true });

    if (error || !data) {
      setLoading(false);
      return;
    }

    const postRows = data as unknown as PostWithMeta[];
    const postIds = postRows.map((p) => p.id);

    const [{ data: likes }, { data: authorProfiles }] = await Promise.all([
      postIds.length
        ? supabase.from('mazel_tovs').select('post_id, user_id').in('post_id', postIds)
        : Promise.resolve({ data: [], error: null }),
      postIds.length
        ? supabase.from('profiles').select('id, display_name, points').in('id', postRows.map((p) => p.user_id))
        : Promise.resolve({ data: [], error: null }),
    ]);

    const likeMap = new Map<string, { count: number; mine: boolean }>();
    (likes ?? []).forEach((l) => {
      const cur = likeMap.get(l.post_id) ?? { count: 0, mine: false };
      cur.count += 1;
      if (l.user_id === user?.id) cur.mine = true;
      likeMap.set(l.post_id, cur);
    });

    const authorMap = new Map<string, { name: string; points: number }>();
    (authorProfiles ?? []).forEach((a) => {
      authorMap.set(a.id, { name: a.display_name, points: a.points });
    });

    const enriched: PostWithMeta[] = postRows.map((p) => {
      const lk = likeMap.get(p.id);
      const au = authorMap.get(p.user_id);
      return {
        ...p,
        mazel_tov_count: lk?.count ?? 0,
        liked_by_me: lk?.mine ?? false,
        author_name: au?.name,
        author_points: au?.points,
      };
    });

    setPosts(enriched);
    setLoading(false);
  }, [simchaType, city, user?.id]);

  // Mark channel as seen and compute unread (signed-in users only)
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: prev } = await supabase
        .from('last_seen_posts')
        .select('last_seen_at')
        .eq('simcha_type', simchaType)
        .eq('city', city)
        .eq('user_id', user.id)
        .maybeSingle();

      if (prev) {
        const { count } = await supabase
          .from('simcha_posts')
          .select('id', { count: 'exact', head: true })
          .eq('simcha_type', simchaType)
          .eq('target_city', city)
          .neq('user_id', user.id)
          .gt('created_at', prev.last_seen_at);
        setUnreadCount(count ?? 0);
      }

      await supabase
        .from('last_seen_posts')
        .upsert(
          { user_id: user.id, simcha_type: simchaType, city, last_seen_at: new Date().toISOString() },
          { onConflict: 'user_id,simcha_type,city' }
        );
    })();
  }, [simchaType, city, user?.id]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  // Realtime: refresh on new posts or likes
  useEffect(() => {
    const channel = supabase
      .channel(`chat-${simchaType}-${city}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'simcha_posts', filter: `target_city=eq.${city}` }, () => loadPosts())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mazel_tovs' }, () => loadPosts())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [simchaType, city, loadPosts]);

  async function toggleLike(post: PostWithMeta) {
    if (isGuest) {
      onRequestSignIn?.();
      return;
    }
    if (post.user_id === user?.id) return;
    if (post.liked_by_me) {
      await supabase.from('mazel_tovs').delete().eq('post_id', post.id).eq('user_id', user!.id);
    } else {
      await supabase.from('mazel_tovs').insert({ post_id: post.id });
    }
    await loadPosts();
    await refreshProfile();
  }

  function bubbleText(p: PostWithMeta): string {
    const a = p.family_a_city ? `${p.family_a_name} (${p.family_a_city})` : p.family_a_name;
    const b = p.family_b_city ? `${p.family_b_name} (${p.family_b_city})` : p.family_b_name;
    const isSingle = p.simcha_type === 'bar_mitzvah' || p.simcha_type === 'birth';
    const verb =
      p.simcha_type === 'wedding' ? 'Mazel Tov on the wedding of' :
      p.simcha_type === 'vort' ? 'Mazel Tov on the vort of' :
      p.simcha_type === 'bar_mitzvah' ? `Mazel Tov on ${a}'s bar mitzvah` :
      `Mazel Tov to the ${a} family on the birth of their baby`;
    return isSingle ? verb : `${verb} ${a} & ${b}`;
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* iOS-style header */}
      <div className="fixed top-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-xl border-b border-gray-200/60">
        <div className="max-w-2xl mx-auto relative flex items-center h-14 px-2">
          <button
            onClick={onBack}
            className="flex items-center text-[#007AFF] active:opacity-60 transition-opacity px-2"
          >
            <ChevronLeft size={26} />
            <span className="text-[17px] -ml-1">Back</span>
          </button>
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
            <span className="font-semibold text-gray-900 text-[17px] max-w-[180px] truncate">
              {channelName}
            </span>
            <UnreadBadge count={unreadCount} size="sm" />
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto pt-20 pb-28 px-4 max-w-2xl mx-auto w-full">
        {loading ? (
          <div className="py-16 text-center text-gray-400">Loading messages…</div>
        ) : posts.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-gray-400 text-[15px]">No announcements yet.</p>
            <p className="text-gray-400 text-[13px] mt-1">Tap the + button to share a simcha.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map((p) => {
              const isMine = p.user_id === user?.id;
              const rank = getRank(p.author_points ?? 0, p.user_id === gadolLeaderId);
              return (
                <div key={p.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`max-w-[78%] px-4 py-2.5 rounded-3xl ${
                      isMine
                        ? 'bg-[#007AFF] text-white rounded-br-[8px]'
                        : 'bg-[#E9E9EB] text-black rounded-bl-[8px]'
                    }`}
                  >
                    <p className="text-[17px] leading-snug">{bubbleText(p)}</p>
                    <p className={`text-[11px] mt-1 ${isMine ? 'text-white/70' : 'text-gray-500'}`}>
                      {formatRelativeTime(p.created_at)} ago
                    </p>
                  </div>

                  {/* Under-bubble: mazel tov heart / rank */}
                  <div className={`flex items-center gap-2 mt-1 px-2 ${isMine ? 'flex-row-reverse' : ''}`}>
                    {isMine ? (
                      <span className="text-[12px] text-gray-400 font-medium flex items-center gap-1">
                        <Heart size={12} className="fill-red-500 text-red-500" /> Your Post · {rank.name}
                      </span>
                    ) : (
                      <button
                        onClick={() => toggleLike(p)}
                        className={`flex items-center gap-1.5 text-[13px] font-medium px-2.5 py-1 rounded-full transition-all active:scale-90 ${
                          p.liked_by_me
                            ? 'text-red-500 bg-red-50'
                            : 'text-gray-500 hover:bg-gray-100'
                        }`}
                      >
                        <Heart
                          size={16}
                          className={p.liked_by_me ? 'fill-red-500 text-red-500' : ''}
                        />
                        {p.mazel_tov_count ?? 0}
                      </button>
                    )}
                    {!isMine && (
                      <span className="text-[11px] text-gray-400">{rank.name}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Disabled input bar (view-only board) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-gray-200/60">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="w-full h-9 rounded-full border border-gray-300 flex items-center justify-center text-gray-400 text-[15px]">
            View only — announcements board
          </div>
        </div>
      </div>

      {/* Floating add button */}
      <button
        onClick={onAddSimcha}
        className="fixed bottom-20 right-5 w-14 h-14 rounded-full bg-white shadow-lg shadow-black/15 flex items-center justify-center active:scale-90 transition-transform z-50"
        aria-label="Add simcha"
      >
        <Plus size={26} className="text-[#007AFF]" />
      </button>
    </div>
  );
}
