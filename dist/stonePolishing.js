import { getGameStateInstance } from './bootstrap.js';
const DEFAULT_OPTIONS = {
    width: 320,
    height: 320,
    brushRadius: 28,
    dirtColor: 'rgba(139, 110, 64, 0.85)',
    completionThreshold: 0.9,
    happinessReward: 5
};
const SOUND_THROTTLE_MS = 120;
const SHINE_DURATION_MS = 2400;
export class StonePolishingActivity {
    constructor(container, options) {
        this.context = null;
        this.baseImage = null;
        this.ready = false;
        this.completed = false;
        this.lastSoundAt = 0;
        this.activePointers = new Map();
        this.handlePointerDown = (event) => {
            if (!this.ready || this.completed) {
                return;
            }
            this.canvas.setPointerCapture(event.pointerId);
            const point = this.resolvePoint(event);
            this.activePointers.set(event.pointerId, point);
            this.eraseAt(point.x, point.y);
            this.maybePlayScrubSound();
            event.preventDefault();
        };
        this.handlePointerMove = (event) => {
            if (!this.ready || this.completed) {
                return;
            }
            if (!this.activePointers.has(event.pointerId)) {
                return;
            }
            const point = this.resolvePoint(event);
            this.activePointers.set(event.pointerId, point);
            this.eraseAt(point.x, point.y);
            this.maybePlayScrubSound();
            event.preventDefault();
        };
        this.handlePointerUpOrCancel = (event) => {
            if (this.activePointers.has(event.pointerId)) {
                this.activePointers.delete(event.pointerId);
                this.canvas.releasePointerCapture(event.pointerId);
                void this.evaluateProgress();
            }
        };
        this.container = container;
        this.options = { ...DEFAULT_OPTIONS, ...options };
        this.root = document.createElement('div');
        this.root.className = 'stone-polishing';
        const background = document.createElement('div');
        background.className = 'stone-polishing__image-wrapper';
        const img = document.createElement('img');
        img.className = 'stone-polishing__image';
        img.alt = 'Sasso levigato';
        background.appendChild(img);
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'stone-polishing__canvas';
        this.shine = document.createElement('div');
        this.shine.className = 'stone-polishing__shine';
        this.root.appendChild(background);
        this.root.appendChild(this.canvas);
        this.root.appendChild(this.shine);
        this.container.appendChild(this.root);
        void this.initialise(img);
    }
    destroy() {
        this.detachEvents();
        this.activePointers.clear();
        if (this.root.parentElement === this.container) {
            this.container.removeChild(this.root);
        }
    }
    async reset() {
        this.completed = false;
        this.root.classList.remove('stone-polishing--complete');
        this.shine.classList.remove('stone-polishing__shine--active');
        await this.prepareCanvas();
    }
    async initialise(targetImage) {
        try {
            await this.loadBaseImage(targetImage);
            await this.prepareCanvas();
            this.attachEvents();
            this.ready = true;
        }
        catch (error) {
            console.error('[StonePolishing] Impossibile inizializzare l\'attività', error);
        }
    }
    async loadBaseImage(targetImage) {
        const src = this.options.baseImage;
        if (!src) {
            throw new Error('Nessuna immagine base specificata per lo Stone Polishing.');
        }
        const image = new Image();
        image.decoding = 'async';
        image.src = src;
        await new Promise((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error(`Impossibile caricare l\'immagine ${src}`));
        });
        const width = this.options.width ?? (image.naturalWidth || DEFAULT_OPTIONS.width);
        const height = this.options.height ?? (image.naturalHeight || DEFAULT_OPTIONS.height);
        targetImage.src = src;
        targetImage.width = width;
        targetImage.height = height;
        this.canvas.width = width;
        this.canvas.height = height;
        this.baseImage = image;
    }
    async prepareCanvas() {
        const ctx = this.canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Impossibile ottenere il contesto 2d del canvas.');
        }
        this.context = ctx;
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.fillStyle = this.options.dirtColor ?? DEFAULT_OPTIONS.dirtColor;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.globalCompositeOperation = 'source-over';
    }
    attachEvents() {
        this.canvas.addEventListener('pointerdown', this.handlePointerDown);
        this.canvas.addEventListener('pointermove', this.handlePointerMove);
        this.canvas.addEventListener('pointerup', this.handlePointerUpOrCancel);
        this.canvas.addEventListener('pointercancel', this.handlePointerUpOrCancel);
        this.canvas.addEventListener('pointerleave', this.handlePointerUpOrCancel);
    }
    detachEvents() {
        this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
        this.canvas.removeEventListener('pointermove', this.handlePointerMove);
        this.canvas.removeEventListener('pointerup', this.handlePointerUpOrCancel);
        this.canvas.removeEventListener('pointercancel', this.handlePointerUpOrCancel);
        this.canvas.removeEventListener('pointerleave', this.handlePointerUpOrCancel);
    }
    resolvePoint(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * this.canvas.width;
        const y = ((event.clientY - rect.top) / rect.height) * this.canvas.height;
        return { id: event.pointerId, x, y };
    }
    eraseAt(x, y) {
        if (!this.context) {
            return;
        }
        const radius = this.options.brushRadius ?? DEFAULT_OPTIONS.brushRadius;
        this.context.save();
        this.context.globalCompositeOperation = 'destination-out';
        this.context.beginPath();
        this.context.arc(x, y, radius, 0, Math.PI * 2);
        this.context.fill();
        this.context.restore();
    }
    async evaluateProgress() {
        if (!this.context || this.completed) {
            return;
        }
        const imageData = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const alphaData = imageData.data;
        let remainingAlpha = 0;
        for (let i = 3; i < alphaData.length; i += 4) {
            remainingAlpha += alphaData[i];
        }
        const totalPixels = this.canvas.width * this.canvas.height;
        const remainingRatio = remainingAlpha / (255 * totalPixels);
        const cleanedRatio = 1 - remainingRatio;
        if (cleanedRatio >= (this.options.completionThreshold ?? DEFAULT_OPTIONS.completionThreshold)) {
            this.onCompleted();
        }
    }
    onCompleted() {
        if (this.completed) {
            return;
        }
        this.completed = true;
        this.root.classList.add('stone-polishing--complete');
        this.shine.classList.add('stone-polishing__shine--active');
        window.setTimeout(() => {
            this.shine.classList.remove('stone-polishing__shine--active');
        }, SHINE_DURATION_MS);
        this.rewardPlayer();
        this.options.onComplete?.();
    }
    rewardPlayer() {
        const manager = getGameStateInstance();
        const stats = manager.getStats();
        const reward = this.options.happinessReward ?? DEFAULT_OPTIONS.happinessReward;
        const nextHappiness = Math.min(100, stats.happiness + reward);
        manager.setStats({ happiness: nextHappiness });
    }
    maybePlayScrubSound() {
        const now = performance.now();
        if (now - this.lastSoundAt < SOUND_THROTTLE_MS) {
            return;
        }
        this.lastSoundAt = now;
        this.options.playScrubSound?.();
    }
}
export function mountStonePolishingActivity(container, options) {
    return new StonePolishingActivity(container, options);
}
