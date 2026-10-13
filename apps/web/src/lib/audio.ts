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
  /** Answering melody for bars 5–8 of each 8-bar phrase. */
  lead2: string;
  /** Plucked chord tones under the melody ('' = none). */
  arp: string;
  kick: string;
  snare: string;
  /** x = closed hat, o = open hat. */
  hat: string;
  leadWave: OscillatorType;
  bassWave: OscillatorType;
  arpWave: OscillatorType;
  leadOctave: number;
  arpOctave: number;
  pad: boolean;
  swing: number;
  drumKit: 'pop' | 'chip' | 'dhol' | 'soft';
  /** Send levels, 0–1. */
  echo: number;
  reverb: number;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const MIXOLYDIAN = [0, 2, 4, 5, 7, 9, 10];

const TRACK_DEFS: Record<TrackId, TrackDef> = {
  'ocean-drive': {
    bpm: 104, root: 62, scale: MAJOR, chords: [0, 4, 5, 3],
    bass: 'x..x..o.x..x..o.', lead: '0.2.1.3.2...1.0.', lead2: '2.3.4...3.2.1...',
    arp: '..2...2...2...2.', kick: 'x.......x.......', snare: '....x.......x...', hat: '..x...o...x...o.',
    leadWave: 'triangle', bassWave: 'sine', arpWave: 'triangle', leadOctave: 1, arpOctave: 1,
    pad: true, swing: 0, drumKit: 'pop', echo: 0.3, reverb: 0.3,
  },
  'bubble-pop': {
    bpm: 118, root: 65, scale: MAJOR, chords: [0, 5, 3, 4],
    bass: 'x.x.o.x.x.x.o.x.', lead: '0.1.2.3.2.1.0...', lead2: '3.2.1.0.1.2.3...',
    arp: '..1...1...1...1.', kick: 'x...x...x...x...', snare: '....x.......x..x', hat: 'xxxxxxoxxxxxxxox',
    leadWave: 'square', bassWave: 'triangle', arpWave: 'triangle', leadOctave: 1, arpOctave: 1,
    pad: false, swing: 0, drumKit: 'pop', echo: 0.2, reverb: 0.15,
  },
  'night-library': {
    bpm: 76, root: 57, scale: MINOR, chords: [0, 5, 2, 6],
    bass: 'x.......o.......', lead: '0...2...1...3...', lead2: '3...2...0...1...',
    arp: '0..1..2..1..2..3', kick: 'x...............', snare: '................', hat: '....x.......x...',
    leadWave: 'sine', bassWave: 'sine', arpWave: 'sine', leadOctave: 1, arpOctave: 0,
    pad: true, swing: 0, drumKit: 'soft', echo: 0.35, reverb: 0.5,
  },
  'power-up': {
    bpm: 136, root: 60, scale: MAJOR, chords: [0, 0, 3, 4],
    bass: 'x.x.x.x.o.o.o.o.', lead: '0120312031203120', lead2: '4321432143213210',
    arp: '', kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.',
    leadWave: 'square', bassWave: 'square', arpWave: 'square', leadOctave: 1, arpOctave: 0,
    pad: false, swing: 0, drumKit: 'chip', echo: 0.15, reverb: 0,
  },
  summit: {
    bpm: 96, root: 60, scale: MAJOR, chords: [5, 3, 0, 4],
    bass: 'x...x...x...o...', lead: '2.....1.0...3...', lead2: '4.....3.2...1...',
    arp: '0.1.2.0.1.2.0.1.', kick: 'x.....x.x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.o.',
    leadWave: 'sawtooth', bassWave: 'triangle', arpWave: 'triangle', leadOctave: 1, arpOctave: 1,
    pad: true, swing: 0, drumKit: 'pop', echo: 0.25, reverb: 0.45,
  },
  campfire: {
    bpm: 88, root: 67, scale: MAJOR, chords: [0, 4, 5, 3],
    bass: 'x.....o.x.....o.', lead: '0.1.2.1.0.1.2.3.', lead2: '2.1.0.1.2.3.4.3.',
    arp: '0.12.3.2.12.3.2.', kick: 'x.......x.......', snare: '................', hat: '..x...x...x...x.',
    leadWave: 'triangle', bassWave: 'sine', arpWave: 'triangle', leadOctave: 0, arpOctave: 0,
    pad: false, swing: 0.12, drumKit: 'soft', echo: 0.1, reverb: 0.3,
  },
  'jazz-cafe': {
    bpm: 112, root: 65, scale: DORIAN, chords: [1, 4, 0, 5],
    bass: 'x...o...x...o...', lead: '3..2..1...0..2..', lead2: '0..1..2...3..4..',
    arp: '....1..2....1..2', kick: 'x.........x.....', snare: '....x.......x...', hat: 'x..xx..xx..xx..x',
    leadWave: 'sine', bassWave: 'triangle', arpWave: 'sine', leadOctave: 1, arpOctave: 0,
    pad: true, swing: 0.2, drumKit: 'soft', echo: 0.15, reverb: 0.35,
  },
  'dhol-dance': {
    bpm: 124, root: 62, scale: MIXOLYDIAN, chords: [0, 6, 3, 0],
    bass: 'x..x..x.x..x..o.', lead: '0.2.1.2.0.3.2.1.', lead2: '3.2.1.2.3.4.3.2.',
    arp: '0.0.2.0.0.0.2.0.', kick: 'x..x..x.x..x..x.', snare: '....x..x....x..x', hat: '.x.x.x.x.x.x.x.x',
    leadWave: 'triangle', bassWave: 'sine', arpWave: 'triangle', leadOctave: 1, arpOctave: 1,
    pad: false, swing: 0.08, drumKit: 'dhol', echo: 0.25, reverb: 0.2,
  },
  orbit: {
    bpm: 70, root: 64, scale: MAJOR, chords: [0, 3, 5, 4],
    bass: 'x...............', lead: '0.......2.......', lead2: '3.......1.......',
    arp: '0...1...2...3...', kick: '................', snare: '................', hat: '........x.......',
    leadWave: 'sine', bassWave: 'sine', arpWave: 'sine', leadOctave: 2, arpOctave: 2,
    pad: true, swing: 0, drumKit: 'soft', echo: 0.5, reverb: 0.6,
  },
  'final-lap': {
    bpm: 150, root: 57, scale: MINOR, chords: [0, 5, 6, 4],
    bass: 'xxoxxxoxxxoxxxox', lead: '0.1.2.3.2.1.0.3.', lead2: '3.2.1.0.1.2.3.4.',
    arp: '0.2.0.2.0.2.0.2.', kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'xxxxxxxoxxxxxxxo',
    leadWave: 'sawtooth', bassWave: 'square', arpWave: 'triangle', leadOctave: 1, arpOctave: 1,
    pad: false, swing: 0, drumKit: 'pop', echo: 0.15, reverb: 0.15,
  },
};

