'use client';

import { useEffect, useSyncExternalStore } from 'react';
import type { TrackId } from '@thinkwise/shared';

export type Sfx = 'join' | 'start' | 'tick' | 'lock' | 'correct' | 'wrong' | 'reveal' | 'leaderboard' | 'fanfare';

interface TrackDef {
  bpm: number;
  /** MIDI note of the key centre. */
  root: number;
  scale: number[];
  /** Scale degree of the chord root for each bar. */
  chords: number[];
  /** 16 steps per bar: x = root, o = fifth, '.' = rest. */
  bass: string;
  /** 16 steps per bar: digit = chord tone index, '.' = rest. */
  lead: string;
  kick: string;
  snare: string;
  hat: string;
  leadWave: OscillatorType;
  bassWave: OscillatorType;
  leadOctave: number;
  pad: boolean;
  swing: number;
  drumKit: 'pop' | 'chip' | 'dhol' | 'soft';
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const MIXOLYDIAN = [0, 2, 4, 5, 7, 9, 10];

const TRACK_DEFS: Record<TrackId, TrackDef> = {
  'ocean-drive': {
    bpm: 104, root: 62, scale: MAJOR, chords: [0, 4, 5, 3],
    bass: 'x..x..o.x..x..o.', lead: '0.2.1.3.2...1.0.',
    kick: 'x.......x.......', snare: '....x.......x...', hat: '..x...x...x...x.',
    leadWave: 'triangle', bassWave: 'sine', leadOctave: 1, pad: true, swing: 0, drumKit: 'pop',
  },
  'bubble-pop': {
    bpm: 118, root: 65, scale: MAJOR, chords: [0, 5, 3, 4],
    bass: 'x.x.o.x.x.x.o.x.', lead: '0.1.2.3.2.1.0...',
    kick: 'x...x...x...x...', snare: '....x.......x..x', hat: 'xxxxxxxxxxxxxxxx',
    leadWave: 'square', bassWave: 'triangle', leadOctave: 1, pad: false, swing: 0, drumKit: 'pop',
  },
  'night-library': {
    bpm: 76, root: 57, scale: MINOR, chords: [0, 5, 2, 6],
    bass: 'x.......o.......', lead: '0...2...1...3...',
    kick: 'x...............', snare: '................', hat: '....x.......x...',
    leadWave: 'sine', bassWave: 'sine', leadOctave: 1, pad: true, swing: 0, drumKit: 'soft',
  },
  'power-up': {
    bpm: 136, root: 60, scale: MAJOR, chords: [0, 0, 3, 4],
    bass: 'x.x.x.x.o.o.o.o.', lead: '0120312031203120',
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.',
    leadWave: 'square', bassWave: 'square', leadOctave: 1, pad: false, swing: 0, drumKit: 'chip',
  },
  summit: {
    bpm: 96, root: 60, scale: MAJOR, chords: [5, 3, 0, 4],
    bass: 'x...x...x...o...', lead: '2.....1.0...3...',
    kick: 'x.....x.x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.',
    leadWave: 'sawtooth', bassWave: 'triangle', leadOctave: 1, pad: true, swing: 0, drumKit: 'pop',
  },
  campfire: {
    bpm: 88, root: 67, scale: MAJOR, chords: [0, 4, 5, 3],
    bass: 'x.....o.x.....o.', lead: '0.1.2.1.0.1.2.3.',
    kick: 'x.......x.......', snare: '................', hat: '..x...x...x...x.',
    leadWave: 'triangle', bassWave: 'sine', leadOctave: 0, pad: false, swing: 0.12, drumKit: 'soft',
  },
  'jazz-cafe': {
    bpm: 112, root: 65, scale: DORIAN, chords: [1, 4, 0, 5],
    bass: 'x...o...x...o...', lead: '3..2..1...0..2..',
    kick: 'x.........x.....', snare: '....x.......x...', hat: 'x..xx..xx..xx..x',
    leadWave: 'sine', bassWave: 'triangle', leadOctave: 1, pad: true, swing: 0.2, drumKit: 'soft',
  },
  'dhol-dance': {
    bpm: 124, root: 62, scale: MIXOLYDIAN, chords: [0, 6, 3, 0],
    bass: 'x..x..x.x..x..o.', lead: '0.2.1.2.0.3.2.1.',
    kick: 'x..x..x.x..x..x.', snare: '....x..x....x..x', hat: '.x.x.x.x.x.x.x.x',
    leadWave: 'triangle', bassWave: 'sine', leadOctave: 1, pad: false, swing: 0.08, drumKit: 'dhol',
  },
  orbit: {
    bpm: 70, root: 64, scale: MAJOR, chords: [0, 3, 5, 4],
    bass: 'x...............', lead: '0.......2.......',
    kick: '................', snare: '................', hat: '........x.......',
    leadWave: 'sine', bassWave: 'sine', leadOctave: 2, pad: true, swing: 0, drumKit: 'soft',
  },
  'final-lap': {
    bpm: 150, root: 57, scale: MINOR, chords: [0, 5, 6, 4],
    bass: 'xxoxxxoxxxoxxxox', lead: '0.1.2.3.2.1.0.3.',
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx',
    leadWave: 'sawtooth', bassWave: 'square', leadOctave: 1, pad: false, swing: 0, drumKit: 'pop',
  },
};

const LOOKAHEAD_S = 0.12;
const SCHEDULE_MS = 25;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let sfxBus: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

let enabled = false;
let wantMusic = false;
let volume = 1;
let track: TrackDef = TRACK_DEFS['ocean-drive'];
let step = 0;
let nextTime = 0;
let timerId: number | null = null;

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

const playingListeners = new Set<() => void>();
const notifyPlaying = () => playingListeners.forEach((l) => l());

function ensureContext() {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  ctx = new AC();
  ctx.addEventListener('statechange', notifyPlaying);
  master = ctx.createGain();
  master.gain.value = 0.9 * volume;
  master.connect(ctx.destination);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.2;
  musicBus.connect(master);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.55;
  sfxBus.connect(master);
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return ctx;
}

interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  slideTo?: number;
  bus?: GainNode | null;
}

