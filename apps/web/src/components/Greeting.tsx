'use client';

import { useEffect, useState } from 'react';

/** Time-of-day greeting in the viewer's own timezone (the server can't know it). */
export function Greeting() {
  const [text, setText] = useState('Welcome back,');
  useEffect(() => {
    const h = new Date().getHours();
    setText(h < 5 ? 'Working late,' : h < 12 ? 'Good morning,' : h < 17 ? 'Good afternoon,' : 'Good evening,');
  }, []);
  return <p className="text-sm font-semibold text-white/80">{text}</p>;
}
