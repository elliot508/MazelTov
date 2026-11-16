import { useEffect, useState, type FormEvent } from 'react';
import { CalendarDays, CheckCircle2, Heart, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Invitation, InvitationAttendance } from '@/lib/types';
import { downloadInvitationCalendar, InvitationCard } from './InvitationCard';

type PublicInvitation = Omit<Invitation, 'user_id' | 'created_at'>;

const initialForm = {
  guestName: '',
  attendingStatus: 'accepts' as InvitationAttendance,
  adults: 1,
  kids: 0,
  dietaryNotes: '',
  message: '',
};

export function InvitationPublicPage({ invitationId }: { invitationId: string }) {
  const [invitation, setInvitation] = useState<PublicInvitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadInvitation() {
      const { data, error } = await supabase.rpc('get_public_invitation', {
        p_invitation_id: invitationId,
      });
      if (!active) return;
      if (error) {
        setLoadError(error.message);
      } else if (data) {
        setInvitation(data as PublicInvitation);
      } else {
        setLoadError('This invitation could not be found.');
      }
      setLoading(false);
    }
    loadInvitation();
    return () => { active = false; };
  }, [invitationId]);

  async function submitRsvp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invitation) return;
    setSubmitting(true);
    setSubmitError('');
    const { error } = await supabase.rpc('submit_invitation_rsvp', {
      p_invitation_id: invitation.id,
      p_guest_name: form.guestName.trim(),
      p_attending_status: form.attendingStatus,
      p_adults: form.adults,
      p_kids: form.kids,
      p_dietary_notes: form.dietaryNotes.trim(),
      p_mazel_tov_message: form.message.trim(),
    });
    setSubmitting(false);
    if (error) {
      setSubmitError(error.message);
      return;
    }
    setSubmitted(true);
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">Loading invitation…</div>;
  }

  if (!invitation) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#faf9f6] px-5">
        <div className="max-w-md rounded-3xl bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-gray-900">Invitation unavailable</h1>
          <p className="mt-2 text-sm text-gray-600">{loadError || 'This invitation could not be found.'}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#faf9f6] px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#927432]">Mazel Tov</p>
          <p className="mt-1 text-sm text-gray-500">You are warmly invited</p>
        </div>
        <InvitationCard invitation={invitation} />

        <button
          type="button"
          onClick={() => downloadInvitationCalendar(invitation)}
          className="mx-auto mt-5 flex min-h-11 items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <CalendarDays size={17} /> Add to Calendar
        </button>

        <section className="mx-auto mt-8 max-w-md rounded-3xl border border-gray-100 bg-white p-5 shadow-sm sm:p-7">
          {submitted ? (
            <div className="py-5 text-center" role="status">
              <CheckCircle2 size={40} className="mx-auto text-emerald-500" />
              <h2 className="mt-3 text-xl font-bold text-gray-900">Thank you, {form.guestName.trim()}!</h2>
              <p className="mt-2 text-sm text-gray-600">Your RSVP and note have been sent to the host.</p>
              {form.message.trim() && <p className="mt-4 rounded-2xl bg-rose-50 p-4 text-sm italic text-rose-800">“{form.message.trim()}”</p>}
            </div>
          ) : (
            <>
              <div className="mb-5 text-center">
                <h2 className="text-2xl font-bold text-gray-900">Kindly Reply</h2>
                <p className="mt-1 text-sm text-gray-500">Let the host know if you can join.</p>
              </div>
              <form onSubmit={submitRsvp} className="space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-gray-700">Guest Name</span>
                  <input
                    required
                    maxLength={100}
                    value={form.guestName}
                    onChange={(e) => setForm({ ...form, guestName: e.target.value })}
                    className="form-input"
                    autoComplete="name"
                  />
                </label>

                <fieldset>
                  <legend className="mb-2 text-sm font-medium text-gray-700">Attending Status</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {([
                      ['accepts', 'Joyfully Accepts'],
                      ['declines', 'Regretfully Declines'],
                    ] as const).map(([value, label]) => (
                      <label key={value} className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-medium ${form.attendingStatus === value ? 'border-[#927432] bg-[#fffaf0] text-gray-900' : 'border-gray-200 text-gray-600'}`}>
                        <input
                          type="radio"
                          name="attendingStatus"
                          value={value}
                          checked={form.attendingStatus === value}
                          onChange={() => setForm({ ...form, attendingStatus: value })}
                          className="accent-[#927432]"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-gray-700">Adults</span>
                    <input
                      type="number" min={0} max={50} required
                      value={form.adults}
                      onChange={(e) => setForm({ ...form, adults: Number(e.target.value) })}
                      className="form-input"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-gray-700">Kids</span>
                    <input
                      type="number" min={0} max={50} required
                      value={form.kids}
                      onChange={(e) => setForm({ ...form, kids: Number(e.target.value) })}
                      className="form-input"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-gray-700">Dietary Notes <span className="font-normal text-gray-400">(optional)</span></span>
                  <textarea
                    maxLength={1000} rows={2}
                    value={form.dietaryNotes}
                    onChange={(e) => setForm({ ...form, dietaryNotes: e.target.value })}
                    className="form-input resize-y"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                    <Heart size={15} className="text-rose-400" /> Mazel Tov Message <span className="font-normal text-gray-400">(optional)</span>
                  </span>
                  <textarea
                    maxLength={2000} rows={4}
                    placeholder="Write a personal blessing or note for the host…"
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    className="form-input resize-y"
                  />
                </label>

                {submitError && <p className="text-sm text-red-600" role="alert">{submitError}</p>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#927432] px-4 text-base font-semibold text-white transition-colors hover:bg-[#7b622c] disabled:opacity-60"
                >
                  <Send size={17} /> {submitting ? 'Sending…' : 'Send RSVP'}
                </button>
              </form>
            </>
          )}
        </section>
        <p className="mt-8 text-center text-xs text-gray-400">Made with Mazel Tov</p>
      </div>
    </main>
  );
}
