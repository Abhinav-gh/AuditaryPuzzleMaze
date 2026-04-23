// AudioManager.js — Rebuilt with gamification sounds + spatial beacon
// Uses ONLY Web Audio API (no external deps)

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.exitBeacon = null;
    this.beaconGain = null;
    this.beaconLFO = null;
    this.panner = null;
    this.isReady = false;
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
  }

  // ─── Footstep (soft wooden thud) ──────────────────────────────────────────
  playFootstep() {
    if (!this.isReady) return;
    const t = this.ctx.currentTime;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.08, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 4);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.ctx.destination);
    src.start(t);
  }

  // ─── WALL THUD (deep resonant OOF — inspired by Minecraft "oof") ──────────
  playWallBump() {
    if (!this.isReady) return;
    const t = this.ctx.currentTime;
    // Low thud
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.15);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.2);

    // Add white noise burst for texture
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.05, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const nSrc = this.ctx.createBufferSource();
    nSrc.buffer = buf;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.2, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    nSrc.connect(ng);
    ng.connect(this.ctx.destination);
    nSrc.start(t);
  }

  // ─── COIN COLLECT sound (Mario-style rising ding) ─────────────────────────
  playCoin() {
    if (!this.isReady) return;
    const t = this.ctx.currentTime;
    const freqs = [988, 1319]; // B5, E6
    freqs.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.15, t + i * 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.15);
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(t + i * 0.08);
      osc.stop(t + i * 0.08 + 0.15);
    });
  }

  // ─── PUZZLE UNLOCK (mysterious sparkle) ───────────────────────────────────
  playPuzzleFound() {
    if (!this.isReady) return;
    const t = this.ctx.currentTime;
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t + i * 0.12);
      osc.frequency.linearRampToValueAtTime(f * 1.03, t + i * 0.12 + 0.1);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t + i * 0.12);
      g.gain.linearRampToValueAtTime(0.2, t + i * 0.12 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.25);
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(t + i * 0.12);
      osc.stop(t + i * 0.12 + 0.3);
    });
  }

  // ─── CORRECT GUESS — Woohoo ascending ────────────────────────────────────
  playCorrect() {
    if (!this.isReady) return;
    const t = this.ctx.currentTime;
    const scale = [523, 659, 784, 1047, 1319];
    scale.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.18, t + i * 0.06);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.12);
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(t + i * 0.06);
      osc.stop(t + i * 0.06 + 0.12);
    });
  }

  // ─── WRONG GUESS — descending buzzer ─────────────────────────────────────
  playWrong() {
    if (!this.isReady) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.25);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  // ─── VICTORY — full jingle (Zelda-ish) ──────────────────────────────────
  playVictory() {
    if (!this.isReady) return;
    const t = this.ctx.currentTime;
    const jingle = [
      { f: 523.25, start: 0,    dur: 0.12 },
      { f: 523.25, start: 0.13, dur: 0.12 },
      { f: 523.25, start: 0.26, dur: 0.12 },
      { f: 415.30, start: 0.39, dur: 0.12 },
      { f: 523.25, start: 0.52, dur: 0.12 },
      { f: 659.25, start: 0.65, dur: 0.35 },
    ];
    jingle.forEach(({ f, start, dur }) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.2, t + start);
      g.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(t + start);
      osc.stop(t + start + dur + 0.05);
    });
  }

  // ─── LETTER HINT tone ─────────────────────────────────────────────────────
  playLetterHint(index, total, isCorrect) {
    if (!this.isReady) return;
    const t = this.ctx.currentTime;
    // Map letter position to a musical scale frequency
    const scale = [261, 294, 330, 349, 392, 440, 494, 523];
    const freq = scale[index % scale.length];
    const osc = this.ctx.createOscillator();
    osc.type = isCorrect ? 'sine' : 'triangle';
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.45);
  }

  // ─── EXIT BEACON (subtle ping, not a constant drone) ─────────────────────
  startBeacon() {
    this._scheduleBeaconPing();
  }

  _scheduleBeaconPing() {
    if (!this.isReady || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 740;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.08, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.35);
    this._beaconTimer = setTimeout(() => this._scheduleBeaconPing(), 1800);
  }

  stopBeacon() {
    clearTimeout(this._beaconTimer);
    this._beaconTimer = null;
  }

  // ─── Update beacon interval based on distance ─────────────────────────────
  updateBeaconRate(distance) {
    // Closer = faster pings (min 500ms, max 2500ms)
    const interval = Math.max(500, Math.min(2500, distance * 600));
    if (this._beaconTimer) {
      clearTimeout(this._beaconTimer);
      this._beaconTimer = setTimeout(() => this._scheduleBeaconPing(), interval);
    }
  }

  stopAll() {
    this.stopBeacon();
    if (this.ctx) {
      setTimeout(() => {
        this.ctx.suspend();
        this.isReady = false;
      }, 1200);
    }
  }
}
