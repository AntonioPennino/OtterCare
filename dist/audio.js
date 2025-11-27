/**
 * AudioManager centralizza la riproduzione dei suoni e delle tracce ambient.
 * Gestisce caricamento asincrono, loop con cross-fade e SFX con variazioni dinamiche.
 */
export class AudioManager {
    constructor() {
        this.context = null;
        this.outputGain = null;
        this.manifest = new Map();
        this.bufferCache = new Map();
        this.bufferPromises = new Map();
        this.currentAmbient = null;
        this.defaultFade = 1.6;
    }
    static getInstance() {
        if (!this.instance) {
            this.instance = new AudioManager();
        }
        return this.instance;
    }
    registerAsset(name, definition) {
        this.manifest.set(name, definition);
    }
    registerAssets(definitions) {
        Object.entries(definitions).forEach(([name, def]) => {
            this.registerAsset(name, def);
        });
    }
    hasAsset(name) {
        return this.manifest.has(name);
    }
    async preload(...names) {
        await Promise.all(names.map(name => this.safeLoadBuffer(name)));
    }
    async resume() {
        try {
            const ctx = this.getContext();
            if (ctx.state === 'suspended') {
                await ctx.resume();
            }
        }
        catch (error) {
            console.warn('Impossibile riprendere AudioContext', error);
        }
    }
    suspend() {
        if (!this.context) {
            return;
        }
        if (this.context.state === 'running') {
            void this.context.suspend().catch(error => {
                console.warn('Impossibile sospendere AudioContext', error);
            });
        }
    }
    async playAmbient(name, volume = 0.5) {
        if (!this.manifest.has(name)) {
            console.warn(`Traccia ambient "${name}" non registrata`);
            return;
        }
        const existing = this.currentAmbient;
        if (existing && existing.name === name) {
            this.fadeTo(existing.gain.gain, this.clampVolume(volume), this.defaultFade);
            return;
        }
        let buffer;
        try {
            buffer = await this.safeLoadBuffer(name);
        }
        catch (error) {
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
    async stopAmbient(fadeSeconds = this.defaultFade) {
        const ambient = this.currentAmbient;
        if (!ambient) {
            return;
        }
        this.currentAmbient = null;
        this.fadeAndStop(ambient, fadeSeconds);
    }
    async playSFX(name, variance = false) {
        if (!this.manifest.has(name)) {
            await this.resume();
            this.playFallbackClick(this.getContext());
            return;
        }
        let buffer = null;
        try {
            buffer = await this.safeLoadBuffer(name);
        }
        catch (error) {
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
    getContext() {
        if (!this.context) {
            const AnyCtx = window.AudioContext
                || window.webkitAudioContext;
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
    getOutputGain() {
        const ctx = this.getContext();
        if (!this.outputGain) {
            this.outputGain = ctx.createGain();
            this.outputGain.gain.setValueAtTime(1, ctx.currentTime);
            this.outputGain.connect(ctx.destination);
        }
        return this.outputGain;
    }
    async safeLoadBuffer(name) {
        if (this.bufferCache.has(name)) {
            return this.bufferCache.get(name);
        }
        if (this.bufferPromises.has(name)) {
            return this.bufferPromises.get(name);
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
    decodeAudioData(ctx, data) {
        return new Promise((resolve, reject) => {
            const result = ctx.decodeAudioData(data, resolve, reject);
            if (result && typeof result.then === 'function') {
                result.then(resolve, reject);
            }
        });
    }
    fadeAndStop(playback, duration = this.defaultFade) {
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
    fadeTo(param, target, duration) {
        const ctx = this.getContext();
        const now = ctx.currentTime;
        const fade = Math.max(0.1, duration);
        param.cancelScheduledValues(now);
        param.setValueAtTime(param.value, now);
        param.linearRampToValueAtTime(target, now + fade);
    }
    playFallbackClick(ctx) {
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
    clampVolume(value) {
        if (!Number.isFinite(value)) {
            return 0.6;
        }
        return Math.max(0, Math.min(1, value));
    }
}
AudioManager.instance = null;
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
export function resumeAudioContext() {
    return audioManager.resume();
}
