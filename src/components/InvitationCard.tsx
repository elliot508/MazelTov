import { Flower2, Sparkles } from 'lucide-react';
import type { Invitation, InvitationTemplate } from '@/lib/types';

export type InvitationCardData = Pick<
  Invitation,
  'template' | 'title' | 'honorees' | 'event_date' | 'event_time' | 'venue_address' | 'dress_code' | 'schedule'
> & { id?: string };

const templateStyles: Record<InvitationTemplate, { frame: string; accent: string; ornament: string }> = {
  classic_gold: {
    frame: 'border-[#c8aa61] bg-[#fffdf7]',
    accent: 'text-[#927432]',
    ornament: 'bg-[#c8aa61]/30',
  },
  modern_navy: {
    frame: 'border-[#263c5a] bg-[#f7f9fc]',
    accent: 'text-[#263c5a]',
    ornament: 'bg-[#263c5a]/25',
  },
  floral: {
    frame: 'border-[#d5aebd] bg-[#fff9fb]',
    accent: 'text-[#9b6378]',
    ornament: 'bg-[#d5aebd]/40',
  },
  traditional: {
    frame: 'border-[#a3784e] bg-[#fffbf3]',
    accent: 'text-[#805632]',
    ornament: 'bg-[#a3784e]/30',
  },
};

function displayDate(date: string): string {
  if (!date) return 'Date to be announced';
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export function InvitationCard({ invitation }: { invitation: InvitationCardData }) {
  const style = templateStyles[invitation.template];

  return (
    <article className={`relative mx-auto w-full max-w-md overflow-hidden rounded-[2rem] border-2 px-7 py-9 text-center shadow-lg sm:px-10 ${style.frame}`}>
      <div className={`mx-auto mb-5 h-px w-20 ${style.ornament}`} />
      {invitation.template === 'floral' ? (
        <Flower2 size={26} className={`mx-auto mb-3 ${style.accent}`} strokeWidth={1.4} />
      ) : (
        <Sparkles size={24} className={`mx-auto mb-3 ${style.accent}`} strokeWidth={1.4} />
      )}
      <p className={`text-[11px] font-semibold uppercase tracking-[0.3em] ${style.accent}`}>With joy and gratitude</p>
      <h1 className="mt-4 font-serif text-3xl font-semibold leading-tight text-gray-900 sm:text-4xl">
        {invitation.title || 'Your celebration'}
      </h1>
      <p className="mt-3 text-[15px] text-gray-600">Honoring</p>
      <p className={`mt-1 whitespace-pre-line font-serif text-2xl ${style.accent}`}>
        {invitation.honorees || 'Your honorees'}
      </p>
      <div className={`mx-auto my-6 h-px w-16 ${style.ornament}`} />
      <p className="text-[15px] font-semibold text-gray-800">{displayDate(invitation.event_date)}</p>
      {invitation.event_time && <p className="mt-1 text-[14px] text-gray-600">{invitation.event_time}</p>}
      {invitation.venue_address && <p className="mt-3 whitespace-pre-line text-[14px] leading-relaxed text-gray-700">{invitation.venue_address}</p>}
      {invitation.dress_code && (
        <p className="mt-3 text-[12px] text-gray-500"><span className="font-semibold">Dress code:</span> {invitation.dress_code}</p>
      )}
      {invitation.schedule && (
        <div className="mt-5 border-t border-current/10 pt-4 text-left">
          <p className={`mb-2 text-center text-[10px] font-bold uppercase tracking-[0.22em] ${style.accent}`}>Schedule</p>
          <p className="whitespace-pre-line text-[13px] leading-relaxed text-gray-600">{invitation.schedule}</p>
        </div>
      )}
      <div className={`mx-auto mt-7 h-px w-20 ${style.ornament}`} />
    </article>
  );
}

function escapeCalendarText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

export function downloadInvitationCalendar(invitation: InvitationCardData & { id: string }) {
  const start = new Date(`${invitation.event_date}T${invitation.event_time || '00:00'}`);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const toIcsDate = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const details = [
    `Honoring ${invitation.honorees}`,
    invitation.schedule ? `Schedule:\n${invitation.schedule}` : '',
  ].filter(Boolean).join('\n\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mazel Tov//Invitation//EN',
    'BEGIN:VEVENT',
    `UID:${invitation.id}@mazeltov`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(start)}`,
    `DTEND:${toIcsDate(end)}`,
    `SUMMARY:${escapeCalendarText(invitation.title)}`,
    `LOCATION:${escapeCalendarText(invitation.venue_address)}`,
    `DESCRIPTION:${escapeCalendarText(details)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  const file = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'mazel-tov-invitation.ics';
  link.click();
  URL.revokeObjectURL(url);
}
