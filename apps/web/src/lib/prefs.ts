'use client';

import { useCallback, useEffect, useState } from 'react';

export type Lang = 'en' | 'hi' | 'mr';
export type Theme = 'light' | 'dark' | 'system';

export interface Prefs {
  theme: Theme;
  textScale: number;
  reduceMotion: boolean;
  sound: boolean;
  music: boolean;
  volume: number;
  lowData: boolean;
  lang: Lang;
}

const KEY = 'tw-prefs';
const CHANGE_EVENT = 'tw-prefs-change';
export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  textScale: 1,
  reduceMotion: false,
  sound: false,
  music: true,
  volume: 1,
  lowData: false,
  lang: 'en',
};

function read(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
}

function applyToDocument(p: Prefs) {
  const root = document.documentElement;
  const dark = p.theme === 'dark' || (p.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', dark);
  root.classList.toggle('low-data', p.lowData);
  root.classList.toggle('reduce-motion', p.reduceMotion);
  root.style.fontSize = p.textScale === 1 ? '' : `${p.textScale * 100}%`;
  root.lang = p.lang;
}

export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  useEffect(() => {
    const sync = () => setPrefs(read());
    sync();
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    applyToDocument(prefs);
    if (prefs.theme !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyToDocument(prefs);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [prefs]);

  const update = useCallback((patch: Partial<Prefs>) => {
    const next = { ...read(), ...patch };
    localStorage.setItem(KEY, JSON.stringify(next));
    setPrefs(next);
    // Keeps every component using prefs on this page in sync.
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return [prefs, update] as const;
}
