type SoundName =
  | 'shoot'
  | 'hit'
  | 'kill'
  | 'hurt'
  | 'pickup'
  | 'wave'
  | 'clear'
  | 'death'
  | 'spit'
  | 'secondary'
  | 'scatter'
  | 'rail'
  | 'dash'
  | 'bossIntro'
  | 'bossCharge'
  | 'bossAttack'
  | 'bossDown';

const STORAGE_KEY = 'shooter-muted';

export class SoundFX {
  muted = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lastShoot = 0;

  constructor() {
    try {
      this.muted = localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  unlock() {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.2;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggle() {
    this.muted = !this.muted;
    try {
      localStorage.setItem(STORAGE_KEY, this.muted ? '1' : '0');
    } catch {
      /* ignore */
    }
    return this.muted;
  }

  play(name: SoundName) {
    if (this.muted || !this.ctx || !this.master) return;
    const now = this.ctx.currentTime;

    switch (name) {
      case 'shoot':
        if (now - this.lastShoot < 0.045) return;
        this.lastShoot = now;
        this.tone(680, 190, 0.065, 'triangle', 0.16, 0);
        this.tone(180, 70, 0.05, 'square', 0.045, 0);
        break;
      case 'hit':
        this.tone(340, 110, 0.07, 'triangle', 0.12, 0);
        break;
      case 'kill':
        this.tone(240, 50, 0.16, 'sawtooth', 0.09, 0);
        this.tone(820, 260, 0.1, 'square', 0.04, 0.01);
        break;
      case 'hurt':
        this.tone(150, 45, 0.28, 'sawtooth', 0.18, 0);
        this.tone(90, 36, 0.32, 'square', 0.1, 0.02);
        break;
      case 'pickup':
        this.tone(620, 980, 0.11, 'sine', 0.14, 0);
        this.tone(980, 1420, 0.14, 'sine', 0.1, 0.08);
        break;
      case 'wave':
        this.tone(320, 420, 0.16, 'triangle', 0.1, 0);
        this.tone(480, 640, 0.2, 'triangle', 0.09, 0.12);
        this.tone(720, 820, 0.24, 'sine', 0.07, 0.24);
        break;
      case 'clear':
        this.tone(560, 700, 0.14, 'sine', 0.1, 0);
        this.tone(840, 1050, 0.22, 'sine', 0.08, 0.11);
        break;
      case 'death':
        this.tone(220, 28, 0.9, 'sawtooth', 0.18, 0);
        this.tone(130, 24, 1.1, 'square', 0.08, 0.05);
        break;
      case 'spit':
        this.tone(430, 140, 0.14, 'square', 0.055, 0);
        break;
      case 'secondary':
        this.tone(210, 58, 0.22, 'sawtooth', 0.16, 0);
        this.tone(760, 210, 0.16, 'square', 0.07, 0);
        this.tone(120, 48, 0.28, 'triangle', 0.11, 0.02);
        break;
      case 'scatter':
        this.tone(200, 46, 0.24, 'sawtooth', 0.17, 0);
        this.tone(96, 34, 0.3, 'square', 0.09, 0.01);
        break;
      case 'rail':
        this.tone(1500, 120, 0.24, 'sawtooth', 0.12, 0);
        this.tone(78, 30, 0.4, 'sine', 0.16, 0);
        this.tone(940, 280, 0.14, 'square', 0.05, 0.02);
        break;
      case 'dash':
        this.tone(190, 720, 0.16, 'sine', 0.11, 0);
        this.tone(520, 160, 0.12, 'triangle', 0.05, 0.02);
        break;
      case 'bossIntro':
        this.tone(90, 40, 0.7, 'sawtooth', 0.17, 0);
        this.tone(180, 90, 0.5, 'square', 0.08, 0.15);
        this.tone(360, 180, 0.6, 'triangle', 0.06, 0.3);
        break;
      case 'bossCharge':
        this.tone(150, 520, 0.4, 'sine', 0.08, 0);
        this.tone(300, 900, 0.35, 'triangle', 0.04, 0.08);
        break;
      case 'bossAttack':
        this.tone(130, 42, 0.32, 'sawtooth', 0.15, 0);
        this.tone(90, 32, 0.4, 'square', 0.08, 0.02);
        this.tone(620, 180, 0.18, 'triangle', 0.05, 0);
        break;
      case 'bossDown':
        this.tone(320, 40, 1.2, 'sawtooth', 0.2, 0);
        this.tone(160, 30, 1.5, 'square', 0.11, 0.08);
        this.tone(880, 220, 0.5, 'triangle', 0.06, 0);
        break;
    }
  }

  private tone(
    from: number,
    to: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    delay: number,
  ) {
    if (!this.ctx || !this.master) return;
    const start = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, from), start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }
}
