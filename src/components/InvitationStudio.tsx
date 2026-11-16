import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowLeft, CalendarDays, Check, Copy, ExternalLink, Heart, Mail, MessageCircle,
  Plus, Users,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Invitation, InvitationAttendance, InvitationRsvp, InvitationTemplate } from '@/lib/types';
import { InvitationCard, type InvitationCardData } from './InvitationCard';

type InvitationForm = Omit<Invitation, 'id' | 'user_id' | 'created_at'>;
type StudioTab = 'design' | 'guests' | 'notes';

const templates: { id: InvitationTemplate; name: string; detail: string; colors: string }[] = [
  { id: 'classic_gold', name: 'Classic Gold', detail: 'Timeless · warm gold accents', colors: 'border-[#c8aa61] bg-[#fffdf7] text-[#927432]' },
  { id: 'modern_navy', name: 'Modern Navy', detail: 'Clean · contemporary navy', colors: 'border-[#263c5a] bg-[#f7f9fc] text-[#263c5a]' },
  { id: 'floral', name: 'Floral', detail: 'Soft · romantic blush', colors: 'border-[#d5aebd] bg-[#fff9fb] text-[#9b6378]' },
  { id: 'traditional', name: 'Traditional', detail: 'Elegant · heritage inspired', colors: 'border-[#a3784e] bg-[#fffbf3] text-[#805632]' },
];

function blankForm(): InvitationForm {
  return {
    template: 'classic_gold',
    title: '',
    honorees: '',
    event_date: '',
    event_time: '',
    venue_address: '',
    dress_code: '',
    schedule: '',
  };
}

function attendanceLabel(status: InvitationAttendance) {
  return status === 'accepts' ? 'Joyfully Accepts' : 'Regretfully Declines';
}