const LOOKAHEAD_S = 0.12;
const SCHEDULE_MS = 25;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
/** Melodic parts: dry into the music bus, plus echo and reverb sends. */
let fxBus: GainNode | null = null;
let echoSend: GainNode | null = null;
let echoDelay: DelayNode | null = null;
let reverbSend: GainNode | null = null;
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
  ctx.addEventListener('statechange', notifyPlaying);
  // Gentle bus compression glues the parts together and keeps peaks even on small phone speakers.
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -18;
  glue.knee.value = 12;
  glue.ratio.value = 3;
  glue.attack.value = 0.005;
  glue.release.value = 0.25;
  glue.connect(ctx.destination);
  master = ctx.createGain();
  master.gain.value = 0.9 * volume;
  master.connect(glue);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.24;
  musicBus.connect(master);
  fxBus = ctx.createGain();
  fxBus.connect(musicBus);

  echoSend = ctx.createGain();
  echoDelay = ctx.createDelay(2);
  const echoTone = ctx.createBiquadFilter();
  echoTone.type = 'lowpass';
  echoTone.frequency.value = 2600;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.32;
  fxBus.connect(echoSend).connect(echoDelay).connect(echoTone).connect(feedback).connect(echoDelay);
  echoTone.connect(musicBus);

  reverbSend = ctx.createGain();
  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx, 2.4);
  fxBus.connect(reverbSend).connect(reverb).connect(musicBus);

  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.55;
  sfxBus.connect(master);
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  applyTrackFx();
  return ctx;
}

/** A decaying stereo noise tail: a cheap, natural-sounding room. */
function impulse(audio: AudioContext, seconds: number) {
  const length = Math.floor(audio.sampleRate * seconds);
  const buffer = audio.createBuffer(2, length, audio.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  }
  return buffer;
}

function applyTrackFx() {
  if (!ctx || !echoDelay || !echoSend || !reverbSend) return;
  // Dotted-eighth echo follows the beat of each track.
  echoDelay.delayTime.setValueAtTime(Math.min(1.9, (60 / track.bpm) * 0.75), ctx.currentTime);
  echoSend.gain.setValueAtTime(track.echo * 0.55, ctx.currentTime);
  reverbSend.gain.setValueAtTime(track.reverb * 0.7, ctx.currentTime);
}

interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  slideTo?: number;
  bus?: GainNode | null;
  /** Two voices detuned by this many cents, for width. */
  detune?: number;
  /** Lowpass that closes from `from` to `to` Hz over the note: a pluck or a soft pad. */
  filter?: { from: number; to: number; q?: number };
}

