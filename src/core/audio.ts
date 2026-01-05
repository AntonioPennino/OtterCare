type AudioAssetKind = 'ambient' | 'sfx';

export interface AudioAssetDefinition {
  url: string;
  kind?: AudioAssetKind;
  volume?: number;
}

interface AmbientPlayback {
  name: string;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/**
 * AudioManager centralizza la riproduzione dei suoni e delle tracce ambient.
 * Gestisce caricamento asincrono, loop con cross-fade e SFX con variazioni dinamiche.
 */
export class AudioManager {
  private static instance: AudioManager | null = null;

  private context: AudioContext | null = null;
  private outputGain: GainNode | null = null;
  private readonly manifest = new Map<string, AudioAssetDefinition>();
  private readonly bufferCache = new Map<string, AudioBuffer>();
  private readonly bufferPromises = new Map<string, Promise<AudioBuffer>>();
  private currentAmbient: AmbientPlayback | null = null;
  private readonly defaultFade = 1.6;
  private isAmbienceMuted = false;
  private lastAmbientName: string | null = null;

  public static getInstance(): AudioManager {
    if (!this.instance) {
      this.instance = new AudioManager();
    }
    return this.instance;
  }

  public registerAsset(name: string, definition: AudioAssetDefinition): void {
    this.manifest.set(name, definition);
  }

  public registerAssets(definitions: Record<string, AudioAssetDefinition>): void {
    Object.entries(definitions).forEach(([name, def]) => {
      this.registerAsset(name, def);
    });
  }

  public hasAsset(name: string): boolean {
    return this.manifest.has(name);
  }

  public async preload(...names: string[]): Promise<void> {
    await Promise.all(names.map(name => this.safeLoadBuffer(name)));
  }

  public async resume(): Promise<void> {
    try {
      const ctx = this.getContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
    } catch (error) {
      console.warn('Impossibile riprendere AudioContext', error);
    }
  }

  public suspend(): void {
    if (!this.context) {
      return;
    }
    if (this.context.state === 'running') {
      void this.context.suspend().catch(error => {
        console.warn('Impossibile sospendere AudioContext', error);
      });
    }
  }

  public setAmbienceMuted(muted: boolean): void {
    this.isAmbienceMuted = muted;
    if (muted) {
      void this.stopAmbient();
    } else if (this.lastAmbientName) {
      void this.playAmbient(this.lastAmbientName);
    }
  }

  public async playAmbient(name: string, volume = 0.5): Promise<void> {
    this.lastAmbientName = name;

    if (this.isAmbienceMuted) {
      return;
    }

    if (!this.manifest.has(name)) {
      console.warn(`Traccia ambient "${name}" non registrata`);
      return;
    }

    const existing = this.currentAmbient;
    if (existing && existing.name === name) {
      this.fadeTo(existing.gain.gain, this.clampVolume(volume), this.defaultFade);
      return;
    }

    let buffer: AudioBuffer;
    try {
      buffer = await this.safeLoadBuffer(name);
    } catch (error) {
      console.warn(`Impossibile riprodurre la traccia ambient "${name}"`, error);
      return;
    }

    await this.resume();
    const ctx = this.getContext();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    source.connect(gainNode);
    gainNode.connect(this.getOutputGain());
    source.start();

    if (existing) {
      this.fadeAndStop(existing);
    }

    this.currentAmbient = { name, source, gain: gainNode };
    this.fadeTo(gainNode.gain, this.clampVolume(volume), this.defaultFade);
  }

  public async stopAmbient(fadeSeconds = this.defaultFade): Promise<void> {
    const ambient = this.currentAmbient;
    if (!ambient) {
      return;
    }
    this.currentAmbient = null;
    this.fadeAndStop(ambient, fadeSeconds);
  }

  public async playSFX(name: string, variance = false): Promise<void> {
    if (!this.manifest.has(name)) {
      await this.resume();
      this.playFallbackClick(this.getContext());
      return;
    }

    let buffer: AudioBuffer | null = null;
    try {
      buffer = await this.safeLoadBuffer(name);
    } catch (error) {
      console.warn(`Impossibile riprodurre SFX "${name}"`, error);
    }

    await this.resume();
    const ctx = this.getContext();

    if (!buffer) {
      this.playFallbackClick(ctx);
      return;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const asset = this.manifest.get(name);

    if (variance) {
      const rate = 0.92 + Math.random() * 0.16;
      source.playbackRate.setValueAtTime(rate, ctx.currentTime);
    }

    const gainNode = ctx.createGain();
    let baseVolume = asset?.volume ?? 0.8;
    if (variance) {
      const diff = 0.8 + Math.random() * 0.4;
      baseVolume *= diff;
    }
    gainNode.gain.setValueAtTime(this.clampVolume(baseVolume), ctx.currentTime);

    source.connect(gainNode);
    gainNode.connect(this.getOutputGain());

    source.addEventListener('ended', () => {
      source.disconnect();
      gainNode.disconnect();
    }, { once: true });

    source.start();
  }

  private getContext(): AudioContext {
    if (!this.context) {
      const AnyCtx = window.AudioContext
        || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AnyCtx) {
        throw new Error('AudioContext non supportato dal browser');
      }
      this.context = new AnyCtx();
      this.outputGain = this.context.createGain();
      this.outputGain.gain.setValueAtTime(1, this.context.currentTime);
      this.outputGain.connect(this.context.destination);
    }
    return this.context;
  }

