import { LogoMark } from '@/components/Logo';

/** Branded placeholder shown while a page renders on the server. */
export function PageLoader({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex animate-loader-in flex-col items-center justify-center gap-5 ${fullScreen ? 'min-h-dvh' : 'min-h-[60vh]'}`}
    >
      <div className="relative size-20">
        <span
          aria-hidden="true"
          className="absolute inset-0 animate-spin rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,#6d4aff_140deg,#ff5d73_250deg,#14c9b8_340deg,transparent_360deg)] [animation-duration:1.1s] [mask:radial-gradient(farthest-side,transparent_calc(100%-4px),#000_calc(100%-3.5px))]"
        />
        <span aria-hidden="true" className="absolute inset-0 rounded-full ring-4 ring-inset ring-nova-500/10" />
        <span className="absolute inset-[18px] grid animate-breathe place-items-center">
          <LogoMark className="size-11 drop-shadow-[0_8px_18px_rgba(91,52,240,.45)]" />
        </span>
      </div>
      <p className="flex items-center gap-1.5 font-display text-sm font-semibold tracking-wide text-muted">
        Loading
        <span aria-hidden="true" className="flex gap-1">
          <span className="size-1 animate-bounce rounded-full bg-nova-500 [animation-delay:-0.3s]" />
          <span className="size-1 animate-bounce rounded-full bg-coral-500 [animation-delay:-0.15s]" />
          <span className="size-1 animate-bounce rounded-full bg-teal-500" />
        </span>
      </p>
    </div>
  );
}