function tone(freq: number, start: number, dur: number, opts: ToneOpts = {}) {
  if (!ctx) return;
  const { type = 'sine', gain = 0.3, attack = 0.005, slideTo, bus = sfxBus } = opts;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(env).connect(bus!);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

function noise(start: number, dur: number, gain: number, highpass: number, bus: GainNode | null) {
  if (!ctx || !noiseBuffer) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = highpass;
  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, start);
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(filter).connect(env).connect(bus!);
  src.start(start);
  src.stop(start + dur + 0.02);
}

function noteOf(def: TrackDef, degree: number) {
  const len = def.scale.length;
  const octave = Math.floor(degree / len);
  return def.root + def.scale[((degree % len) + len) % len]! + 12 * octave;
}

function playStep(s: number, time: number, stepDur: number) {
  const def = track;
  const pos = s % 16;
  const chordRoot = def.chords[Math.floor(s / 16) % def.chords.length]!;
  const chordTone = (k: number) => noteOf(def, chordRoot + 2 * k);

  const b = def.bass[pos];
  if (b === 'x' || b === 'o') {
    const midi = (b === 'x' ? chordTone(0) : chordTone(2)) - 24;
    tone(mtof(midi), time, stepDur * 1.8, { type: def.bassWave, gain: 0.35, bus: musicBus });
  }

  const l = def.lead[pos];
  if (l && l !== '.') {
    const midi = chordTone(Number(l)) + 12 * def.leadOctave;
    tone(mtof(midi), time, stepDur * 1.6, { type: def.leadWave, gain: def.leadWave === 'sine' ? 0.22 : 0.09, bus: musicBus });
  }

  if (def.pad && pos === 0) {
    for (let k = 0; k < 3; k++) {
      tone(mtof(chordTone(k)), time, stepDur * 15, { type: 'sine', gain: 0.06, attack: 0.4, bus: musicBus });
    }
  }

  if (def.kick[pos] === 'x') {
    if (def.drumKit === 'dhol') tone(110, time, 0.22, { gain: 0.6, slideTo: 60, bus: musicBus });
    else if (def.drumKit === 'chip') tone(180, time, 0.1, { type: 'square', gain: 0.18, slideTo: 50, bus: musicBus });
    else tone(150, time, 0.18, { gain: def.drumKit === 'soft' ? 0.35 : 0.55, slideTo: 45, bus: musicBus });
  }
  if (def.snare[pos] === 'x') {
    if (def.drumKit === 'dhol') tone(320, time, 0.12, { type: 'triangle', gain: 0.3, slideTo: 220, bus: musicBus });
    else noise(time, def.drumKit === 'soft' ? 0.18 : 0.12, def.drumKit === 'soft' ? 0.12 : 0.25, 1500, musicBus);
  }
  if (def.hat[pos] === 'x') noise(time, 0.03, def.drumKit === 'soft' ? 0.05 : 0.08, 7000, musicBus);
}

function schedule() {
  if (!ctx) return;
  const sixteenth = 60 / track.bpm / 4;
  while (nextTime < ctx.currentTime + LOOKAHEAD_S) {
    const swingOffset = step % 2 === 1 ? sixteenth * track.swing : 0;
    playStep(step, nextTime + swingOffset, sixteenth);
    nextTime += sixteenth;
    step++;
  }
}