function formatSubmittedAt(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function InvitationStudio({ onBack }: { onBack: () => void }) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<InvitationForm>(blankForm);
  const [tab, setTab] = useState<StudioTab>('design');
  const [rsvps, setRsvps] = useState<InvitationRsvp[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(true);
  const [loadingRsvps, setLoadingRsvps] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadInvitations() {
      const { data, error: queryError } = await supabase
        .from('invitations')
        .select('id, user_id, template, title, honorees, event_date, event_time, venue_address, dress_code, schedule, created_at')
        .order('created_at', { ascending: false });
      if (!active) return;
      if (queryError) {
        setError(queryError.message);
      } else {
        const rows = (data ?? []) as Invitation[];
        setInvitations(rows);
        if (rows.length) setSelectedId(rows[0].id);
      }
      setLoadingInvitations(false);
    }
    loadInvitations();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const selected = invitations.find((item) => item.id === selectedId);
    if (selected) {
      setForm({
        template: selected.template,
        title: selected.title,
        honorees: selected.honorees,
        event_date: selected.event_date,
        event_time: selected.event_time,
        venue_address: selected.venue_address,
        dress_code: selected.dress_code,
        schedule: selected.schedule,
      });
    } else if (!selectedId) {
      setForm(blankForm());
    }
  }, [invitations, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setRsvps([]);
      return;
    }
    let active = true;
    async function loadRsvps() {
      const { data, error: queryError } = await supabase
        .from('invitation_rsvps')
        .select('id, invitation_id, guest_name, attending_status, adults, kids, dietary_notes, mazel_tov_message, created_at')
        .eq('invitation_id', selectedId)
        .order('created_at', { ascending: false });
      if (!active) return;
      if (queryError) {
        setError(queryError.message);
      } else {
        setRsvps((data ?? []) as InvitationRsvp[]);
      }
      setLoadingRsvps(false);
    }
    setLoadingRsvps(true);
    loadRsvps();
    const channel = supabase
      .channel(`invitation-rsvps-${selectedId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'invitation_rsvps',
        filter: `invitation_id=eq.${selectedId}`,
      }, () => { loadRsvps(); })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' && active) {
          setNotice('Live refresh is unavailable; the guest list will continue to refresh periodically.');
        }
      });
    const refreshInterval = window.setInterval(() => { loadRsvps(); }, 30_000);
    return () => {
      active = false;
      window.clearInterval(refreshInterval);
      void supabase.removeChannel(channel);
    };
  }, [selectedId]);

  const selectedInvitation = invitations.find((item) => item.id === selectedId);
  const preview: InvitationCardData = { ...form, id: selectedId ?? undefined };
  const shareUrl = selectedId
    ? `${window.location.origin}${window.location.pathname}?invite=${encodeURIComponent(selectedId)}`
    : '';
  const accepts = rsvps.filter((rsvp) => rsvp.attending_status === 'accepts').length;
  const declines = rsvps.length - accepts;
  const notes = rsvps.filter((rsvp) => rsvp.mazel_tov_message.trim());

  function startNewInvitation() {
    setSelectedId(null);
    setTab('design');
    setError('');
    setNotice('');
  }

  async function saveInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    const payload: InvitationForm = {
      ...form,
      title: form.title.trim(),
      honorees: form.honorees.trim(),
      venue_address: form.venue_address.trim(),
      dress_code: form.dress_code.trim(),
      schedule: form.schedule.trim(),
    };
    const result = selectedId
      ? await supabase.from('invitations').update(payload).eq('id', selectedId).select('id, user_id, template, title, honorees, event_date, event_time, venue_address, dress_code, schedule, created_at').single()
      : await supabase.from('invitations').insert(payload).select('id, user_id, template, title, honorees, event_date, event_time, venue_address, dress_code, schedule, created_at').single();
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    const saved = result.data as Invitation;
    setInvitations((previous) => selectedId
      ? previous.map((item) => item.id === saved.id ? saved : item)
      : [saved, ...previous]);
    setSelectedId(saved.id);
    setForm(payload);
    setNotice('Invitation saved. Your shareable RSVP link is ready.');
  }

  async function copyInvitationLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setNotice('Invitation link copied.');
      window.setTimeout(() => setCopied(false), 1800);
    } catch (copyError) {
      setError(copyError instanceof Error ? `Could not copy the link: ${copyError.message}` : 'Could not copy the link.');
    }
  }

  function shareViaWhatsApp() {
    if (!shareUrl) return;
    const text = `${form.title || 'You are invited'} — please RSVP here: ${shareUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <main className="min-h-screen bg-[#faf9f6] pb-12">
      <header className="sticky top-0 z-30 border-b border-gray-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-3">
          <button onClick={onBack} className="flex items-center gap-1 px-2 text-[#927432]">
            <ArrowLeft size={20} /> <span className="text-sm font-medium">Home</span>
          </button>
          <h1 className="absolute left-1/2 -translate-x-1/2 text-[16px] font-semibold text-gray-900">Invitation Studio</h1>
          <button onClick={startNewInvitation} className="ml-auto flex items-center gap-1 rounded-full bg-[#927432] px-3 py-2 text-xs font-semibold text-white hover:bg-[#7b622c]">
            <Plus size={15} /> New
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 pt-5">
        {invitations.length > 0 && (
          <label className="mb-4 block max-w-lg">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Your invitations</span>
            <select
              value={selectedId ?? ''}
              onChange={(event) => { setSelectedId(event.target.value || null); setError(''); setNotice(''); }}
              className="form-input"
            >
              <option value="">New invitation (unsaved)</option>
              {invitations.map((invitation) => (
                <option key={invitation.id} value={invitation.id}>{invitation.title || 'Untitled invitation'}</option>
              ))}
            </select>
          </label>
        )}

        <nav className="mb-5 flex gap-2 overflow-x-auto rounded-2xl bg-gray-200/70 p-1" aria-label="Invitation sections">
          {([
            ['design', 'Invitation Studio'],
            ['guests', 'Guest List'],
            ['notes', 'Mazel Tov Notes'],
          ] as [StudioTab, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`min-h-10 shrink-0 rounded-xl px-4 text-sm font-semibold transition-colors ${tab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
            >
              {label}
            </button>
          ))}
        </nav>

        {error && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}
        {notice && <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">{notice}</p>}

        {tab === 'design' && (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.9fr)]">
            <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-5">
                <h2 className="text-xl font-bold text-gray-900">{selectedInvitation ? 'Edit your invitation' : 'Create your invitation'}</h2>
                <p className="mt-1 text-sm text-gray-500">Choose a style, add the celebration details, and preview as you go.</p>
              </div>
              <form onSubmit={saveInvitation} className="space-y-5">
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold text-gray-700">Choose a template</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {templates.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => setForm({ ...form, template: template.id })}
                        className={`rounded-2xl border-2 p-3 text-left transition-all ${template.colors} ${form.template === template.id ? 'ring-2 ring-offset-1 ring-gray-300' : 'opacity-75 hover:opacity-100'}`}
                      >
                        <span className="block text-sm font-bold">{template.name}</span>
                        <span className="mt-0.5 block text-[11px] opacity-80">{template.detail}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className="mb-1.5 block text-sm font-medium text-gray-700">Event Title</span>
                    <input required maxLength={160} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="form-input" placeholder="e.g. The Wedding of…" />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="mb-1.5 block text-sm font-medium text-gray-700">Honorees</span>
                    <input required maxLength={160} value={form.honorees} onChange={(e) => setForm({ ...form, honorees: e.target.value })} className="form-input" placeholder="Names as they should appear" />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-gray-700">Date</span>
                    <input required type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} className="form-input" />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-gray-700">Time</span>
                    <input type="time" value={form.event_time} onChange={(e) => setForm({ ...form, event_time: e.target.value })} className="form-input" />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="mb-1.5 block text-sm font-medium text-gray-700">Venue Address</span>
                    <textarea maxLength={300} rows={2} value={form.venue_address} onChange={(e) => setForm({ ...form, venue_address: e.target.value })} className="form-input resize-y" placeholder="Venue name and full address" />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="mb-1.5 block text-sm font-medium text-gray-700">Dress Code</span>
                    <input maxLength={120} value={form.dress_code} onChange={(e) => setForm({ ...form, dress_code: e.target.value })} className="form-input" placeholder="Optional" />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="mb-1.5 block text-sm font-medium text-gray-700">Schedule</span>
                    <textarea maxLength={2000} rows={4} value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} className="form-input resize-y" placeholder={'6:30 PM — Kabbalas Panim\n7:30 PM — Chuppah'} />
                  </label>
                </div>
                <button type="submit" disabled={saving || loadingInvitations} className="min-h-12 w-full rounded-xl bg-[#927432] px-4 text-base font-semibold text-white hover:bg-[#7b622c] disabled:opacity-60">
                  {saving ? 'Saving…' : selectedInvitation ? 'Save Invitation' : 'Save Invitation & Create RSVP Link'}
                </button>
              </form>

              {shareUrl && (
                <div className="mt-5 border-t border-gray-100 pt-5">
                  <p className="mb-2 text-sm font-semibold text-gray-800">Share this invitation</p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button onClick={copyInvitationLink} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                      {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy Link'}
                    </button>
                    <button onClick={shareViaWhatsApp} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-3 text-sm font-semibold text-white hover:bg-[#20bd5a]">
                      <MessageCircle size={16} /> Share via WhatsApp
                    </button>
                  </div>
                  <a href={shareUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[#927432] hover:underline">
                    Preview public RSVP page <ExternalLink size={13} />
                  </a>
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6 lg:sticky lg:top-20">
              <div className="mb-4 flex items-center gap-2 px-1">
                <CalendarDays size={18} className="text-[#927432]" />
                <h2 className="text-base font-bold text-gray-900">Live Preview</h2>
              </div>
              <InvitationCard invitation={preview} />
            </section>
          </div>
        )}

        {tab === 'guests' && (
          <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Guest List</h2>
                <p className="mt-1 text-sm text-gray-500">{selectedInvitation?.title || 'Save an invitation to start collecting RSVPs.'}</p>
              </div>
              <div className="flex gap-2">
                <span className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{accepts} accepting</span>
                <span className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600">{declines} declining</span>
              </div>
            </div>
            {!selectedId ? (
              <p className="py-12 text-center text-sm text-gray-500">Create and save an invitation to see guest RSVPs here.</p>
            ) : loadingRsvps ? (
              <p className="py-12 text-center text-sm text-gray-500">Loading guest list…</p>
            ) : rsvps.length === 0 ? (
              <div className="py-12 text-center">
                <Users size={30} className="mx-auto text-gray-300" />
                <p className="mt-3 text-sm text-gray-500">No RSVPs yet. Share your invitation link to get started.</p>
              </div>
            ) : (
              <div className="mt-5 divide-y divide-gray-100">
                {rsvps.map((rsvp) => (
                  <article key={rsvp.id} className="py-4 first:pt-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-gray-900">{rsvp.guest_name}</h3>
                        <p className="mt-0.5 text-xs text-gray-500">{formatSubmittedAt(rsvp.created_at)}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${rsvp.attending_status === 'accepts' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                        {attendanceLabel(rsvp.attending_status)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-gray-600">{rsvp.adults} adult{rsvp.adults !== 1 ? 's' : ''} · {rsvp.kids} kid{rsvp.kids !== 1 ? 's' : ''}</p>
                    {rsvp.dietary_notes && <p className="mt-1 text-sm text-gray-600"><span className="font-medium">Dietary:</span> {rsvp.dietary_notes}</p>}
                    {rsvp.mazel_tov_message && <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm italic text-rose-800">“{rsvp.mazel_tov_message}”</p>}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'notes' && (
          <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-500"><Heart size={20} /></span>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Mazel Tov Notes</h2>
                <p className="text-sm text-gray-500">{selectedInvitation?.title || 'Messages from your guests'}</p>
              </div>
            </div>
            {!selectedId ? (
              <p className="py-12 text-center text-sm text-gray-500">Create an invitation to collect personal notes.</p>
            ) : loadingRsvps ? (
              <p className="py-12 text-center text-sm text-gray-500">Loading messages…</p>
            ) : notes.length === 0 ? (
              <div className="py-12 text-center">
                <Mail size={30} className="mx-auto text-gray-300" />
                <p className="mt-3 text-sm text-gray-500">Guest blessings and notes will appear here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {notes.map((rsvp) => (
                  <article key={rsvp.id} className="rounded-2xl border border-rose-100 bg-[#fffafb] p-4">
                    <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-gray-800">“{rsvp.mazel_tov_message}”</p>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-rose-100 pt-3">
                      <p className="text-sm font-semibold text-gray-700">With love, {rsvp.guest_name}</p>
                      <p className="text-xs text-gray-400">{formatSubmittedAt(rsvp.created_at)}</p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {!selectedId && invitations.length === 0 && loadingInvitations && (
          <p className="mt-6 text-center text-sm text-gray-500">Loading invitations…</p>
        )}
      </div>
    </main>
  );
}
