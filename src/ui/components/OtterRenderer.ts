import { AccessoryState, Mood, OutfitKey } from '../../core/types.js';
import { $ } from '../utils.js';
import { audioManager, resumeAudioContext } from '../../core/audio.js';

const OTTER_ASSET_BASE = 'src/assets/otter';

const OUTFIT_VARIANTS: Array<{ key: OutfitKey; suffix: string; required: Array<keyof AccessoryState> }> = [
    { key: 'hatScarfSunglasses', suffix: '-hatScarfSunglasses', required: ['hat', 'scarf', 'sunglasses'] },
    { key: 'hatScarf', suffix: '-hatScarf', required: ['hat', 'scarf'] },
    { key: 'hat', suffix: '-hat', required: ['hat'] }
];

export class OtterRenderer {
    private otterElements = new Set<HTMLImageElement>();
    private otterRenderCache = new WeakMap<HTMLImageElement, { mood: Mood; outfit: OutfitKey }>();
    private otterAnimationTimers = new WeakMap<HTMLImageElement, number>();
    private latestMood: Mood = 'neutral';
    private latestAccessories: AccessoryState = { hat: false, scarf: false, sunglasses: false };
    private temporaryAccessories: AccessoryState | null = null;

    public setTemporaryOutfit(accessories: AccessoryState | null): void {
        this.temporaryAccessories = accessories;
        // Trigger a re-render with current state, forcing the temporary outfit to apply
        this.sync(this.latestMood, this.latestAccessories, true);
    }

    public sync(mood: Mood, accessories: AccessoryState, force = false): void {
        this.latestMood = mood;
        this.latestAccessories = accessories;
        this.collectOtterElements();
        this.otterElements.forEach(element => {
            if (!force && element.dataset.animating) {
                return;
            }
            this.applyExpressionToElement(element, mood, accessories, force);
        });
    }

    // ... (rest of methods)

    private applyExpressionToElement(
        element: HTMLImageElement,
        mood: Mood,
        accessories: AccessoryState,
        force = false
    ): void {
        // Overlay temporary accessories if active
        const effectiveAccessories = this.temporaryAccessories
            ? { ...accessories, ...this.temporaryAccessories }
            : accessories;

        const { src, outfit } = this.buildOtterImage(`otter_${mood}`, effectiveAccessories);
        const cached = this.otterRenderCache.get(element);

        // If effective outfit changed, ignore cache check for outfit key comparison if needed, 
        // but 'outfit' key is derived from effective, so it should be fine.
        if (!force && cached && cached.mood === mood && cached.outfit === outfit) {
            return;
        }
        this.otterRenderCache.set(element, { mood, outfit });
        element.src = src;
        this.applyMoodClasses(element, mood);
    }

    private applyMoodClasses(element: HTMLImageElement, mood: Mood): void {
        element.classList.remove('happy', 'sad', 'sleepy');
        if (mood !== 'neutral') {
            element.classList.add(mood);
        }
    }

    private buildOtterImage(baseName: string, accessories: AccessoryState): { src: string; outfit: OutfitKey } {
        const outfit = this.resolveOutfit(accessories);
        return {
            src: `${OTTER_ASSET_BASE}/${baseName}${outfit.suffix}.png`,
            outfit: outfit.key
        };
    }

    private resolveOutfit(accessories: AccessoryState): { key: OutfitKey; suffix: string } {
        for (const variant of OUTFIT_VARIANTS) {
            if (variant.required.every(name => accessories[name])) {
                return { key: variant.key, suffix: variant.suffix };
            }
        }
        return { key: 'base', suffix: '' };
    }
}
