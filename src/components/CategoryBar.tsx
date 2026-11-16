import { CATEGORIES, type SimchaType } from '@/lib/constants';

interface Props {
  active: SimchaType | null;
  onSelect: (cat: SimchaType) => void;
  onHome: () => void;
}

export function CategoryBar({ active, onSelect, onHome }: Props) {
  return (
    <div className="fixed top-0 left-0 right-0 z-40">
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 shadow-lg shadow-black/10">
        <div className="max-w-2xl mx-auto px-3">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar h-14 py-2">
            <button
              onClick={onHome}
              className={`shrink-0 px-4 h-9 rounded-full text-[13px] font-bold tracking-tight transition-all duration-200 ${
                active === null
                  ? 'bg-gradient-to-br from-[#007AFF] to-[#0051D5] text-white shadow-md shadow-blue-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              Home
            </button>
            <div className="w-px h-5 bg-white/15 shrink-0" />
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => onSelect(cat.id)}
                className={`shrink-0 px-3.5 h-9 rounded-full text-[13px] font-bold whitespace-nowrap transition-all duration-200 ${
                  active === cat.id
                    ? 'bg-gradient-to-br from-[#007AFF] to-[#0051D5] text-white shadow-md shadow-blue-500/30 scale-[1.02]'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                <span className="mr-1">{cat.emoji}</span>
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
