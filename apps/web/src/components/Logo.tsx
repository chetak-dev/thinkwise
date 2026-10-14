export function LogoMark({ className = 'size-8 rounded-[9px]' }: { className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center bg-[linear-gradient(135deg,#6d4aff,#14c9b8)] ${className}`}>
      <svg viewBox="0 0 32 32" className="size-full" aria-hidden="true">
        <path d="M10 11h12M16 11v11" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
        <circle cx="22.5" cy="21.5" r="2.2" fill="#fff" opacity="0.9" />
      </svg>
    </span>
  );
}

export function Logo({ className = '', textClassName = '' }: { className?: string; textClassName?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display text-xl font-bold tracking-tight ${className}`}>
      <LogoMark />
      <span className={textClassName}>ThinkWise</span>
    </span>
  );
}