function startMusic() {
  if (timerId !== null || !ctx || !enabled || !wantMusic) return;
  step = 0;
  nextTime = ctx.currentTime + 0.08;
  timerId = window.setInterval(schedule, SCHEDULE_MS);
}

function stopMusic() {
  if (timerId !== null) window.clearInterval(timerId);
  timerId = null;
}

/** Must first be called from a user gesture (tap/click) so browsers allow audio. */
export function setSoundEnabled(on: boolean) {
  enabled = on;
  if (on) {
    void ensureContext().resume();
    startMusic();
  } else {
    stopMusic();
    void ctx?.suspend();
  }
  notifyPlaying();
}

function isAudioPlaying() {
  return enabled && ctx?.state === 'running';
}

/** True only while sound is on and the browser actually lets it play (autoplay rules can hold it back until a tap). */
export function useAudioPlaying() {
  return useSyncExternalStore(
    (listener) => {
      playingListeners.add(listener);
      return () => playingListeners.delete(listener);
    },
    isAudioPlaying,
    () => false,
  );
}

export function resumeAudio() {
  if (enabled && ctx && ctx.state !== 'running') void ctx.resume();
}

export function setTrack(id: TrackId) {
  const next = TRACK_DEFS[id];
  if (!next || next === track) return;
  track = next;
  if (timerId !== null) {
    stopMusic();
    startMusic();
  }
}

export function setVolume(v: number) {
  volume = Math.min(1, Math.max(0, v));
  if (master) master.gain.value = 0.9 * volume;
}

export function setMusicPlaying(play: boolean) {
  wantMusic = play;
  if (play) startMusic();
  else stopMusic();
}

export function playSfx(name: Sfx) {
  if (!enabled || !ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime + 0.01;
  switch (name) {
    case 'join':
      tone(880, t, 0.08, { type: 'triangle', gain: 0.25 });
      tone(1320, t + 0.07, 0.12, { type: 'triangle', gain: 0.25 });
      break;
    case 'start':
      tone(330, t, 0.3, { gain: 0.25, slideTo: 990 });
      tone(1047, t + 0.28, 0.4, { type: 'triangle', gain: 0.25 });
      break;
    case 'tick':
      tone(1500, t, 0.05, { type: 'square', gain: 0.08 });
      break;
    case 'lock':
      tone(660, t, 0.07, { type: 'triangle', gain: 0.3 });
      tone(990, t + 0.06, 0.12, { type: 'triangle', gain: 0.3 });
      break;
    case 'correct':
      [72, 76, 79, 84].forEach((m, i) => tone(mtof(m), t + i * 0.08, 0.25, { type: 'triangle', gain: 0.28 }));
      break;
    case 'wrong':
      tone(392, t, 0.4, { type: 'triangle', gain: 0.25, slideTo: 247 });
      break;
    case 'reveal':
      tone(784, t, 0.7, { gain: 0.22 });
      tone(1175, t + 0.04, 0.7, { gain: 0.16 });
      break;
    case 'leaderboard':
      [67, 71, 74, 79].forEach((m, i) => tone(mtof(m), t + i * 0.1, 0.3, { type: 'sine', gain: 0.22 }));
      break;
    case 'fanfare': {
      const chords = [
        [60, 64, 67],
        [65, 69, 72],
        [67, 71, 74],
        [72, 76, 79, 84],
      ];
      chords.forEach((chord, i) =>
        chord.forEach((m) =>
          tone(mtof(m), t + i * 0.22, i === 3 ? 1.4 : 0.25, { type: 'triangle', gain: i === 3 ? 0.16 : 0.13 }),
        ),
      );
      break;
    }
  }
}

/** Keeps the shared audio engine in sync with a page's sound preference and current track. */
export function useSound(enabledPref: boolean, trackId: TrackId | null, musicOn: boolean, vol = 1) {
  useEffect(() => {
    setVolume(vol);
  }, [vol]);

  useEffect(() => {
    setSoundEnabled(enabledPref);
    if (!enabledPref) return;
    // A preference saved earlier can't start audio on load; the next tap anywhere resumes it.
    window.addEventListener('pointerdown', resumeAudio);
    window.addEventListener('keydown', resumeAudio);
    return () => {
      window.removeEventListener('pointerdown', resumeAudio);
      window.removeEventListener('keydown', resumeAudio);
    };
  }, [enabledPref]);

  useEffect(() => {
    if (trackId) setTrack(trackId);
  }, [trackId]);

  useEffect(() => {
    setMusicPlaying(musicOn);
    return () => setMusicPlaying(false);
  }, [musicOn]);
}
