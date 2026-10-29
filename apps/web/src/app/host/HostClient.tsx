'use client';

import { useEffect, useReducer, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import {
  Eye,
  Flag,
  Info,
  ListOrdered,
  Maximize2,
  MessageSquareText,
  Pause,
  Play,
  RotateCcw,
  Search,
  SkipForward,
  Sparkles,
  TimerReset,
  UserX,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { isScored, type HostSettings, type ServerMessage } from '@thinkwise/shared';
import { Logo } from '@/components/Logo';
import { ConnectionBadge } from '@/components/ConnectionBadge';
import { Switch } from '@/components/Switch';
import { Stage } from '@/components/game/Stage';
import { TRACKS } from '@/components/game/tracks';
import { useStageSounds } from '@/components/game/useStageSounds';
import { INITIAL_STAGE, stageReducer } from '@/lib/stage';
import { useGameSocket, type Send } from '@/lib/useGameSocket';
import { usePrefs } from '@/lib/prefs';
import { setSoundEnabled, useAudioPlaying } from '@/lib/audio';
import { HOST_SESSION_KEY, hostAction, rememberHostSession, rememberedQuiz } from '@/lib/hostQuiz';

interface HostSession {
  gameId: string;
  hostToken: string;
}

const BTN =
  'inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] hover:-translate-y-0.5';
const BTN_PRIMARY = `${BTN} text-white bg-[linear-gradient(100deg,#6d4aff,#ff5d73)] hover:brightness-110 shadow-[0_10px_30px_-10px_rgb(255_93_115/0.7)] h-14 px-8 text-lg gap-2.5 rounded-2xl w-full`;
const BTN_OUTLINE = `${BTN} border border-app bg-surface text-app hover:border-nova-400 hover:text-nova-700 dark:hover:text-nova-300 h-11 px-4 text-sm gap-2 rounded-xl`;
const BTN_DANGER = `${BTN} border border-rose-200 bg-surface text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950 h-11 px-4 text-sm gap-2 rounded-xl w-full`;

export function HostClient() {
  const [prefs, setPrefs] = usePrefs();
  const [state, dispatch] = useReducer(stageReducer, INITIAL_STAGE);
  const [screenLink, setScreenLink] = useState('');
  const [joinUrl, setJoinUrl] = useState('');
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [playersOpen, setPlayersOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [celebrate, setCelebrate] = useState(0);
  const [relaunchError, setRelaunchError] = useState<string | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ before: number; after: number } | null>(null);

  const createGame = async (send: Send) => {
    setRelaunchError(null);
    const remembered = rememberedQuiz();
    sessionStorage.removeItem(HOST_SESSION_KEY);
    if (!remembered) {
      send({ t: 'host:create' });
      return;
    }
    const result = await hostAction(remembered.source)(remembered.id);
    if (!result.ok) {
      setRelaunchError(result.error);
      return;
    }
    if ('selfId' in result) return;
    rememberHostSession(result.gameId, result.hostToken, remembered.id, remembered.source);
    send({ t: 'host:resume', gameId: result.gameId, hostToken: result.hostToken });
  };

  const { status, send } = useGameSocket({
    onOpen(send) {
      const saved = sessionStorage.getItem(HOST_SESSION_KEY);
      if (saved) {
        const session = JSON.parse(saved) as HostSession;
        send({ t: 'host:resume', ...session });
      } else {
        void createGame(send);
      }
    },
    onMessage(msg: ServerMessage, send) {
      if (msg.t === 'host:ready') {
        sessionStorage.setItem(
          HOST_SESSION_KEY,
          JSON.stringify({ gameId: msg.gameId, hostToken: msg.hostToken } satisfies HostSession),
        );
        setScreenLink(`/host/screen?g=${encodeURIComponent(msg.gameId)}&k=${encodeURIComponent(msg.screenKey)}`);
        setGameId(msg.gameId);
        setConfirmEnd(false);
        setCelebrate(0);
      }
      if (msg.t === 'error') {
        if (msg.code === 'session_expired') void createGame(send);
        return;
      }
      if (msg.t === 'question' || msg.t === 'final') setConfirmEnd(false);
      dispatch(msg);
    },
  });

  const stage = celebrate ? { ...state, celebration: state.celebration + celebrate } : state;
  useStageSounds(stage, prefs.sound, { music: prefs.music, volume: prefs.volume });

  // Event games: keep the host's feedback count fresh. Plain games answer null once and polling stops.
  useEffect(() => {
    setFeedback(null);
    if (!gameId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const res = await fetch(`/api/host/feedback?game=${encodeURIComponent(gameId)}`, { cache: 'no-store' });
        const { count } = (await res.json()) as { count: { before: number; after: number } | null };
        if (stopped) return;
        setFeedback(count);
        if (!count) return;
      } catch {
        // Try again on the next tick.
      }
      if (!stopped) timer = setTimeout(poll, 5000);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [gameId]);

  useEffect(() => {
    if (!state.pin) return;
    const url = `${window.location.origin}/${state.pin}`;
    setJoinUrl(url);
    QRCode.toString(url, { type: 'svg', margin: 0, color: { dark: '#14112b', light: '#ffffff' } })
      .then((svg) => setQr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`))
      .catch(() => setQr(''));
  }, [state.pin]);

  const copyLink = async () => {
    await navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const audioPlaying = useAudioPlaying();
  const toggleSound = () => {
    const next = !(prefs.sound && audioPlaying);
    setSoundEnabled(next);
    setPrefs({ sound: next });
  };

  const updateSettings = (patch: Partial<HostSettings>) => send({ t: 'host:settings', settings: patch });

  const { phase, players, settings, question, timer, locked } = state;
  const isLast = question ? question.index + 1 >= question.total : false;
  const query = search.trim().toLocaleLowerCase();
  const visiblePlayers = query ? players.filter((p) => p.nickname.toLocaleLowerCase().includes(query)) : players;

  const endControls = confirmEnd ? (
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Confirm ending the game">
      <button type="button" onClick={() => send({ t: 'host:end' })} className={`${BTN_DANGER} bg-rose-600 text-white hover:bg-rose-700 dark:text-white`}>
        End for everyone
      </button>
      <button type="button" onClick={() => setConfirmEnd(false)} className={`${BTN_OUTLINE} w-full`}>
        Cancel
      </button>
    </div>
  ) : (
    <button type="button" onClick={() => setConfirmEnd(true)} className={BTN_DANGER}>
      <Flag className="size-4" aria-hidden="true" />
      End session
    </button>
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <ConnectionBadge status={status} />

      <header className="flex flex-wrap items-center gap-3 border-b border-app bg-surface px-4 py-3">
        <Link href="/" aria-label="ThinkWise home">
          <Logo />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display font-bold">{state.quizTitle || 'Live lobby'}</p>
        </div>
        {phase !== 'lobby' && phase !== 'connecting' && state.pin && (
          <span className="rounded-xl bg-surface-2 px-3 py-1.5 font-display font-bold tracking-wider tabular-nums">
            PIN {state.pin}
          </span>
        )}
        <button
          type="button"
          onClick={toggleSound}
          aria-pressed={audioPlaying}
          className="flex items-center gap-1.5 rounded-xl bg-surface-2 px-3 py-1.5 text-sm font-semibold transition hover:bg-nova-100 dark:hover:bg-ink-700"
        >
          {audioPlaying ? <Volume2 className="size-4" aria-hidden="true" /> : <VolumeX className="size-4" aria-hidden="true" />}
          {audioPlaying ? 'Music on' : 'Enable sound'}
        </button>
        <span
          className="flex items-center gap-1.5 rounded-xl bg-surface-2 px-3 py-1.5 text-sm font-bold tabular-nums"
          aria-label={`${players.length} players`}
        >
          <Users className="size-4" aria-hidden="true" />
          {players.length}
        </span>
        {feedback && (
          <span
            className="flex items-center gap-1.5 rounded-xl bg-coral-500/10 px-3 py-1.5 text-sm font-bold tabular-nums text-coral-600 dark:text-coral-400"
            title={feedback.after ? `${feedback.before} before the quiz · ${feedback.after} after` : 'Feedback forms received'}
          >
            <MessageSquareText className="size-4" aria-hidden="true" />
            {feedback.before + feedback.after}
            <span className="sr-only">feedback received</span>
          </span>
        )}
        {screenLink && (
          <a
            href={screenLink}
            target="_blank"
            rel="noopener"
            className="hidden items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold text-muted hover:bg-surface-2 sm:flex"
          >
            <Maximize2 className="size-4" aria-hidden="true" />
            Projector view
          </a>
        )}
      </header>

      {relaunchError && (
        <div role="alert" className="mx-4 mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300">
          {relaunchError}{' '}
          <Link href="/library" className="underline">
            Back to your library
          </Link>
        </div>
      )}

      <main id="main" className="flex flex-1 flex-col lg:flex-row">
        <section className="flex flex-1 flex-col p-4 sm:p-8">
          <Stage
            state={stage}
            joinUrl={joinUrl}
            qr={qr}
            copied={copied}
            onCopy={copyLink}
            onKick={(playerId) => send({ t: 'host:kick', playerId })}
            finishedActions={
              <div className="flex flex-wrap justify-center gap-3">
                {stage.rules.gamification && (
                  <button type="button" onClick={() => setCelebrate((n) => n + 1)} className={BTN_OUTLINE}>
                    <Sparkles className="size-4" aria-hidden="true" />
                    Celebrate again
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void createGame(send)}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-nova-600 px-6 font-semibold text-white hover:bg-nova-700"
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Open a new lobby
                </button>
              </div>
            }
          />
        </section>

        <aside
          aria-label="Host controls"
          className="space-y-4 border-t border-app bg-surface/90 p-4 backdrop-blur-xl lg:w-80 lg:shrink-0 lg:border-l lg:border-t-0"
        >
          {phase === 'lobby' && (
            <div className="space-y-2">
              <button
                type="button"
                disabled={players.length === 0 || status !== 'open'}
                onClick={() => send({ t: 'host:start' })}
                className={BTN_PRIMARY}
              >
                <Play className="size-5" aria-hidden="true" />
                {players.length === 0 ? 'Start (waiting for players)' : 'Start game'}
              </button>
            </div>
          )}

          {phase === 'question' && (
            <div className="space-y-2">
              <button type="button" onClick={() => send({ t: 'host:reveal' })} className={BTN_PRIMARY}>
                <Eye className="size-5" aria-hidden="true" />
                {question && !isScored(question.type) ? 'Show results now' : 'Reveal answer now'}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => send({ t: 'host:pause', paused: !timer?.paused })}
                  className={BTN_OUTLINE}
                >
                  {timer?.paused ? <Play className="size-4" aria-hidden="true" /> : <Pause className="size-4" aria-hidden="true" />}
                  {timer?.paused ? 'Resume' : 'Pause'}
                </button>
                <button type="button" onClick={() => send({ t: 'host:extend' })} aria-label="Add 10 seconds" className={BTN_OUTLINE}>
                  <TimerReset className="size-4" aria-hidden="true" />
                  +10 s
                </button>
              </div>
              {endControls}
            </div>
          )}

          {(phase === 'reveal' || phase === 'leaderboard') && (
            <div className="space-y-2">
              {phase === 'reveal' && stage.rules.showLeaderboard && (
                <button type="button" onClick={() => send({ t: 'host:leaderboard' })} className={`${BTN_OUTLINE} w-full`}>
                  <ListOrdered className="size-4" aria-hidden="true" />
                  Show leaderboard
                </button>
              )}
              <button type="button" onClick={() => send({ t: 'host:next' })} className={BTN_PRIMARY}>
                {isLast ? <Flag className="size-5" aria-hidden="true" /> : <SkipForward className="size-5" aria-hidden="true" />}
                {isLast ? 'Finish' : 'Next question'}
              </button>
              {endControls}
            </div>
          )}

          {phase === 'self' && <div className="space-y-2">{endControls}</div>}

          {phase !== 'finished' && phase !== 'connecting' && (
            <div className="space-y-3 rounded-2xl bg-surface-2 p-4">
              <Switch
                checked={locked}
                onChange={(next) => send({ t: 'host:lock', locked: next })}
                label="Lock lobby"
                description="Keep latecomers out once you’re ready"
              />
              {settings.mode === 'live' && stage.rules.showLeaderboard && (
                <Switch
                  checked={settings.leaderboardAfterEach}
                  onChange={(next) => updateSettings({ leaderboardAfterEach: next })}
                  label="Leaderboard after each question"
                  description="Rankings appear 4 s after the answer is revealed"
                />
              )}
              {settings.mode === 'live' && (
                <>
                  <Switch
                    checked={settings.liveCounts}
                    onChange={(next) => updateSettings({ liveCounts: next })}
                    label="Live answer count"
                    description="Show totals, bars and who just answered while the clock runs"
                  />
                  <Switch
                    checked={settings.autoAdvance}
                    onChange={(next) => updateSettings({ autoAdvance: next })}
                    label="Auto-advance"
                    description="Move on by itself after the reveal and leaderboard"
                  />
                </>
              )}
            </div>
          )}

          <div className="rounded-2xl border border-app p-4">
            <p className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <Volume2 className="size-4 text-nova-500" aria-hidden="true" />
              Soundtrack
            </p>
            <p className="mb-3 text-xs text-muted">
              Plays here, on the projector and on every phone with sound on. Switch any time.
            </p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Soundtrack">
              {TRACKS.map((track) => {
                const active = settings.soundtrack === track.id;
                return (
                  <button
                    key={track.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => updateSettings({ soundtrack: track.id })}
                    className={`rounded-xl border-2 p-2.5 text-left transition ${
                      active ? 'border-nova-500 bg-nova-50 dark:bg-nova-950/40' : 'border-app hover:border-nova-300'
                    }`}
                  >
                    <span className="block text-sm font-bold">
                      {track.emoji} {track.name}
                    </span>
                    <span className="block text-[11px] leading-tight text-muted">{track.mood}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {phase !== 'connecting' && (
            <div className="rounded-2xl border border-app">
              <button
                type="button"
                aria-expanded={playersOpen}
                onClick={() => setPlayersOpen((o) => !o)}
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold"
              >
                <span className="flex items-center gap-2">
                  <Users className="size-4" aria-hidden="true" />
                  Players ({players.length})
                </span>
                <span className="text-muted">{playersOpen ? 'Hide' : 'Manage'}</span>
              </button>
              {playersOpen && (
                <div className="space-y-2 border-t border-app p-3">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted"
                      aria-hidden="true"
                    />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      aria-label="Search players"
                      placeholder="Search players"
                      className="h-9 w-full rounded-lg border border-app bg-surface pl-8 pr-2 text-sm"
                    />
                  </div>
                  <ul className="max-h-80 space-y-1 overflow-y-auto">
                    {visiblePlayers.length === 0 && (
                      <li className="px-2 py-3 text-center text-sm text-muted">
                        {players.length === 0 ? 'No players yet' : 'No matches'}
                      </li>
                    )}
                    {visiblePlayers.map((p) => (
                      <li key={p.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                        <span
                          className={`size-2 rounded-full ${p.connected ? 'bg-emerald-500' : 'bg-gray-400'}`}
                          role="img"
                          aria-label={p.connected ? 'Online' : 'Offline'}
                        />
                        <span aria-hidden="true">{p.avatar}</span>
                        <span className="min-w-0 flex-1 truncate font-medium">{p.nickname}</span>
                        {phase === 'question' && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                              p.answered
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                            }`}
                          >
                            {p.answered ? 'Answered' : 'Thinking'}
                          </span>
                        )}
                        <span className="text-xs tabular-nums text-muted">{p.score}</span>
                        <button
                          type="button"
                          onClick={() => send({ t: 'host:kick', playerId: p.id })}
                          aria-label={`Remove ${p.nickname}`}
                          className="rounded p-1 text-muted hover:bg-rose-100 hover:text-coral-600 dark:hover:bg-rose-950/40"
                        >
                          <UserX className="size-4" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {phase === 'lobby' && (
            <button
              type="button"
              onClick={() => createGame(send)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-app px-3 py-2 text-sm font-semibold hover:bg-surface-2"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Discard and open a new lobby
            </button>
          )}

          {screenLink && (
            <a
              href={screenLink}
              target="_blank"
              rel="noopener"
              className="flex items-center justify-center gap-2 rounded-xl border border-app px-3 py-2 text-sm font-semibold hover:bg-surface-2 sm:hidden"
            >
              <Maximize2 className="size-4" aria-hidden="true" />
              Projector view
            </a>
          )}

          <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3 text-xs text-muted">
            <Info className="size-4 shrink-0" aria-hidden="true" />
            <span>Timing and scores are worked out on the server. A dropped phone rejoins with its score.</span>
          </div>
        </aside>
      </main>
    </div>
  );
}
