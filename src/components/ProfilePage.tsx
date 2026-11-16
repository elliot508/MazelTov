import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import {
  getRank, rankProgress, pointsToNextRank, RANKS,
} from '@/lib/constants';
import { ChevronLeft, LogOut, Trash2, Award, Crown, Share2, Copy, Check, TrendingUp, MessageCircle, Pencil, CheckCircle2, XCircle, Clock, Megaphone } from 'lucide-react';
import type { AdRequest } from '@/lib/types';

interface Props {
  onBack: () => void;
  onOpenHockerChat: () => void;
  onOpenAdRequests?: () => void;
}

export function ProfilePage({ onBack, onOpenHockerChat, onOpenAdRequests }: Props) {
  const { profile, signOut, gadolLeaderId, refreshProfile } = useAuth();
  const points = profile?.points ?? 0;
  const isGadol = profile?.id === gadolLeaderId;
  const rank = getRank(points, isGadol);
  const prog = rankProgress(points, isGadol);
  const remaining = pointsToNextRank(points, isGadol);
  const isHockerOrAbove = points >= 1000 || isGadol;
  const isAdmin = profile?.is_admin ?? false;

  const [referralCount, setReferralCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Edit name state
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  // My ad requests
  const [myAdRequests, setMyAdRequests] = useState<AdRequest[]>([]);
  const [adRequestsLoading, setAdRequestsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!profile?.id) return;
      const { count } = await supabase
        .from('referrals')
        .select('id', { count: 'exact', head: true })
        .eq('referrer_id', profile.id);
      setReferralCount(count ?? 0);

      const { data: adReqs } = await supabase
        .from('ad_requests')
        .select('id, user_id, business_name, contact_email, caption, image_path, duration_days, price_cents, status, admin_note, created_at, reviewed_at')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false });
      setMyAdRequests((adReqs as AdRequest[]) ?? []);
      setAdRequestsLoading(false);
    }
    loadData();
  }, [profile?.id]);

  function handleShare() {
    const code = profile?.referral_code ?? '';
    const url = `${window.location.origin}?ref=${code}`;
    if (navigator.share) {
      navigator.share({
        title: 'Mazel Tov',
        text: 'Join me on Mazel Tov — community simcha announcements!',
        url,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleCopyCode() {
    navigator.clipboard.writeText(profile?.referral_code ?? '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function saveName() {
    if (!nameValue.trim()) {
      setNameError('Name cannot be empty.');
      return;
    }
    setSavingName(true);
    setNameError(null);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: nameValue.trim() })
      .eq('id', profile!.id);
    setSavingName(false);
    if (error) {
      setNameError(error.message);
      return;
    }
    await refreshProfile();
    setEditingName(false);
  }

  function startEditing() {
    setNameValue(profile?.display_name ?? '');
    setNameError(null);
    setEditingName(true);
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    const { error } = await supabase.rpc('delete_own_account');
    if (error) {
      setDeleteError(error.message);
      setDeleting(false);
      return;
    }
    await signOut();
  }

  function imageUrl(path: string): string {
    return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/ads/${path}`;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header bar */}
      <div className="fixed top-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-xl border-b border-gray-200/60">
        <div className="max-w-2xl mx-auto relative flex items-center h-14 px-2">
          <button onClick={onBack} className="flex items-center text-[#007AFF] active:opacity-60 transition-opacity px-2">
            <ChevronLeft size={26} />
            <span className="text-[17px] -ml-1">Back</span>
          </button>
          <div className="absolute left-1/2 -translate-x-1/2">
            <span className="font-semibold text-gray-900 text-[17px]">Profile</span>
          </div>
        </div>
      </div>

      <div className="pt-20 pb-12 max-w-2xl mx-auto px-4">
        {/* Profile card */}
        <div className="rounded-3xl overflow-hidden shadow-sm">
          <div className={`px-6 pt-8 pb-6 text-center text-white ${isGadol ? 'bg-gradient-to-br from-amber-500 via-yellow-500 to-amber-600' : 'bg-gradient-to-br from-blue-500 to-blue-600'}`}>
            <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3 text-4xl font-bold">
              {(profile?.display_name ?? '?').charAt(0).toUpperCase()}
            </div>
            {editingName ? (
              <div className="flex items-center justify-center gap-2 max-w-xs mx-auto">
                <input
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-xl bg-white/20 text-white text-center text-xl font-bold placeholder:text-white/60 focus:outline-none focus:bg-white/30 transition-colors"
                  placeholder="Display name"
                  maxLength={30}
                />
                <button
                  onClick={saveName}
                  disabled={savingName}
                  className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors shrink-0"
                >
                  <Check size={18} />
                </button>
                <button
                  onClick={() => { setEditingName(false); setNameError(null); }}
                  className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors shrink-0"
                >
                  <XCircle size={18} />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <h2 className="text-2xl font-bold">{profile?.display_name ?? 'Friend'}</h2>
                <button
                  onClick={startEditing}
                  className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
                  aria-label="Edit name"
                >
                  <Pencil size={13} />
                </button>
              </div>
            )}
            {nameError && <p className="text-red-200 text-[12px] mt-1">{nameError}</p>}
            <div className="inline-flex items-center gap-1.5 mt-2.5 px-4 py-1.5 rounded-full bg-white/20 text-[14px] font-semibold">
              {isGadol ? <Crown size={15} /> : <Award size={15} />} {rank.name}
            </div>
            {isGadol && (
              <p className="text-white/80 text-[13px] mt-2">Today's #1 — most points community-wide</p>
            )}
          </div>

          {/* Points + progress */}
          <div className="bg-white px-6 py-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-3xl font-bold text-gray-900">{points}</p>
                <p className="text-[13px] text-gray-500">Total Points</p>
              </div>
              {remaining !== null && (
                <div className="text-right">
                  <p className="text-[15px] font-semibold text-[#007AFF]">{remaining}</p>
                  <p className="text-[12px] text-gray-500">to next rank</p>
                </div>
              )}
            </div>

            {/* Progress bar */}
            <div className="mb-1.5">
              <div className="flex items-center justify-between text-[12px] text-gray-500 mb-1.5">
                <span className="font-semibold text-gray-700">{rank.name}</span>
                {!isGadol && rank.max !== Infinity && (
                  <span>{prog.current} / {prog.needed}</span>
                )}
              </div>
              <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${isGadol ? 'bg-gradient-to-r from-amber-400 to-yellow-500' : 'bg-gradient-to-r from-blue-400 to-blue-600'}`}
                  style={{ width: `${prog.pct}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Admin link */}
        {isAdmin && onOpenAdRequests && (
          <button
            onClick={onOpenAdRequests}
            className="mt-4 w-full rounded-3xl bg-gradient-to-br from-purple-500 to-purple-700 text-white shadow-sm overflow-hidden active:scale-[0.98] transition-transform"
          >
            <div className="px-5 py-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <Megaphone size={24} />
              </div>
              <div className="flex-1 text-left">
                <h3 className="text-[18px] font-bold">Ad Review Panel</h3>
                <p className="text-white/80 text-[13px] mt-0.5">Review and approve pending ad submissions</p>
              </div>
              <ChevronLeft size={22} className="rotate-180 text-white/60" />
            </div>
          </button>
        )}

        {/* Hocker Chat access */}
        {isHockerOrAbove && (
          <button
            onClick={onOpenHockerChat}
            className="mt-4 w-full rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm overflow-hidden active:scale-[0.98] transition-transform"
          >
            <div className="px-5 py-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <MessageCircle size={24} />
              </div>
              <div className="flex-1 text-left">
                <h3 className="text-[18px] font-bold">Hocker Chat</h3>
                <p className="text-white/80 text-[13px] mt-0.5">Exclusive chat for Hocker and above. Talk about whatever you like.</p>
              </div>
              <ChevronLeft size={22} className="rotate-180 text-white/60" />
            </div>
          </button>
        )}

        {/* My Ad Requests */}
        {!adRequestsLoading && myAdRequests.length > 0 && (
          <div className="mt-4 rounded-3xl bg-white shadow-sm overflow-hidden">
            <div className="px-5 pt-5 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <Megaphone size={20} className="text-[#007AFF]" />
                <h3 className="text-[18px] font-bold text-gray-900">My Ad Requests</h3>
              </div>
            </div>
            <div className="px-5 pb-5 space-y-2">
              {myAdRequests.slice(0, 5).map((req) => (
                <div key={req.id} className="flex items-center gap-3 rounded-2xl bg-gray-50 p-2.5">
                  <img src={imageUrl(req.image_path)} alt={req.business_name} className="w-14 h-14 rounded-xl object-cover shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-gray-900 truncate">{req.business_name}</p>
                    <p className="text-[12px] text-gray-500">{req.duration_days} day{req.duration_days !== 1 ? 's' : ''} · ${(req.price_cents / 100).toFixed(0)}</p>
                  </div>
                  {req.status === 'pending' && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-bold flex items-center gap-1 shrink-0">
                      <Clock size={10} /> Pending
                    </span>
                  )}
                  {req.status === 'approved' && (
                    <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[11px] font-bold flex items-center gap-1 shrink-0">
                      <CheckCircle2 size={10} /> Live
                    </span>
                  )}
                  {req.status === 'rejected' && (
                    <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[11px] font-bold flex items-center gap-1 shrink-0">
                      <XCircle size={10} /> Rejected
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Share & Refer section */}
        <div className="mt-4 rounded-3xl bg-white shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Share2 size={20} className="text-[#007AFF]" />
              <h3 className="text-[18px] font-bold text-gray-900">Share & Earn</h3>
            </div>
            <p className="text-[13px] text-gray-500">
              Share your code — you get <span className="font-semibold text-green-600">+50 pts</span>, they get <span className="font-semibold text-green-600">+25 pts</span> on signup.
            </p>
          </div>

          <div className="mx-5 mb-4">
            {/* Referral code */}
            <div className="rounded-2xl border-2 border-dashed border-gray-200 p-4">
              <p className="text-[12px] text-gray-400 font-medium uppercase tracking-wide mb-1.5">Your referral code</p>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold tracking-wider text-gray-900">{profile?.referral_code ?? '—'}</span>
                <button
                  onClick={handleCopyCode}
                  className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
                  aria-label="Copy code"
                >
                  {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            {/* Share button */}
            <button
              onClick={handleShare}
              className="w-full mt-3 py-3 rounded-2xl bg-[#007AFF] text-white font-semibold text-[15px] flex items-center justify-center gap-2 hover:bg-[#0066D6] active:scale-[0.98] transition-all"
            >
              <Share2 size={18} /> Share App
            </button>

            {/* Stats */}
            <div className="flex gap-3 mt-3">
              <div className="flex-1 rounded-xl bg-gray-50 p-3 text-center">
                <p className="text-2xl font-bold text-gray-900">{referralCount}</p>
                <p className="text-[12px] text-gray-500">People referred</p>
              </div>
              <div className="flex-1 rounded-xl bg-gray-50 p-3 text-center">
                <p className="text-2xl font-bold text-green-600">+{referralCount * 50}</p>
                <p className="text-[12px] text-gray-500">Bonus points earned</p>
              </div>
            </div>
          </div>
        </div>

        {/* Rank ladder */}
        <div className="mt-4 rounded-3xl bg-white shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={20} className="text-[#007AFF]" />
              <h3 className="text-[18px] font-bold text-gray-900">Rank Ladder</h3>
            </div>
          </div>
          <div className="px-5 pb-5 space-y-1.5">
            {RANKS.map((r) => (
              <div
                key={r.name}
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-[14px] ${
                  r.name === rank.name && !isGadol ? 'bg-blue-50 font-semibold text-[#007AFF]' : 'text-gray-600'
                }`}
              >
                <span>{r.name}</span>
                <span className="text-[12px] text-gray-400">
                  {r.min}{r.max === Infinity ? '+' : `–${r.max}`}
                </span>
              </div>
            ))}
            <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-[14px] ${isGadol ? 'bg-amber-50 font-semibold text-amber-600' : 'text-gray-600'}`}>
              <span className="flex items-center gap-1.5">
                <Crown size={13} className="text-amber-500" /> Gadol HaHock
              </span>
              <span className="text-[12px] text-gray-400">Daily #1</span>
            </div>
          </div>
        </div>

        {/* Account actions */}
        <div className="mt-4 rounded-3xl bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-5 space-y-3">
            <button
              onClick={() => { signOut(); }}
              className="w-full py-3 rounded-2xl bg-gray-100 text-gray-700 font-semibold text-[15px] flex items-center justify-center gap-2 hover:bg-gray-200 transition-colors"
            >
              <LogOut size={18} /> Sign Out
            </button>

            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full py-3 rounded-2xl bg-red-50 text-red-600 font-semibold text-[15px] flex items-center justify-center gap-2 hover:bg-red-100 transition-colors"
              >
                <Trash2 size={18} /> Delete Account
              </button>
            ) : (
              <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-4">
                <p className="text-[14px] text-red-700 font-medium text-center mb-3">
                  This will permanently delete your account and all your posts. This cannot be undone.
                </p>
                {deleteError && <p className="text-red-500 text-[13px] text-center mb-2">{deleteError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowDeleteConfirm(false); setDeleteError(null); }}
                    className="flex-1 py-2.5 rounded-xl bg-white text-gray-700 font-semibold text-[14px] border border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-semibold text-[14px] hover:bg-red-600 transition-colors disabled:opacity-50"
                  >
                    {deleting ? 'Deleting…' : 'Confirm Delete'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
