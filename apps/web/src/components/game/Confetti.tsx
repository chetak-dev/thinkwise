'use client';

import { useState } from 'react';

const COLORS = ['#6d4aff', '#ff5d73', '#14c9b8', '#ffb627', '#8f6dff', '#0067a5'];

export function Confetti({ pieces = 60 }: { pieces?: number }) {
  const [bits] = useState(() =>
    Array.from({ length: pieces }, () => ({
      left: Math.random() * 100,
      delay: Math.random() * 1.2,
      duration: 2.4 + Math.random() * 2,
      size: 6 + Math.random() * 6,
      rotate: Math.random() * 360,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    })),
  );

  return (
    <div className="decorative pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
      {bits.map((b, i) => (
        <span
          key={i}
          className="absolute -top-4 rounded-sm"
          style={{
            left: `${b.left}%`,
            width: b.size,
            height: b.size * 0.45,
            background: b.color,
            transform: `rotate(${b.rotate}deg)`,
            animation: `tw-fall ${b.duration}s ${b.delay}s cubic-bezier(.3,.6,.4,1) forwards`,
          }}
        />
      ))}
    </div>
  );
}
