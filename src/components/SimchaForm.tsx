import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { CATEGORIES, NEIGHBORHOODS, SIMCHA_TYPE_LABELS, SINGLE_FAMILY_TYPES, type SimchaType } from '@/lib/constants';
import { X } from 'lucide-react';

interface Props {
  defaultSimchaType: SimchaType;
  defaultCity: string;
  onClose: () => void;
  onSubmitted: () => void;
}

export function SimchaForm({ defaultSimchaType, defaultCity, onClose, onSubmitted }: Props) {
  const { user, refreshProfile } = useAuth();
  const [simchaType, setSimchaType] = useState<SimchaType>(defaultSimchaType);
  const [familyAName, setFamilyAName] = useState('');
  const [familyACity, setFamilyACity] = useState('');
  const [familyBName, setFamilyBName] = useState('');
  const [familyBCity, setFamilyBCity] = useState('');
  const [targetCity, setTargetCity] = useState(defaultCity);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSingleFamily = SINGLE_FAMILY_TYPES.includes(simchaType);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!familyAName.trim()) {
      setError('Family name is required.');
      return;
    }
    if (!isSingleFamily && !familyBName.trim()) {
      setError('Both family names are required.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: insErr } = await supabase.from('simcha_posts').insert({
      user_id: user!.id,
      simcha_type: simchaType,
      family_a_name: familyAName.trim(),
      family_a_city: familyACity.trim(),
      family_b_name: isSingleFamily ? '' : familyBName.trim(),
      family_b_city: isSingleFamily ? '' : familyBCity.trim(),
      target_city: targetCity,
    });
    setBusy(false);
    if (insErr) {
      if (insErr.code === '23505' || insErr.message.includes('duplicate') || insErr.message.includes('unique_simcha_post')) {
        setError('This simcha has already been posted. You can\'t post the same one twice.');
      } else {
        setError(insErr.message);
      }
      return;
    }
    await refreshProfile();
    onSubmitted();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto animate-slideup">
        <div className="sticky top-0 bg-white/95 backdrop-blur-xl px-5 pt-4 pb-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-[19px] font-bold text-gray-900">New Simcha</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="px-5 py-4 space-y-4">
          <Field label="Simcha Type">
            <select
              value={simchaType}
              onChange={(e) => setSimchaType(e.target.value as SimchaType)}
              className="form-input"
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.emoji} {SIMCHA_TYPE_LABELS[c.id]}</option>
              ))}
            </select>
          </Field>

          <div className="rounded-2xl bg-gray-50 p-3 space-y-3">
            <p className="text-[13px] font-semibold text-gray-500 uppercase tracking-wide">
              {isSingleFamily ? 'Family' : 'Family A'}
            </p>
            <Field label="Name">
              <input className="form-input" value={familyAName} onChange={(e) => setFamilyAName(e.target.value)} placeholder="e.g. Friedman" required />
            </Field>
            <Field label="City">
              <input className="form-input" value={familyACity} onChange={(e) => setFamilyACity(e.target.value)} placeholder="e.g. Lakewood" />
            </Field>
          </div>

          {!isSingleFamily && (
            <div className="rounded-2xl bg-gray-50 p-3 space-y-3">
              <p className="text-[13px] font-semibold text-gray-500 uppercase tracking-wide">Family B</p>
              <Field label="Name">
                <input className="form-input" value={familyBName} onChange={(e) => setFamilyBName(e.target.value)} placeholder="e.g. Goldberg" required />
              </Field>
              <Field label="City">
                <input className="form-input" value={familyBCity} onChange={(e) => setFamilyBCity(e.target.value)} placeholder="e.g. Boro Park" />
              </Field>
            </div>
          )}

          <Field label="Target City Feed">
            <select value={targetCity} onChange={(e) => setTargetCity(e.target.value)} className="form-input">
              {NEIGHBORHOODS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </Field>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-3.5 rounded-2xl bg-[#007AFF] text-white font-semibold text-[17px] hover:bg-[#0066D6] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {busy ? 'Posting…' : 'Post Simcha (+5 pts)'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-gray-600 mb-1 block">{label}</span>
      {children}
    </label>
  );
}
