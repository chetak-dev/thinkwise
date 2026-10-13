export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display text-xl font-bold tracking-tight ${className}`}>
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-[linear-gradient(135deg,#6d4aff,#14c9b8)]">
        <svg viewBox="0 0 32 32" className="size-8" aria-hidden="true">
          <path d="M10 11h12M16 11v11" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
          <circle cx="22.5" cy="21.5" r="2.2" fill="#fff" opacity="0.9" />
        </svg>
      </span>
      <span>ThinkWise</span>
    </span>
  );
}
