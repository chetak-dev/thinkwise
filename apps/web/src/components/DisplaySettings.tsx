'use client';

import { useEffect, useRef } from 'react';
import { Monitor, Moon, Sun, X } from 'lucide-react';
import { Switch } from '@/components/Switch';
import { usePrefs, type Theme } from '@/lib/prefs';
import { setSoundEnabled } from '@/lib/audio';

const THEMES: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

export function DisplaySettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [prefs, setPrefs] = usePrefs();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="display-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-3xl border border-app bg-surface p-0 text-app shadow-lift backdrop:bg-ink-950/50 backdrop:backdrop-blur-sm open:animate-pop"
    >
      <div className="p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="display-title" className="font-display text-xl font-bold">
              Display & accessibility
            </h2>
            <p className="text-sm text-muted">These settings stay on this device.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-surface-2">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-semibold">Theme</p>
            <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2">
              {THEMES.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={prefs.theme === value}
                  onClick={() => setPrefs({ theme: value })}
                  className={`flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-semibold transition ${
                    prefs.theme === value ? 'border-nova-500 bg-nova-50 dark:bg-nova-950/40' : 'border-app hover:border-nova-300'
                  }`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="text-size" className="mb-2 block text-sm font-semibold">
              Text size: {Math.round(prefs.textScale * 100)}%
            </label>
            <input
              id="text-size"
              type="range"
              min={0.9}
              max={1.4}
              step={0.1}
              value={prefs.textScale}
              onChange={(e) => setPrefs({ textScale: Number(e.target.value) })}
              className="w-full accent-nova-600"
            />
          </div>

          <Switch
            checked={prefs.reduceMotion}
            onChange={(v) => setPrefs({ reduceMotion: v })}
            label="Reduce motion"
            description="Turn off animations and moving effects"
          />
          <Switch
            checked={prefs.lowData}
            onChange={(v) => setPrefs({ lowData: v })}
            label="Low-bandwidth mode"
            description="Skip decorative backgrounds and effects"
          />
          <Switch
            checked={prefs.sound}
            onChange={(v) => {
              setSoundEnabled(v);
              setPrefs({ sound: v });
            }}
            label="Sound effects"
            description="Game sounds during live games"
          />
          <Switch
            checked={prefs.music}
            onChange={(v) => setPrefs({ music: v })}
            label="Background music"
            description="Play the host’s soundtrack while sound is on"
          />
          <div>
            <label htmlFor="volume" className="mb-2 block text-sm font-semibold">
              Volume: {Math.round(prefs.volume * 100)}%
            </label>
            <input
              id="volume"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={prefs.volume}
              onChange={(e) => setPrefs({ volume: Number(e.target.value) })}
              className="w-full accent-nova-600"
            />
          </div>
        </div>
      </div>
    </dialog>
  );
}
