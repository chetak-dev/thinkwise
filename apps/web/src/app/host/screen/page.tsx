'use client';

import { Suspense, useEffect, useReducer, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';
import { Sparkles, Users, Volume2, VolumeX } from 'lucide-react';
import type { ServerMessage } from '@thinkwise/shared';
import { Logo } from '@/components/Logo';
import { ConnectionBadge } from '@/components/ConnectionBadge';
import { Stage, formatPin } from '@/components/game/Stage';
import { useStageSounds } from '@/components/game/useStageSounds';
import { INITIAL_STAGE, stageReducer } from '@/lib/stage';
import { useGameSocket } from '@/lib/useGameSocket';
import { setSoundEnabled, useAudioPlaying } from '@/lib/audio';
import { usePrefs } from '@/lib/prefs';

function Projector() {
  const params = useSearchParams();
  const gameId = params.get('g') ?? '';
  const screenKey = params.get('k') ?? '';
  const [state, dispatch] = useReducer(stageReducer, INITIAL_STAGE);
  const [expired, setExpired] = useState(false);
  const [prefs, setPrefs] = usePrefs();
  const [joinUrl, setJoinUrl] = useState('');
  const [qr, setQr] = useState('');
  const [celebrate, setCelebrate] = useState(0);

  const { status } = useGameSocket({
    onOpen(send) {
      if (gameId && screenKey) send({ t: 'screen:join', gameId, screenKey });
      else setExpired(true);
    },
    onMessage(msg: ServerMessage) {
      if (msg.t === 'error' && msg.code === 'session_expired') setExpired(true);
      else dispatch(msg);
    },
  });

  const stage = celebrate ? { ...state, celebration: state.celebration + celebrate } : state;
  useStageSounds(stage, prefs.sound, { music: prefs.music, volume: prefs.volume });

  useEffect(() => {
    if (!state.pin) return;
    const url = `${window.location.origin}/play?pin=${state.pin}`;
    setJoinUrl(url);
    QRCode.toString(url, { type: 'svg', margin: 0, color: { dark: '#14112b', light: '#ffffff' } })
      .then((svg) => setQr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`))
      .catch(() => setQr(''));
  }, [state.pin]);

  const audioPlaying = useAudioPlaying();
  const toggleSound = () => {
    const next = !(prefs.sound && audioPlaying);
    setSoundEnabled(next);
    setPrefs({ sound: next });
  };

  return (
    <div className="dark">
      <div
        className="relative flex min-h-dvh flex-col overflow-hidden text-lg text-white"
        style={{
          background:
            'radial-gradient(circle at 20% 0%, rgba(109,74,255,.35), transparent 32%), radial-gradient(circle at 90% 80%, rgba(20,201,184,.18), transparent 30%), #0c0a1d',
        }}
      >
        <ConnectionBadge status={status} />
        <header className="m-3 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-xl">
          <Logo className="text-2xl" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display font-bold">{state.quizTitle}</p>
          </div>
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={audioPlaying}
            className="flex items-center gap-1.5 rounded-xl bg-surface-2 px-3 py-1.5 text-sm font-semibold transition hover:bg-ink-700"
          >
            {audioPlaying ? <Volume2 className="size-4" aria-hidden="true" /> : <VolumeX className="size-4" aria-hidden="true" />}
            {audioPlaying ? 'Music on' : 'Enable sound'}
          </button>
          {state.phase !== 'lobby' && state.phase !== 'connecting' && state.pin && (
            <span className="rounded-xl bg-surface-2 px-3 py-1.5 font-display font-bold tracking-wider">
              PIN {formatPin(state.pin)}
            </span>
          )}
          <span
            className="flex items-center gap-1.5 rounded-xl bg-surface-2 px-3 py-1.5 text-sm font-bold tabular-nums"
            aria-label={`${state.players.length} players`}
          >
            <Users className="size-4" aria-hidden="true" />
            {state.players.length}
          </span>
        </header>

        <main id="main" className="flex flex-1 flex-col">
          <section className="flex flex-1 flex-col p-4 sm:p-8">
            {expired ? (
              <div className="mx-auto max-w-lg py-24 text-center">
                <h1 className="font-display text-3xl font-bold">This projector link has expired</h1>
                <p className="mt-3 text-muted">Open the projector view again from the host screen.</p>
              </div>
            ) : (
              <Stage
                state={stage}
                big
                joinUrl={joinUrl}
                qr={qr}
                finishedActions={
                  stage.rules.gamification && (
                    <button
                      type="button"
                      onClick={() => setCelebrate((n) => n + 1)}
                      className="inline-flex h-11 items-center gap-2 rounded-xl border border-app bg-surface px-5 text-sm font-semibold text-app hover:border-nova-400"
                    >
                      <Sparkles className="size-4" aria-hidden="true" />
                      Celebrate again
                    </button>
                  )
                }
              />
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

export default function ProjectorPage() {
  return (
    <Suspense>
      <Projector />
    </Suspense>
  );
}
