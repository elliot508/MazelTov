import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { AD_PRICING, calcAdPrice } from '@/lib/constants';
import { X, ImagePlus, Check, Mail, Clock } from 'lucide-react';

interface Props {
  onClose: () => void;
  onSubmitted: () => void;
}

export function AdPurchaseModal({ onClose, onSubmitted }: Props) {
  const { user } = useAuth();
  const [businessName, setBusinessName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [caption, setCaption] = useState('');
  const [durationDays, setDurationDays] = useState(1);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const price = calcAdPrice(durationDays);

  function handleFileSelect(file: File) {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (PNG, JPG, etc.)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB');
      return;
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!businessName.trim()) {
      setError('Business name is required.');
      return;
    }
    if (!contactEmail.trim() || !contactEmail.includes('@')) {
      setError('A valid contact email is required.');
      return;
    }
    if (!selectedFile) {
      setError('Please select an ad image.');
      return;
    }

    setBusy(true);
    try {
      const ext = selectedFile.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const fileName = `ad-requests/${user!.id}-${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from('ads')
        .upload(fileName, selectedFile, {
          cacheControl: '3600',
          contentType: selectedFile.type || 'image/jpeg',
          upsert: false,
        });
      if (upErr) throw upErr;

      const { error: insErr } = await supabase.from('ad_requests').insert({
        user_id: user!.id,
        business_name: businessName.trim(),
        contact_email: contactEmail.trim(),
        caption: caption.trim(),
        image_path: fileName,
        duration_days: durationDays,
        price_cents: price * 100,
      });
      if (insErr) throw insErr;

      setSuccess(true);
      setTimeout(() => {
        onSubmitted();
        onClose();
      }, 2000);
    } catch (err) {
      const msg =
        (err && typeof err === 'object' && 'message' in err && String((err as { message: unknown }).message)) ||
        (err instanceof Error && err.message) ||
        'Submission failed';
      setError(msg as string);
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative w-full max-w-sm bg-white rounded-3xl overflow-hidden p-8 text-center animate-slideup">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <Check size={32} className="text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Request Submitted!</h2>
          <p className="text-gray-500 text-[14px] leading-relaxed">
            Your ad is now pending review. An admin will approve it shortly, and it will go live instantly once approved.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto animate-slideup">
        <div className="sticky top-0 bg-white/95 backdrop-blur-xl px-5 pt-4 pb-3 border-b border-gray-100 flex items-center justify-between z-10">
          <h2 className="text-[19px] font-bold text-gray-900">Advertise With Us</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="px-5 py-4 space-y-4">
          {/* Pricing tiers */}
          <div>
            <p className="text-[13px] font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Clock size={14} /> Choose Duration
            </p>
            <div className="grid grid-cols-2 gap-2">
              {AD_PRICING.map((tier) => (
                <button
                  key={tier.days}
                  type="button"
                  onClick={() => setDurationDays(tier.days)}
                  className={`rounded-2xl border-2 p-3 text-center transition-all ${
                    durationDays === tier.days
                      ? 'border-[#007AFF] bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className="text-[15px] font-bold text-gray-900">{tier.label}</p>
                  <p className="text-2xl font-bold text-[#007AFF] mt-0.5">${tier.price}</p>
                  <p className="text-[11px] text-gray-400">${tier.perDay}/day</p>
                </button>
              ))}
            </div>
          </div>

          {/* Custom duration */}
          <div className="rounded-2xl bg-gray-50 p-3 flex items-center justify-between">
            <div>
              <p className="text-[13px] font-semibold text-gray-600">Custom duration</p>
              <p className="text-[11px] text-gray-400">3+ days at $20/day</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDurationDays(Math.max(3, durationDays - 1))}
                className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-600 font-bold hover:bg-gray-50 transition-colors"
              >−</button>
              <span className="w-8 text-center font-bold text-gray-900">{durationDays}</span>
              <button
                type="button"
                onClick={() => setDurationDays(Math.min(30, durationDays + 1))}
                className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-600 font-bold hover:bg-gray-50 transition-colors"
              >+</button>
            </div>
          </div>

          {/* Business info */}
          <div className="space-y-3">
            <label className="block">
              <span className="text-[13px] font-medium text-gray-600 mb-1 block">Business Name</span>
              <input
                className="form-input"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Friedman's Bakery"
                required
              />
            </label>
            <label className="block">
              <span className="text-[13px] font-medium text-gray-600 mb-1 block">Contact Email</span>
              <input
                type="email"
                className="form-input"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="you@business.com"
                required
              />
            </label>
            <label className="block">
              <span className="text-[13px] font-medium text-gray-600 mb-1 block">Ad Caption (optional)</span>
              <input
                className="form-input"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="e.g. 10% off all wedding cakes"
                maxLength={80}
              />
            </label>
          </div>

          {/* Image upload */}
          <div>
            <p className="text-[13px] font-medium text-gray-600 mb-1 block">Ad Image</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
            />
            {previewUrl ? (
              <div className="relative rounded-2xl overflow-hidden border-2 border-gray-200">
                <img src={previewUrl} alt="Ad preview" className="w-full aspect-[4/2] object-cover" />
                <button
                  type="button"
                  onClick={() => { setSelectedFile(null); setPreviewUrl(null); if (fileRef.current) fileRef.current.value = ''; }}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 backdrop-blur text-white flex items-center justify-center hover:bg-black/70 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full aspect-[4/2] rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center text-gray-400 hover:border-[#007AFF] hover:bg-blue-50/30 transition-colors"
              >
                <ImagePlus size={28} className="mb-1.5" />
                <p className="text-[14px] font-medium">Choose an image</p>
                <p className="text-[12px] mt-0.5">PNG, JPG up to 5MB</p>
              </button>
            )}
          </div>

          {/* Price summary */}
          <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] text-gray-500 font-medium">Total</p>
                <p className="text-3xl font-bold text-[#007AFF]">${price}</p>
              </div>
              <div className="text-right">
                <p className="text-[13px] text-gray-500 font-medium">Duration</p>
                <p className="text-[15px] font-bold text-gray-900">{durationDays} day{durationDays !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          {/* Payment notice */}
          <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 flex items-start gap-2">
            <Mail size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[12px] text-amber-700 leading-relaxed">
              After review, we'll contact you at your email about payment. Your ad goes live as soon as it's approved.
            </p>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full py-3.5 rounded-2xl bg-[#007AFF] text-white font-semibold text-[17px] hover:bg-[#0066D6] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {busy ? 'Submitting…' : `Submit for Review · $${price}`}
          </button>
        </form>
      </div>
    </div>
  );
}
