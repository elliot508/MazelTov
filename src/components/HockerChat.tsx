import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { getRank, formatRelativeTime } from '@/lib/constants';
import { ChevronLeft, Send, Crown, Lock } from 'lucide-react';

interface Props {
  onBack: () => void;
}

interface HockerMessage {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  author_name?: string;
  author_points?: number;
  is_gadol?: boolean;
}

export function HockerChat({ onBack }: Props) {
  const { user, profile, gadolLeaderId } = useAuth();
  const [messages, setMessages] = useState<HockerMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const points = profile?.points ?? 0;
  const isGadol = profile?.id === gadolLeaderId;
  const isHockerOrAbove = points >= 1000 || isGadol;
  const myRank = getRank(points, isGadol);

  const loadMessages = useCallback(async () => {
    const { data, error: qErr } = await supabase
      .from('hocker_chat_messages')
      .select('id, user_id, body, created_at')
      .order('created_at', { ascending: true })
      .limit(200);

    if (qErr || !data) {
      setLoading(false);
      return;
    }

    const userIds = [...new Set(data.map((m) => m.user_id))];
    const { data: authorProfiles } = await supabase
      .from('profiles')
      .select('id, display_name, points')
      .in('id', userIds);

    const authorMap = new Map<string, { name: string; points: number }>();
    (authorProfiles ?? []).forEach((a) => {
      authorMap.set(a.id, { name: a.display_name, points: a.points });
    });

    const enriched: HockerMessage[] = data.map((m) => {
      const au = authorMap.get(m.user_id);
      return {
        ...m,
        author_name: au?.name ?? 'Unknown',
        author_points: au?.points ?? 0,
        is_gadol: m.user_id === gadolLeaderId,
      };
    });

    setMessages(enriched);
    setLoading(false);
  }, [gadolLeaderId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('hocker-chat-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hocker_chat_messages' }, () => loadMessages())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadMessages]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || !user) return;
    setSending(true);
    setError(null);
    const { error: insErr } = await supabase
      .from('hocker_chat_messages')
      .insert({ body: text });
    setSending(false);
    if (insErr) {
      setError('Could not send message. Make sure you still have Hocker rank.');
      return;
    }
    setInput('');
    loadMessages();
  }

  // Access denied view for non-hockers
  if (!isHockerOrAbove) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
        <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center mb-4">
          <Lock size={28} className="text-gray-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Hocker Chat</h2>
        <p className="text-gray-500 text-center text-[15px] max-w-xs">
          This chat is exclusive to Hocker rank and above. You need at least 1,000 points to join.
        </p>
        <p className="text-gray-400 text-[13px] mt-1">You currently have {points} points ({myRank.name}).</p>
        <button
          onClick={onBack}
          className="mt-6 flex items-center text-[#007AFF] text-[15px] font-medium"
        >
          <ChevronLeft size={22} /> Back
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-40 bg-gradient-to-r from-emerald-600 to-teal-600">
        <div className="max-w-2xl mx-auto relative flex items-center h-14 px-2">
          <button
            onClick={onBack}
            className="flex items-center text-white active:opacity-60 transition-opacity px-2"
          >
            <ChevronLeft size={26} />
            <span className="text-[17px] -ml-1">Back</span>
          </button>
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
            <span className="font-semibold text-white text-[17px]">Hocker Chat</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto pt-20 pb-28 px-4 max-w-2xl mx-auto w-full">
        {loading ? (
          <div className="py-16 text-center text-gray-400">Loading messages…</div>
        ) : messages.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-gray-400 text-[15px]">No messages yet.</p>
            <p className="text-gray-400 text-[13px] mt-1">Start the conversation — say anything!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m) => {
              const isMine = m.user_id === user?.id;
              const authorRank = getRank(m.author_points ?? 0, m.is_gadol ?? false);
              return (
                <div key={m.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                  <div className={`flex items-center gap-1.5 mb-1 px-1 ${isMine ? 'flex-row-reverse' : ''}`}>
                    <span className="text-[12px] font-semibold text-gray-600">
                      {m.author_name ?? 'Unknown'}
                    </span>
                    {m.is_gadol && (
                      <Crown size={12} className="text-amber-500" />
                    )}
                    <span className={`text-[11px] ${m.is_gadol ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}>
                      {authorRank.name}
                    </span>
                  </div>
                  <div
                    className={`max-w-[78%] px-4 py-2.5 rounded-3xl ${
                      isMine
                        ? 'bg-emerald-600 text-white rounded-br-[8px]'
                        : 'bg-[#E9E9EB] text-black rounded-bl-[8px]'
                    }`}
                  >
                    <p className="text-[17px] leading-snug whitespace-pre-wrap break-words">{m.body}</p>
                    <p className={`text-[11px] mt-1 ${isMine ? 'text-white/70' : 'text-gray-500'}`}>
                      {formatRelativeTime(m.created_at)} ago
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-gray-200/60">
        <form onSubmit={handleSend} className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Say anything…"
            maxLength={500}
            className="flex-1 h-10 px-4 rounded-full border border-gray-300 text-[16px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-emerald-500 transition-colors"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 active:scale-90 transition-all disabled:opacity-40 shrink-0"
            aria-label="Send"
          >
            <Send size={18} />
          </button>
        </form>
        {error && <p className="text-red-500 text-[13px] text-center pb-2">{error}</p>}
      </div>
    </div>
  );
}
