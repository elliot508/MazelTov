export type SimchaType = 'wedding' | 'vort' | 'bar_mitzvah' | 'birth';

export interface Category {
  id: SimchaType;
  label: string;
  emoji: string;
}

export const CATEGORIES: Category[] = [
  { id: 'wedding', label: 'Weddings', emoji: '💍' },
  { id: 'vort', label: 'Vorts', emoji: '🥂' },
  { id: 'bar_mitzvah', label: 'Bar Mitzvahs', emoji: '📜' },
  { id: 'birth', label: 'Births', emoji: '👶' },
];

export const NEIGHBORHOODS: string[] = [
  'Lakewood',
  'Boro Park',
  'Flatbush',
  'Monsey',
  'Williamsburg',
  'Five Towns',
  'Crown Heights',
  'Passaic',
];

export const SIMCHA_TYPE_LABELS: Record<SimchaType, string> = {
  wedding: 'Wedding',
  vort: 'Vort',
  bar_mitzvah: 'Bar Mitzvah',
  birth: 'Birth',
};

export const SINGLE_FAMILY_TYPES: SimchaType[] = ['bar_mitzvah', 'birth'];

export interface RankInfo {
  name: string;
  min: number;
  max: number;
}

export const RANKS: RankInfo[] = [
  { name: 'Guest', min: 0, max: 49 },
  { name: 'Amateur', min: 50, max: 99 },
  { name: 'Balabos', min: 100, max: 499 },
  { name: 'Maven', min: 500, max: 999 },
  { name: 'Hocker', min: 1000, max: 2499 },
  { name: 'Ultimate Hocker', min: 2500, max: Infinity },
];

export const REFERRER_BONUS = 50;
export const REFERRED_BONUS = 25;

export interface AdPricingTier {
  days: number;
  label: string;
  price: number;
  perDay: number;
}

export const AD_PRICING: AdPricingTier[] = [
  { days: 1, label: '1 Day', price: 25, perDay: 25 },
  { days: 2, label: '2 Days', price: 45, perDay: 22.5 },
  { days: 3, label: '3 Days', price: 60, perDay: 20 },
  { days: 7, label: '1 Week', price: 140, perDay: 20 },
];

export function calcAdPrice(days: number): number {
  if (days === 1) return 25;
  if (days === 2) return 45;
  return 20 * days;
}

export function getRank(points: number, isGadolHaHock = false): RankInfo {
  if (isGadolHaHock) return { name: 'Gadol HaHock', min: 0, max: Infinity };
  return RANKS.find((r) => points >= r.min && points <= r.max) ?? RANKS[0];
}

export function rankProgress(points: number, isGadol = false): { current: number; needed: number; pct: number } {
  const rank = getRank(points, isGadol);
  if (rank.max === Infinity) {
    const prev = RANKS[RANKS.length - 1];
    return { current: points - prev.max + 1, needed: Infinity, pct: 100 };
  }
  const span = rank.max - rank.min + 1;
  const into = points - rank.min;
  return { current: into + 1, needed: span, pct: Math.min(100, ((into + 1) / span) * 100) };
}

export function pointsToNextRank(points: number, isGadol = false): number | null {
  if (isGadol) return null;
  const rank = getRank(points);
  if (rank.max === Infinity) return null;
  return rank.max - points + 1;
}

export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}