  private getOutputGain(): GainNode {
    const ctx = this.getContext();
    if (!this.outputGain) {
      this.outputGain = ctx.createGain();
      this.outputGain.gain.setValueAtTime(1, ctx.currentTime);
      this.outputGain.connect(ctx.destination);
    }
    return this.outputGain;
  }

  private async safeLoadBuffer(name: string): Promise<AudioBuffer> {
    if (this.bufferCache.has(name)) {
      return this.bufferCache.get(name)!;
    }

    if (this.bufferPromises.has(name)) {
      return this.bufferPromises.get(name)!;
    }

    const asset = this.manifest.get(name);
    if (!asset) {
      throw new Error(`Asset audio "${name}" non registrato`);
    }

    const ctx = this.getContext();
    const promise = fetch(asset.url, { mode: 'cors' })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Fetch fallito (${response.status})`);
        }
        return response.arrayBuffer();
      })
      .then(data => this.decodeAudioData(ctx, data))
      .then(buffer => {
        this.bufferCache.set(name, buffer);
        this.bufferPromises.delete(name);
        return buffer;
      })
      .catch(error => {
        this.bufferPromises.delete(name);
        throw error;
      });

    this.bufferPromises.set(name, promise);
    return promise;
  }

  private decodeAudioData(ctx: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
    return new Promise<AudioBuffer>((resolve, reject) => {
      const result = ctx.decodeAudioData(data, resolve, reject);
      if (result && typeof (result as unknown as Promise<AudioBuffer>).then === 'function') {
        (result as unknown as Promise<AudioBuffer>).then(resolve, reject);
      }
    });
  }

  private fadeAndStop(playback: AmbientPlayback, duration = this.defaultFade): void {
    const ctx = this.getContext();
    const gainParam = playback.gain.gain;
    const fadeLength = Math.max(0.1, duration);
    const now = ctx.currentTime;
    gainParam.cancelScheduledValues(now);
    gainParam.setValueAtTime(gainParam.value, now);
    gainParam.linearRampToValueAtTime(0, now + fadeLength);

    const stopTime = now + fadeLength + 0.05;
    playback.source.stop(stopTime);
    window.setTimeout(() => {
      playback.source.disconnect();
      playback.gain.disconnect();
    }, (fadeLength + 0.1) * 1000);
  }

  private fadeTo(param: AudioParam, target: number, duration: number): void {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const fade = Math.max(0.1, duration);
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(target, now + fade);
  }

  private playFallbackClick(ctx: AudioContext): void {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(420, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    oscillator.connect(gain);
    gain.connect(this.getOutputGain());
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.25);
    oscillator.addEventListener('ended', () => {
      oscillator.disconnect();
      gain.disconnect();
    }, { once: true });
  }

  private clampVolume(value: number): number {
    if (!Number.isFinite(value)) {
      return 0.6;
    }
    return Math.max(0, Math.min(1, value));
  }
}

export const audioManager = AudioManager.getInstance();

audioManager.registerAssets({
  'ambient-river': {
    url: 'src/assets/audio/ambient-river.webm',
    kind: 'ambient',
    volume: 0.55
  },
  'ambient-birds': {
    url: 'src/assets/audio/ambient-birds.webm',
    kind: 'ambient',
    volume: 0.45
  },
  'ambient-fireplace': {
    url: 'src/assets/audio/ambient-fireplace.webm',
    kind: 'ambient',
    volume: 0.4
  },
  feed: {
    url: 'src/assets/audio/feed.webm',
    kind: 'sfx',
    volume: 0.7
  },
  splash: {
    url: 'src/assets/audio/splash.webm',
    kind: 'sfx',
    volume: 0.8
  },
  happy: {
    url: 'src/assets/audio/happy.webm',
    kind: 'sfx',
    volume: 0.65
  }
});

export function resumeAudioContext(): Promise<void> {
  return audioManager.resume();
}
