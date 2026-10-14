import { useId } from 'react';

/** A "T" whose stem doubles as an exclamation mark: the moment an answer clicks. */
export function LogoMark({ className = 'size-8' }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 32 32" className={`shrink-0 ${className}`} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7b5cff" />
          <stop offset="0.55" stopColor="#e9468f" />
          <stop offset="1" stopColor="#ff8a3d" />
        </linearGradient>
        <radialGradient id={`${id}-shine`} cx="0.25" cy="0.15" r="0.75">
          <stop offset="0" stopColor="#fff" stopOpacity="0.32" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id}-bg)`} />
      <rect width="32" height="32" rx="9" fill={`url(#${id}-shine)`} />
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" fill="none" stroke="#fff" strokeOpacity="0.18" />
      <path d="M9.5 9.5h13M16 9.5v9.2" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" />
      <circle cx="16" cy="23.6" r="2.3" fill="#ffd84d" />
    </svg>
  );
}

export function Logo({ className = '', textClassName = '' }: { className?: string; textClassName?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-display text-xl tracking-tight ${className}`}>
      <LogoMark className="size-[1.6em]" />
      <span className={textClassName}>
        <span className="font-bold">Think</span>
        <span className="bg-[linear-gradient(90deg,#8f6dff,#ff6b81)] bg-clip-text font-bold text-transparent">Wise</span>
      </span>
    </span>
  );
}