function tone(freq: number, start: number, dur: number, opts: ToneOpts = {}) {
  if (!ctx) return;
  const { type = 'sine', gain = 0.3, attack = 0.005, slideTo, bus = sfxBus, detune = 0, filter } = opts;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  let input: AudioNode = env;
  if (filter) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = filter.q ?? 0.7;
    lp.frequency.setValueAtTime(filter.from, start);
    lp.frequency.exponentialRampToValueAtTime(filter.to, start + dur);
    lp.connect(env);
    input = lp;
  }
  env.connect(bus!);
  for (const cents of detune ? [-detune, detune] : [0]) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.detune.value = cents;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    osc.connect(input);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }
}

function noise(start: number, dur: number, gain: number, bus: GainNode | null, type: BiquadFilterType = 'highpass', freq = 1500, q = 0.7) {
  if (!ctx || !noiseBuffer) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
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

const digit = (pattern: string, pos: number) => {
  const c = pattern[pos];
  return c && c >= '0' && c <= '9' ? Number(c) : null;
};

function playStep(s: number, time: number, stepDur: number) {
  const def = track;
  const pos = s % 16;
  const bar = Math.floor(s / 16);
  const chordRoot = def.chords[bar % def.chords.length]!;
  const chordTone = (k: number) => noteOf(def, chordRoot + 2 * k);
  const music = musicBus;
  const soft = def.drumKit === 'soft';

  const b = def.bass[pos];
  if (b === 'x' || b === 'o') {
    const midi = (b === 'x' ? chordTone(0) : chordTone(2)) - 24;
    tone(mtof(midi), time, stepDur * 1.8, { type: def.bassWave, gain: 0.32, bus: music, filter: { from: 1100, to: 380 } });
  }

  // Melody A for the first half of each 8-bar phrase, the answering melody B for the second.
  const lead = digit(bar % 8 < 4 ? def.lead : def.lead2, pos);
  if (lead !== null) {
    const midi = chordTone(lead) + 12 * def.leadOctave;
    const bright = def.leadWave === 'sine' ? 0.2 : def.leadWave === 'triangle' ? 0.12 : 0.055;
    tone(mtof(midi), time, stepDur * 1.7, {
      type: def.leadWave,
      gain: bright,
      bus: fxBus,
      detune: def.leadWave === 'sine' ? 0 : 7,
      filter: def.leadWave === 'sine' ? undefined : { from: 5200, to: 1400 },
    });
  }

  const arp = digit(def.arp, pos);
  if (arp !== null) {
    const midi = chordTone(arp) + 12 * def.arpOctave;
    tone(mtof(midi), time, stepDur * 0.9, { type: def.arpWave, gain: 0.06, bus: fxBus, filter: { from: 3600, to: 700 } });
  }

  if (def.pad && pos === 0) {
    for (let k = 0; k < 3; k++) {
      tone(mtof(chordTone(k)), time, stepDur * 16, {
        type: 'sawtooth',
        gain: 0.022,
        attack: 0.5,
        bus: fxBus,
        detune: 9,
        filter: { from: 1400, to: 700 },
      });
    }
  }

  if (def.kick[pos] === 'x') {
    if (def.drumKit === 'dhol') tone(110, time, 0.24, { gain: 0.6, slideTo: 58, bus: music });
    else if (def.drumKit === 'chip') tone(180, time, 0.1, { type: 'square', gain: 0.16, slideTo: 50, bus: music });
    else {
      tone(160, time, 0.2, { gain: soft ? 0.35 : 0.6, slideTo: 42, bus: music });
      if (!soft) noise(time, 0.012, 0.18, music, 'highpass', 3000);
    }
  }

  // A short snare fill leads into each new phrase.
  const fill = def.drumKit === 'pop' && bar % 8 === 7 && (pos === 13 || pos === 14 || pos === 15);
  if (def.snare[pos] === 'x' || fill) {
    if (def.drumKit === 'dhol') tone(320, time, 0.12, { type: 'triangle', gain: 0.3, slideTo: 210, bus: music });
    else {
      noise(time, soft ? 0.18 : 0.14, soft ? 0.1 : fill ? 0.16 : 0.24, music, 'bandpass', 1900, 0.8);
      tone(200, time, 0.08, { type: 'triangle', gain: soft ? 0.06 : 0.12, slideTo: 150, bus: music });
    }
  }
  const hat = def.hat[pos];
  if (hat === 'x') noise(time, 0.03, soft ? 0.045 : 0.07, music, 'highpass', 8000);
  else if (hat === 'o') noise(time, 0.2, soft ? 0.035 : 0.055, music, 'highpass', 7000);

  if (!soft && def.drumKit !== 'chip' && bar % 8 === 0 && pos === 0 && s > 0) noise(time, 1.4, 0.07, music, 'highpass', 5000);
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
  applyTrackFx();
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
