interface Props {
  count: number;
  size?: 'sm' | 'md';
}

export function UnreadBadge({ count, size = 'md' }: Props) {
  if (count <= 0) return null;
  const dim = size === 'sm' ? 'w-5 h-5 text-[11px]' : 'w-6 h-6 text-[13px]';
  const display = count > 99 ? '99+' : String(count);
  return (
    <span
      className={`shrink-0 ${dim} rounded-full bg-[#FF3B30] text-white font-bold flex items-center justify-center leading-none`}
    >
      {display}
    </span>
  );
}
