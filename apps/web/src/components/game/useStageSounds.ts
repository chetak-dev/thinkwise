'use client';

import { useEffect, useRef } from 'react';
import { playSfx, useSound } from '@/lib/audio';
import { useCountdownTicks } from '@/components/game/TimerRing';
import type { StageState } from '@/lib/stage';

/** Music and effects for screens that show the shared stage (host and projector). */
export function useStageSounds(state: StageState, soundOn: boolean, opts: { music?: boolean; volume?: number } = {}) {
  const musicOn = soundOn && (opts.music ?? true) && state.phase !== 'connecting' && state.phase !== 'finished';
  useSound(soundOn, state.settings.soundtrack, musicOn, opts.volume ?? 1);

  const prevPhase = useRef(state.phase);
  const prevIndex = useRef<number | null>(null);
  const prevPlayers = useRef(state.players.length);

  useEffect(() => {
    const phase = state.phase;
    const index = state.question?.index ?? null;
    if (phase === 'question' && (prevPhase.current !== 'question' || prevIndex.current !== index)) playSfx('start');
    if (phase === 'reveal' && prevPhase.current !== 'reveal') playSfx('reveal');
    if (phase === 'leaderboard' && prevPhase.current !== 'leaderboard') playSfx('leaderboard');
    if (phase === 'finished' && prevPhase.current !== 'finished') playSfx('fanfare');
    prevPhase.current = phase;
    prevIndex.current = index;
  }, [state.phase, state.question?.index]);

  useEffect(() => {
    if (state.phase === 'lobby' && state.players.length > prevPlayers.current) playSfx('join');
    prevPlayers.current = state.players.length;
  }, [state.phase, state.players.length]);

  useEffect(() => {
    if (state.phase === 'finished' && state.celebration > 1) playSfx('fanfare');
  }, [state.phase, state.celebration]);

  useCountdownTicks(state.timer, state.phase === 'question', () => playSfx('tick'));
}
