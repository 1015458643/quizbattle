/* =========================================================
   QuizBattle — Motor de audio sintetizado (Web Audio API)
   Todos los sonidos se generan por código: sin archivos .mp3
   ========================================================= */
'use strict';

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.noiseBuffer = null;
    this.muted = false;
    try { this.muted = localStorage.getItem('quizbattle.muted') === '1'; } catch (e) { /* sin storage */ }
    this.musicTimer = null;
    this.musicKind = null;
    this.step = 0;
    this.nextTime = 0;
  }

  /* Debe llamarse tras un gesto del usuario (click/tap) */
  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.7;
      this.master.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.45;
      this.musicBus.connect(this.master);
      // Buffer de ruido blanco reutilizable (hi-hats, tictac)
      const len = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('quizbattle.muted', m ? '1' : '0'); } catch (e) { /* sin storage */ }
    if (this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(m ? 0 : 0.7, t, 0.05);
    }
  }

  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  static midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  /* Oscilador con envolvente */
  tone(freq, dur, opts = {}) {
    if (!this.ctx) return;
    const { type = 'sine', vol = 0.3, at = null, when = 0, attack = 0.005, slideTo = null, bus = null, detune = 0 } = opts;
    const t = at !== null ? at : this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.detune.value = detune;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(bus || this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /* Ruido filtrado (percusión) */
  noise(dur, opts = {}) {
    if (!this.ctx) return;
    const { vol = 0.15, at = null, when = 0, freq = 7000, type = 'highpass', bus = null } = opts;
    const t = at !== null ? at : this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(bus || this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  kick(at, bus) {
    this.tone(150, 0.18, { type: 'sine', vol: 0.6, at, slideTo: 40, bus });
  }

  /* ---------------- Efectos ---------------- */
  pop() {
    this.init();
    this.tone(500, 0.12, { type: 'sine', vol: 0.45, slideTo: 1300 });
    this.tone(1300, 0.08, { type: 'triangle', vol: 0.15, when: 0.06 });
  }

  click() {
    this.init();
    this.tone(800, 0.06, { type: 'triangle', vol: 0.2 });
  }

  tick(urgent = false) {
    this.init();
    this.noise(0.04, { vol: urgent ? 0.35 : 0.2, freq: urgent ? 5000 : 3000, type: 'bandpass' });
    this.tone(urgent ? 1760 : 1200, 0.05, { type: 'square', vol: urgent ? 0.12 : 0.07 });
  }

  countBeep(final = false) {
    this.init();
    if (final) {
      this.tone(Audio_N(72), 0.5, { type: 'square', vol: 0.18 });
      this.tone(Audio_N(79), 0.5, { type: 'triangle', vol: 0.25 });
    } else {
      this.tone(Audio_N(67), 0.18, { type: 'square', vol: 0.18 });
    }
  }

  gong() {
    this.init();
    const base = 98;
    [1, 2.01, 2.76, 3.95, 5.4].forEach((r, i) => {
      this.tone(base * r, 2.6 - i * 0.35, { type: 'sine', vol: 0.32 / (i + 1), attack: 0.004 });
    });
    this.noise(0.25, { vol: 0.12, freq: 1500, type: 'lowpass' });
  }

  correct() {
    this.init();
    [72, 76, 79, 84].forEach((n, i) => {
      this.tone(Audio_N(n), 0.25, { type: 'triangle', vol: 0.3, when: i * 0.09 });
      this.tone(Audio_N(n), 0.2, { type: 'square', vol: 0.05, when: i * 0.09 });
    });
  }

  wrong() {
    this.init();
    this.tone(320, 0.35, { type: 'sawtooth', vol: 0.18, slideTo: 140 });
    this.tone(240, 0.45, { type: 'square', vol: 0.1, when: 0.18, slideTo: 90 });
  }

  answerSent() {
    this.init();
    this.tone(660, 0.1, { type: 'sine', vol: 0.25, slideTo: 990 });
  }

  whoosh() {
    this.init();
    this.noise(0.4, { vol: 0.15, freq: 1200, type: 'bandpass' });
  }

  drumroll(duration = 1) {
    this.init();
    const t0 = this.ctx.currentTime;
    for (let t = 0; t < duration; t += 0.045) {
      this.noise(0.05, { vol: 0.08 + 0.12 * (t / duration), at: t0 + t, freq: 900, type: 'bandpass' });
    }
  }

  fanfare() {
    this.init();
    const seq = [
      [67, 0, 0.15], [67, 0.15, 0.15], [67, 0.3, 0.15], [72, 0.45, 0.6],
      [76, 1.05, 0.25], [74, 1.3, 0.25], [76, 1.55, 0.25], [79, 1.8, 1.2]
    ];
    seq.forEach(([n, w, d]) => {
      this.tone(Audio_N(n), d, { type: 'square', vol: 0.12, when: w });
      this.tone(Audio_N(n), d, { type: 'triangle', vol: 0.22, when: w });
      this.tone(Audio_N(n - 12), d, { type: 'sawtooth', vol: 0.05, when: w });
    });
    // acorde final
    [60, 64, 67, 72].forEach(n => this.tone(Audio_N(n), 1.6, { type: 'triangle', vol: 0.12, when: 1.8 }));
    this.kick(this.ctx.currentTime + 1.8);
  }

  /* ---------------- Música ---------------- */
  startMusic(kind) {
    this.init();
    if (!this.ctx) return;
    if (this.musicKind === kind && this.musicTimer) return;
    this.stopMusic();
    this.musicKind = kind;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.musicTimer = setInterval(() => this._scheduler(), 25);
  }

  stopMusic() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
    this.musicKind = null;
  }

  _scheduler() {
    if (!this.ctx) return;
    const bpm = this.musicKind === 'tension' ? 150 : 112;
    const stepDur = 60 / bpm / 4; // semicorchea
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      if (this.musicKind === 'lobby') this._lobbyStep(this.step, this.nextTime, stepDur);
      else if (this.musicKind === 'tension') this._tensionStep(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  _lobbyStep(step, t, sd) {
    const bus = this.musicBus;
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const roots = [48, 45, 41, 43];      // C  Am  F  G
    const thirds = [4, 3, 4, 4];
    const root = roots[bar];
    // Bajo sincopado
    if ([0, 3, 6, 8, 11, 14].includes(s)) {
      this.tone(Audio_N(root - 12), sd * 1.8, { type: 'triangle', vol: 0.5, at: t, bus });
    }
    // Acordes en contratiempo
    if ([2, 6, 10, 14].includes(s)) {
      [0, thirds[bar], 7].forEach(iv => this.tone(Audio_N(root + 12 + iv), sd * 1.2, { type: 'square', vol: 0.045, at: t, bus }));
    }
    // Melodía saltarina
    const mel = [79, null, 76, null, 79, 81, null, 79, 76, null, 74, null, 76, null, null, null];
    const shift = [0, -3, -7, -5][bar];
    if (mel[s] !== null && bar % 2 === 1) {
      this.tone(Audio_N(mel[s] + shift), sd * 1.5, { type: 'triangle', vol: 0.14, at: t, bus });
    }
    // Percusión
    if (s % 4 === 0) this.kick(t, bus);
    if (s % 2 === 0) this.noise(0.03, { vol: 0.06, at: t, freq: 8000, bus });
    if (s === 4 || s === 12) this.noise(0.12, { vol: 0.12, at: t, freq: 1800, type: 'bandpass', bus });
  }

  _tensionStep(step, t, sd) {
    const bus = this.musicBus;
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const root = (Math.floor(bar / 2) % 2 === 0) ? 45 : 46; // A / Bb
    // Bajo pulsante en corcheas
    if (s % 2 === 0) this.tone(Audio_N(root - 12), sd * 1.6, { type: 'sawtooth', vol: 0.12, at: t, bus });
    // Ostinato agudo
    const ost = [0, 3, 7, 3, 12, 7, 3, 7];
    if (s % 2 === 0) this.tone(Audio_N(root + 24 + ost[(s / 2) % 8]), sd * 1.4, { type: 'triangle', vol: 0.12, at: t, bus });
    // Pad de cuerdas
    if (s === 0) [0, 3, 7].forEach(iv => this.tone(Audio_N(root + 12 + iv), sd * 15, { type: 'sawtooth', vol: 0.02, at: t, attack: 0.3, bus }));
    // Percusión
    if (s === 0 || s === 8 || s === 10) this.kick(t, bus);
    this.noise(0.025, { vol: s % 4 === 2 ? 0.08 : 0.04, at: t, freq: 9000, bus });
  }
}

function Audio_N(n) { return AudioEngine.midi(n); }

const audio = new AudioEngine();
window.audio = audio;
