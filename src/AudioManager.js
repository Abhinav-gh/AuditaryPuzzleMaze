// AudioManager.js v4
// New systems:
//  - Ambient audio per cell type (soft looping, stops on move)
//  - playNote(freq) for individual piano keys (chord puzzle)
//  - playHoverPreview(cellType) for mouse direction scanning
//  - playPing() on demand (P key) — no more continuous beacon
//  - All sounds load from soundMap.js with synthesized fallback

import { SOUND_MAP } from './audio/soundMap.js';

// Piano key → frequency map (A=C4 through K=C5)
export const PIANO_KEYS = {
  a: { note: 'C', freq: 261.6 },
  s: { note: 'D', freq: 293.7 },
  d: { note: 'E', freq: 329.6 },
  f: { note: 'F', freq: 349.2 },
  g: { note: 'G', freq: 392.0 },
  h: { note: 'A', freq: 440.0 },
  j: { note: 'B', freq: 493.9 },
  k: { note: 'C5', freq: 523.3 },
};

// Chord definitions using PIANO_KEYS
export const CHORDS = [
  { name: 'C Major', keys: new Set(['a', 'd', 'g']), freqs: [261.6, 329.6, 392.0] },
  { name: 'G Major', keys: new Set(['s', 'g', 'j']), freqs: [293.7, 392.0, 493.9] },
  { name: 'F Major', keys: new Set(['f', 'h', 'a']), freqs: [349.2, 440.0, 261.6] },
  { name: 'A Minor', keys: new Set(['h', 'a', 'd']), freqs: [440.0, 261.6, 329.6] },
  { name: 'D Minor', keys: new Set(['s', 'f', 'h']), freqs: [293.7, 349.2, 440.0] },
  { name: 'E Major', keys: new Set(['d', 'g', 'j']), freqs: [329.6, 392.0, 493.9] },
];

