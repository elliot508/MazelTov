import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { Ad } from '@/lib/types';
import { ImagePlus, Trash2, X, Upload, Megaphone } from 'lucide-react';

const ROTATE_INTERVAL = 8000;

interface Props {
  onOpenPurchase?: () => void;
}

export function AdSlot({ onOpenPurchase }: Props) {
  const { profile, isGuest } = useAuth();
  const isAdmin = profile?.is_admin ?? false;
  const [ads, setAds] = useState<Ad[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadAds = useCallback(async () => {
    const nowIso = new Date().toISOString();
    const { data } = await supabase
      .from('ads')
      .select('id, image_path, caption, display_order, is_active, expires_at, created_at')
      .eq('is_active', true)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order('display_order', { ascending: true });
    setAds((data as Ad[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAds();
  }, [loadAds]);

  // Auto-rotate through ads
  useEffect(() => {
    if (ads.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIdx((prev) => (prev + 1) % ads.length);
    }, ROTATE_INTERVAL);
    return () => clearInterval(timer);
  }, [ads.length]);

  // Realtime: refresh when ads change
  useEffect(() => {
    const channel = supabase
      .channel('ads-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ads' }, () => loadAds())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadAds]);

  async function handleUpload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const fileName = `admin-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('ads')
        .upload(fileName, file, {
          cacheControl: '3600',
          contentType: file.type || 'image/jpeg',
          upsert: false,
        });
      if (upErr) throw upErr;

      const { data: orderData } = await supabase
        .from('ads')
        .select('display_order')
        .order('display_order', { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextOrder = (orderData?.display_order ?? 0) + 1;

      const { error: insErr } = await supabase.from('ads').insert({
        image_path: fileName,
        caption: '',
        display_order: nextOrder,
        is_active: true,
      });
      if (insErr) throw insErr;

      await loadAds();
      setShowUpload(false);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      const msg =
        (err && typeof err === 'object' && 'message' in err && String((err as { message: unknown }).message)) ||
        (err instanceof Error && err.message) ||
        'Upload failed';
      setError(msg as string);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(ad: Ad) {
    await supabase.storage.from('ads').remove([ad.image_path]);
    await supabase.from('ads').delete().eq('id', ad.id);
    await loadAds();
  }

  function imageUrl(path: string): string {
    return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/ads/${path}`;
  }

  const currentAd = ads.length > 0 ? ads[currentIdx] : null;

  // Upload modal (admin only)
  const uploadModal = showUpload && (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => { setShowUpload(false); setError(null); }} />
      <div className="relative w-full max-w-sm bg-white rounded-3xl overflow-hidden animate-slideup">
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100">
          <h2 className="text-[19px] font-bold text-gray-900">Upload Ad</h2>
          <button onClick={() => { setShowUpload(false); setError(null); }} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-5">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full aspect-[4/2] rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center text-gray-400 hover:border-[#007AFF] hover:bg-blue-50/30 transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <div className="w-7 h-7 rounded-full border-2 border-gray-200 border-t-[#007AFF] animate-spin" />
            ) : (
              <>
                <ImagePlus size={28} className="mb-1.5" />
                <p className="text-[14px] font-medium">Choose an image</p>
                <p className="text-[12px] mt-0.5">PNG, JPG up to ~2MB</p>
              </>
            )}
          </button>
          {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
        </div>
      </div>
    </div>
  );

  // ---------- Empty placeholder ----------
  if (!loading && ads.length === 0) {
    return (
      <div className="mt-4">
        <div className="relative w-full aspect-[4/2] rounded-2xl border-2 border-dashed border-gray-200 bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col items-center justify-center text-center px-6">
          {isAdmin ? (
            <>
              <ImagePlus size={32} className="text-gray-300 mb-2" />
              <p className="text-gray-400 text-[15px] font-medium">No ads yet</p>
              <p className="text-gray-400 text-[13px] mt-0.5">Tap to upload your first ad</p>
              <button
                onClick={() => setShowUpload(true)}
                className="mt-3 px-4 py-2 rounded-full bg-[#007AFF] text-white text-[13px] font-semibold hover:bg-[#0066D6] transition-colors"
              >
                Upload Ad
              </button>
            </>
          ) : (
            <>
              <Megaphone size={32} className="text-gray-300 mb-2" />
              <p className="text-gray-400 text-[15px] font-medium">This could be your ad</p>
              <p className="text-gray-400 text-[13px] mt-0.5">Reach the whole community</p>
              {onOpenPurchase && !isGuest && (
                <button
                  onClick={onOpenPurchase}
                  className="mt-3 px-4 py-2 rounded-full bg-[#007AFF] text-white text-[13px] font-semibold hover:bg-[#0066D6] transition-colors"
                >
                  Advertise Here
                </button>
              )}
              {isGuest && (
                <p className="mt-3 text-gray-400 text-[12px]">Sign up to advertise</p>
              )}
            </>
          )}
        </div>
        {uploadModal}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mt-4">
        <div className="w-full aspect-[4/2] rounded-2xl bg-gray-100 animate-pulse" />
      </div>
    );
  }

  // ---------- Active ad display ----------
  return (
    <div className="mt-4">
      <div className="relative w-full aspect-[4/2] rounded-2xl overflow-hidden bg-gray-100 group">
        {currentAd && (
          <>
            <img
              src={imageUrl(currentAd.image_path)}
              alt={currentAd.caption || 'Advertisement'}
              className="w-full h-full object-cover transition-opacity duration-700"
              key={currentAd.id}
            />
            {currentAd.caption && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-4 py-2">
                <p className="text-white text-[13px] font-medium truncate">{currentAd.caption}</p>
              </div>
            )}
          </>
        )}

        {/* Dot indicators */}
        {ads.length > 1 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {ads.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentIdx(i)}
                className={`w-1.5 h-1.5 rounded-full transition-all ${
                  i === currentIdx ? 'bg-white w-4' : 'bg-white/50'
                }`}
                aria-label={`Ad ${i + 1}`}
              />
            ))}
          </div>
        )}

        {/* Admin controls */}
        {isAdmin && (
          <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => setShowUpload(true)}
              className="w-8 h-8 rounded-full bg-black/50 backdrop-blur text-white flex items-center justify-center hover:bg-black/70 transition-colors"
              aria-label="Add ad"
            >
              <Upload size={16} />
            </button>
            {currentAd && (
              <button
                onClick={() => handleDelete(currentAd)}
                className="w-8 h-8 rounded-full bg-black/50 backdrop-blur text-white flex items-center justify-center hover:bg-red-500/80 transition-colors"
                aria-label="Delete ad"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        )}

        {/* Non-admin: advertise here button */}
        {!isAdmin && onOpenPurchase && !isGuest && (
          <button
            onClick={onOpenPurchase}
            className="absolute top-2 right-2 px-3 py-1.5 rounded-full bg-black/50 backdrop-blur text-white text-[12px] font-semibold flex items-center gap-1.5 hover:bg-black/70 transition-colors"
          >
            <Megaphone size={13} /> Advertise
          </button>
        )}

        {/* Sponsored label */}
        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/40 backdrop-blur text-white text-[10px] font-semibold uppercase tracking-wide">
          Sponsored
        </span>
      </div>

      {uploadModal}
    </div>
  );
}
