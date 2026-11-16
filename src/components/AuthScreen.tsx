import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { Gift } from 'lucide-react';

interface Props {
  guestOnBack?: () => void;
}

export function AuthScreen({ guestOnBack }: Props) {
  const { signIn, signUp, continueAsGuest } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) setReferralCode(ref.toUpperCase());
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const result =
        mode === 'signin'
          ? await signIn(email.trim(), password)
          : await signUp(email.trim(), password, displayName.trim() || 'Friend', referralCode ?? undefined);
      if (result.error) {
        setError(result.error);
      } else if (mode === 'signup') {
        setSuccess('Account created. If email confirmation is enabled, check your inbox before signing in.');
      }
    } catch (requestError) {
      console.error('Authentication request failed.', requestError);
      setError('We couldn’t complete that request. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 rounded-3xl bg-[#007AFF] flex items-center justify-center mb-4 shadow-lg shadow-blue-500/20">
            <span className="text-4xl">🎉</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Mazel Tov</h1>
          <p className="text-gray-500 text-sm mt-1 text-center">
            Community simcha announcements from your neighborhood
          </p>
        </div>

        {/* Referral banner */}
        {referralCode && mode === 'signup' && (
          <div className="mb-4 rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100 p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
              <Gift size={20} className="text-green-600" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-green-700">You were referred! +25 bonus points</p>
              <p className="text-[12px] text-green-600">Code: {referralCode}</p>
            </div>
          </div>
        )}

        <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
          <button
            type="button"
            onClick={() => { setMode('signup'); setError(null); setSuccess(null); }}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
              mode === 'signup' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            Create Account
          </button>
          <button
            type="button"
            onClick={() => { setMode('signin'); setError(null); setSuccess(null); }}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
              mode === 'signin' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            Sign In
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === 'signup' && (
            <input
              type="text"
              placeholder="Display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#007AFF] transition-colors text-[17px]"
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#007AFF] transition-colors text-[17px]"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#007AFF] transition-colors text-[17px]"
          />
          {error && (
            <p className="text-red-500 text-sm px-1" role="alert">{error}</p>
          )}
          {success && <p className="text-green-700 text-sm px-1" role="status">{success}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 rounded-xl bg-[#007AFF] text-white font-semibold text-[17px] hover:bg-[#0066D6] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="mt-5 flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-gray-400 text-[12px] font-medium">or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <button
          type="button"
          onClick={continueAsGuest}
          className="mt-4 w-full py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold text-[15px] hover:bg-gray-200 active:scale-[0.98] transition-all"
        >
          Continue as Guest
        </button>

        {guestOnBack && (
          <button
            type="button"
            onClick={guestOnBack}
            className="mt-3 w-full text-center text-[#007AFF] text-[14px] font-medium py-1"
          >
            Back to browsing
          </button>
        )}

        <p className="mt-4 text-center text-gray-400 text-[12px] leading-relaxed">
          Guests can browse announcements. Sign up to post simchas, give Mazel Tovs, and earn points.
        </p>
      </div>
    </div>
  );
}