// Simon arrow note frequencies (spatially positioned)
export const SIMON_NOTES = {
  ArrowUp: { freq: 523.3, pan: 0, label: '↑' },
  ArrowDown: { freq: 130.8, pan: 0, label: '↓' },
  ArrowLeft: { freq: 196.0, pan: -0.8, label: '←' },
  ArrowRight: { freq: 329.6, pan: 0.8, label: '→' },
};

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.isReady = false;
    this.soundBuffers = {};
    this._preloadErrors = {};
    // Ambient state
    this._ambientNodes = [];
    // Active piano notes (for chord puzzle)
    this._activeNotes = {};
    // Victory background music nodes (for fade out)
    this._victoryBgNode = null;
    this._victorySrcNode = null;
  }

  async init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      this.isReady = true;
      return;
    }
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.isReady = true;
    await this._preloadSounds();
  }

  async _preloadSounds() {
    for (const [name, config] of Object.entries(SOUND_MAP)) {
      if (!config.file) continue;

      const files = Array.isArray(config.file) ? config.file : [config.file];
      this.soundBuffers[name] = [];

      for (const file of files) {
        try {
          const res = await fetch(file);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const ab = await res.arrayBuffer();
          let decodedBuffer;
          // decodeAudioData may be promise-based or callback-based across browsers;
          // await the result for modern browsers and fall back to callback wrapper.
          try {
            decodedBuffer = await this.ctx.decodeAudioData(ab);
          } catch (dErr) {
            try {
              decodedBuffer = await new Promise((resolve, reject) => {
                this.ctx.decodeAudioData(ab, resolve, reject);
              });
            } catch (cbErr) {
              // store decode error for inspection and continue
              this._preloadErrors[`${name}_${file}`] = cbErr;
              console.warn(`[AudioManager] decodeAudioData failed for "${name}" -> "${file}"`, cbErr && cbErr.message ? cbErr.message : cbErr);
              continue;
            }
          }
          // successful decode
          this.soundBuffers[name].push(decodedBuffer);
          console.info(`[AudioManager] Preloaded sound: ${name} -> ${file} (${decodedBuffer?.duration?.toFixed?.(2) ?? '?.?'}s)`);
        } catch (e) {
          this._preloadErrors[`${name}_${file}`] = e;
          console.warn(`[AudioManager] "${name}" -> "${file}" file load failed, using synthesis.`, e && e.message ? e.message : e);
        }
      }

      if (this.soundBuffers[name].length === 0) {
        delete this.soundBuffers[name];
      }
    }
  }

  _play(name, synthFn, vol = 1, playBoth = false) {
    if (!this.isReady) {
      console.warn(`[AudioManager] _play called before ready: ${name}`);
      return;
    }

    if (this.soundBuffers[name] && this.soundBuffers[name].length > 0) {
      try {
        const buffers = this.soundBuffers[name];
        const buffer = buffers[Math.floor(Math.random() * buffers.length)];
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        const g = this.ctx.createGain();
        g.gain.value = vol;
        src.connect(g); g.connect(this.ctx.destination);
        src.start();
        console.debug(`[AudioManager] Playing buffer sound: ${name} (duration=${buffer.duration.toFixed(2)}s)`);
      } catch (err) {
        this._preloadErrors[name] = err;
        console.error(`[AudioManager] Error while starting buffer source for "${name}":`, err);
        // fall through to synth fallback if provided
        if (!synthFn) return;
      }
      // If playBoth is true, also play the synth sound
      if (playBoth && typeof synthFn === 'function') {
        try { synthFn(); } catch (sErr) { console.error(`[AudioManager] synthFn threw for playBoth ${name}:`, sErr); }
      }
    } else {
      if (typeof synthFn === 'function') {
        try { synthFn(); } catch (sErr) { console.error(`[AudioManager] synthFn threw for ${name}:`, sErr); }
      } else {
        console.warn(`[AudioManager] Missing sound buffer and no synth fallback provided for "${name}"`);
      }
    }
  }

  // ─── AMBIENT (looping per-cell audio) ─────────────────────────────────────
  // Types: 'path', 'puzzle', 'chord', 'rhythm', 'simon', 'exit'
  playAmbient(type) {
    this.stopAmbient();
    if (!this.isReady) return;
    const t = this.ctx.currentTime;

    if (type === 'puzzle' || type === 'wordle') {
      // Slow mysterious pulse
      const main = this.ctx.createGain();
      main.gain.value = 0;
      main.gain.linearRampToValueAtTime(0.025, t + 0.5);
      const osc = this.ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.value = 340;
      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine'; lfo.frequency.value = 0.4;
      const lfoG = this.ctx.createGain(); lfoG.gain.value = 30;
      lfo.connect(lfoG); lfoG.connect(osc.frequency);
      osc.connect(main); main.connect(this.ctx.destination);
      osc.start(); lfo.start();
      this._ambientNodes = [osc, lfo, main, lfoG];

    } else if (type === 'chord') {
      // Low diminished hum
      const main = this.ctx.createGain();
      main.gain.value = 0;
      main.gain.linearRampToValueAtTime(0.02, t + 0.5);
      [138.6, 174.6, 207.7].forEach(f => {
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle'; osc.frequency.value = f;
        osc.connect(main); osc.start();
        this._ambientNodes.push(osc);
      });
      main.connect(this.ctx.destination);
      this._ambientNodes.push(main);

    } else if (type === 'rhythm') {
      // Intentionally silent — metronome pulse was too annoying in ambient
      return;

    } else if (type === 'simon') {
      // Intentionally silent — stab pulse was too annoying in ambient
      return;

    } else if (type === 'exit') {
      // Bright shimmer
      const main = this.ctx.createGain();
      main.gain.value = 0;
      main.gain.linearRampToValueAtTime(0.03, t + 0.5);
      [784, 1047].forEach(f => {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine'; osc.frequency.value = f;
        const lfo = this.ctx.createOscillator();
        lfo.type = 'sine'; lfo.frequency.value = 3;
        const lg = this.ctx.createGain(); lg.gain.value = 2;
        lfo.connect(lg); lg.connect(osc.frequency);
        osc.connect(main); osc.start(); lfo.start();
        this._ambientNodes.push(osc, lfo, lg);
      });
      main.connect(this.ctx.destination);
      this._ambientNodes.push(main);

    } else if (type === 'danger_adj') {
      // Very low rumble
      const main = this.ctx.createGain();
      main.gain.value = 0;
      main.gain.linearRampToValueAtTime(0.04, t + 0.3);
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth'; osc.frequency.value = 40;
      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine'; lfo.frequency.value = 1.2;
      const lg = this.ctx.createGain(); lg.gain.value = 8;
      lfo.connect(lg); lg.connect(osc.frequency);
      osc.connect(main); main.connect(this.ctx.destination);
      osc.start(); lfo.start();
      this._ambientNodes = [osc, lfo, lg, main];
    }
    // 'path' — silence is fine
  }

  _startMetronomeAmbient() {
    const tick = () => {
      if (!this.isReady || !this._metronomeActive) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.value = 660;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.022, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc.connect(g); g.connect(this.ctx.destination);
      osc.start(t); osc.stop(t + 0.1);
      this._metronomeTimer = setTimeout(tick, 1200);
    };
    this._metronomeActive = true;
    tick();
  }

  stopAmbient() {
    this._metronomeActive = false;
    clearTimeout(this._metronomeTimer);
    clearInterval(this._simonAmbientInterval);
    this._ambientNodes.forEach(n => {
      try { n.stop?.(); } catch { }
      try { n.disconnect?.(); } catch { }
    });
    this._ambientNodes = [];
  }

  // ─── FOOTSTEP ─────────────────────────────────────────────────────────────
  playFootstep() {
    this._play('footstep', () => {
      const t = this.ctx.currentTime;
      const len = Math.round(this.ctx.sampleRate * 0.08);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      src.connect(f); f.connect(g); g.connect(this.ctx.destination); src.start(t);
    });
  }

  // ─── WALL BUMP ────────────────────────────────────────────────────────────
  playWallBump() {
    this._play('wallBump', () => {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.setValueAtTime(140, t); osc.frequency.exponentialRampToValueAtTime(55, t + 0.18);
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + 0.25);
      const len = Math.round(this.ctx.sampleRate * 0.05);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const ns = this.ctx.createBufferSource(); ns.buffer = buf;
      const ng = this.ctx.createGain(); ng.gain.setValueAtTime(0.15, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      ns.connect(ng); ng.connect(this.ctx.destination); ns.start(t);
    });
  }

  // ─── COIN ─────────────────────────────────────────────────────────────────
  playCoin() {
    this._play('coin', () => {
      const t = this.ctx.currentTime;
      [988, 1319].forEach((f, i) => {
        const osc = this.ctx.createOscillator(); osc.type = 'square'; osc.frequency.value = f;
        const g = this.ctx.createGain(); g.gain.setValueAtTime(0.12, t + i * 0.09); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.18);
        osc.connect(g); g.connect(this.ctx.destination); osc.start(t + i * 0.09); osc.stop(t + i * 0.09 + 0.2);
      });
    });
  }

  // ─── PUZZLE FOUND ─────────────────────────────────────────────────────────
  playPuzzleFound() {
    this._play('puzzleFound', () => {
      const t = this.ctx.currentTime;
      [523, 659, 784, 1047].forEach((f, i) => {
        const osc = this.ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = f;
        const g = this.ctx.createGain(); g.gain.setValueAtTime(0, t + i * 0.13); g.gain.linearRampToValueAtTime(0.2, t + i * 0.13 + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.13 + 0.28);
        osc.connect(g); g.connect(this.ctx.destination); osc.start(t + i * 0.13); osc.stop(t + i * 0.13 + 0.32);
      });
    });
  }

  // ─── CORRECT ──────────────────────────────────────────────────────────────
  playCorrect() {
    this._play('correct', () => {
      const t = this.ctx.currentTime;
      [523, 659, 784, 1047, 1319].forEach((f, i) => {
        const osc = this.ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.value = f;
        const g = this.ctx.createGain(); g.gain.setValueAtTime(0.18, t + i * 0.065); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.065 + 0.13);
        osc.connect(g); g.connect(this.ctx.destination); osc.start(t + i * 0.065); osc.stop(t + i * 0.065 + 0.15);
      });
    });
  }

  // ─── WRONG ────────────────────────────────────────────────────────────────
  playWrong() {
    this._play('wrong', () => {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator(); osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, t); osc.frequency.exponentialRampToValueAtTime(90, t + 0.28);
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + 0.35);
    });
  }

  // ─── VICTORY ──────────────────────────────────────────────────────────────
  playVictory(volume = 0.25, fadeOutDuration = 2) {
    if (!this.isReady) return;

    // Ensure AudioContext is running (browser autoplay policy may suspend it)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().then(() => this._playVictoryInternal(volume, fadeOutDuration));
      return;
    }
    this._playVictoryInternal(volume, fadeOutDuration);
  }

  _playVictoryInternal(volume, fadeOutDuration) {
    // Stop any previous victory sound
    if (this._victorySrcNode) {
      try { this._victorySrcNode.stop(); } catch (e) { }
      this._victorySrcNode = null;
    }

    // Play buffer if available
    if (this.soundBuffers['victory'] && this.soundBuffers['victory'].length > 0) {
      try {
        const t = this.ctx.currentTime;
        const src = this.ctx.createBufferSource();
        const buffers = this.soundBuffers['victory'];
        src.buffer = buffers[Math.floor(Math.random() * buffers.length)];
        src.loop = false; // play once — it's a game-over sting, not a loop
        const gainNode = this.ctx.createGain();
        gainNode.gain.setValueAtTime(volume, t);
        src.connect(gainNode); gainNode.connect(this.ctx.destination);
        src.start(t);
        this._victorySrcNode = src;
        src.onended = () => { this._victorySrcNode = null; };
        console.debug('[AudioManager] Playing game-over/victory buffer sound');
        return;
      } catch (err) {
        console.error('[AudioManager] Error playing decoded victory buffer, will try fallbacks', err);
      }
    }

    // No decoded buffer available — try HTMLAudio, then synth fallback
    console.warn('[AudioManager] Victory sound not available as decoded buffer - attempting HTMLAudio then synth fallback');
    const vfSource = SOUND_MAP.victory && SOUND_MAP.victory.file;
    const vf = Array.isArray(vfSource) ? vfSource[Math.floor(Math.random() * vfSource.length)] : vfSource;
    const synthFallback = () => {
      try {
        const t = this.ctx.currentTime;
        [{ f: 523.25, s: 0, d: .12 }, { f: 523.25, s: .14, d: .12 }, { f: 523.25, s: .28, d: .12 }, { f: 415.3, s: .42, d: .12 }, { f: 523.25, s: .56, d: .12 }, { f: 659.25, s: .7, d: .4 }].forEach(({ f, s, d }) => {
          const i = this.ctx.createOscillator(); i.type = 'square'; i.frequency.value = f;
          const o = this.ctx.createGain(); o.gain.setValueAtTime(0.2, t + s); o.gain.exponentialRampToValueAtTime(0.001, t + s + d);
          i.connect(o); o.connect(this.ctx.destination); i.start(t + s); i.stop(t + s + d + 0.05);
        });
      } catch (sErr) { console.error('[AudioManager] synth fallback failed for victory', sErr); }
    };

    if (vf) {
      try {
        const a = new Audio(vf);
        a.volume = Math.max(0, Math.min(1, volume));
        a.play().catch((err) => {
          console.warn('[AudioManager] HTMLAudio fallback failed for victory, using synth', err);
          synthFallback();
        });
      } catch (err) {
        console.warn('[AudioManager] Victory HTMLAudio construction failed, using synth', err);
        synthFallback();
      }
    } else {
      synthFallback();
    }
  }

  // playGameOver: dedicated entry point — resumes context then plays the victory/game-over sound
  playGameOver(volume = 0.25, fadeOutDuration = 2) {
    if (!this.isReady) {
      console.warn('[AudioManager] playGameOver called before AudioManager is ready');
      return;
    }
    // Always resume the AudioContext first in case it was suspended
    const doPlay = () => this._playVictoryInternal(volume, fadeOutDuration);
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().then(doPlay).catch((err) => {
        console.error('[AudioManager] Could not resume AudioContext for game over sound', err);
        doPlay(); // attempt anyway
      });
    } else {
      doPlay();
    }
  }

  // ─── DANGER GROWL (spatial) ───────────────────────────────────────────────
  playDangerGrowl(pan = 0, vol = 0.4) {
    this._play('dangerGrowl', () => {
      const t = this.ctx.currentTime;
      const panner = this.ctx.createStereoPanner(); panner.pan.value = Math.max(-1, Math.min(1, pan));
      const osc = this.ctx.createOscillator(); osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(55, t); osc.frequency.setValueAtTime(45, t + 0.1); osc.frequency.setValueAtTime(65, t + 0.2);
      const bufLen = Math.round(this.ctx.sampleRate * 0.5);
      const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) d[i] = (Math.random() * 2 - 1) * 0.3 * Math.sin(i / bufLen * Math.PI);
      const ns = this.ctx.createBufferSource(); ns.buffer = buf;
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      const flt = this.ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 400;
      osc.connect(flt); ns.connect(flt); flt.connect(g); g.connect(panner); panner.connect(this.ctx.destination);
      osc.start(t); osc.stop(t + 0.6); ns.start(t);
    });
  }

  // ─── DANGER HIT (jumpscare) ───────────────────────────────────────────────
  playDangerHit() {
    this._play('dangerHit', () => {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator(); osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(800, t); osc.frequency.exponentialRampToValueAtTime(100, t + 0.3);
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + 0.38);
      const osc2 = this.ctx.createOscillator(); osc2.type = 'sine';
      osc2.frequency.setValueAtTime(120, t + 0.05); osc2.frequency.exponentialRampToValueAtTime(30, t + 0.4);
      const g2 = this.ctx.createGain(); g2.gain.setValueAtTime(0.7, t + 0.05); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc2.connect(g2); g2.connect(this.ctx.destination); osc2.start(t + 0.05); osc2.stop(t + 0.5);
    }, 0.15, true);
  }

  // ─── ON-DEMAND PING ───────────────────────────────────────────────────────
  playPing(exitDir, distance) {
    this._play('ping', () => {
      const t = this.ctx.currentTime;
      let pan = 0;
      if (exitDir.includes('east')) pan = Math.min(1, distance * 0.25);
      if (exitDir.includes('west')) pan = Math.max(-1, -distance * 0.25);
      const panner = this.ctx.createStereoPanner(); panner.pan.value = pan;
      const freq = Math.max(440, 1200 - distance * 100);
      [freq, freq * 1.5].forEach((f, i) => {
        const osc = this.ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = f;
        const g = this.ctx.createGain(); g.gain.setValueAtTime(0, t + i * 0.12); g.gain.linearRampToValueAtTime(0.15, t + i * 0.12 + 0.03); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.25);
        osc.connect(g); g.connect(panner); panner.connect(this.ctx.destination); osc.start(t + i * 0.12); osc.stop(t + i * 0.12 + 0.28);
      });
    });
  }

  // ─── PIANO NOTE (chord puzzle — sustain while key held) ───────────────────
  playNoteStart(key, freq) {
    if (!this.isReady || this._activeNotes[key]) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle'; osc.frequency.value = freq;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.2, t + 0.03);
    osc.connect(g); g.connect(this.ctx.destination); osc.start();
    this._activeNotes[key] = { osc, gain: g };
  }

  playNoteStop(key) {
    const note = this._activeNotes[key];
    if (!note) return;
    const t = this.ctx.currentTime;
    note.gain.gain.cancelScheduledValues(t);
    note.gain.gain.setValueAtTime(note.gain.gain.value, t);
    note.gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    setTimeout(() => { try { note.osc.stop(); } catch { } }, 200);
    delete this._activeNotes[key];
  }

  stopAllNotes() {
    Object.keys(this._activeNotes).forEach(k => this.playNoteStop(k));
  }

  // ─── CHORD PLAYBACK (replay target for chord puzzle) ──────────────────────
  playChord(freqs, duration = 1.2, vol = 0.15) {
    if (!this.isReady) return;
    const t = this.ctx.currentTime;
    freqs.forEach(f => {
      const osc = this.ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.05);
      g.gain.setValueAtTime(vol, t + duration - 0.15); g.gain.exponentialRampToValueAtTime(0.001, t + duration);
      osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + duration + 0.05);
    });
  }

  // ─── SIMON ARROW NOTE (spatially panned) ──────────────────────────────────
  playSimonNote(key, vol = 0.18, duration = 0.5) {
    if (!this.isReady) return;
    const note = SIMON_NOTES[key];
    if (!note) return;
    const t = this.ctx.currentTime;
    const panner = this.ctx.createStereoPanner(); panner.pan.value = note.pan;
    const osc = this.ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.value = note.freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.03);
    g.gain.setValueAtTime(vol, t + duration - 0.1); g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g); g.connect(panner); panner.connect(this.ctx.destination);
    osc.start(t); osc.stop(t + duration + 0.05);
  }

  // ─── RHYTHM BEAT (for rhythm puzzle) ─────────────────────────────────────
  playBeat(vol = 0.35) {
    if (!this.isReady) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 440;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + 0.12);
  }

  playMetronomeTick(isAccent = false) {
    if (!this.isReady) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.value = isAccent ? 880 : 440;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(isAccent ? 0.25 : 0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + 0.1);
  }

  // ─── MOUSE HOVER PREVIEW ──────────────────────────────────────────────────
  // cellType: CELL constant value, dir: direction this adjacent cell is in
  playHoverPreview(cellType, dir = 0) {
    if (!this.isReady) return;
    const t = this.ctx.currentTime;
    const pan = dir === 'west' ? -0.6 : dir === 'east' ? 0.6 : 0;
    const panner = this.ctx.createStereoPanner(); panner.pan.value = pan;

    let freq, type, vol, dur;
    switch (cellType) {
      case 0: // PATH — soft step
        freq = 350; type = 'sine'; vol = 0.07; dur = 0.08; break;
      case 1: // WALL — dull thud
        freq = 80; type = 'sine'; vol = 0.2; dur = 0.12; break;
      case 2: // EXIT — bright ding
        freq = 880; type = 'sine'; vol = 0.12; dur = 0.25; break;
      case 3: // WORDLE — soft mystical
        freq = 440; type = 'triangle'; vol = 0.08; dur = 0.18; break;
      case 4: // CHORD — musical shimmer
        freq = 523; type = 'triangle'; vol = 0.08; dur = 0.2; break;
      case 5: // DANGER — short growl burst
        this.playDangerGrowl(pan, 0.25); return;
      case 6: // RHYTHM — metronome tick
        freq = 550; type = 'square'; vol = 0.06; dur = 0.06; break;
      case 7: // SIMON — directional note
        freq = 392; type = 'sine'; vol = 0.08; dur = 0.18; break;
      default:
        freq = 300; type = 'sine'; vol = 0.05; dur = 0.08;
    }

    const osc = this.ctx.createOscillator(); osc.type = type; osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(panner); panner.connect(this.ctx.destination);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  // ─── LETTER HINT (Wordle per-letter sound) ────────────────────────────────
  playLetterHint(index) {
    if (!this.isReady) return;
    const scale = [261, 294, 330, 349, 392, 440, 494, 523];
    const f = scale[index % scale.length]; const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = f;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(g); g.connect(this.ctx.destination); osc.start(t); osc.stop(t + 0.18);
  }

  stopAll() {
    this.stopAmbient();
    this.stopAllNotes();
    if (this.ctx) setTimeout(() => { this.ctx.suspend(); this.isReady = false; }, 1200);
  }
}
