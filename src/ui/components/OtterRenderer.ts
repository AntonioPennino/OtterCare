import { AccessoryState, Mood, OutfitKey } from '../../types';
import { $ } from '../utils';
import { audioManager, resumeAudioContext } from '../../audio';

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

    public triggerAnimation(animation: 'feed' | 'bathe' | 'sleep', accessories: AccessoryState, onComplete: () => void): void {
        const target = this.getActiveOtterElement();
        if (!target) {
            return;
        }

        const previousTimer = this.otterAnimationTimers.get(target);
        if (typeof previousTimer === 'number') {
            window.clearTimeout(previousTimer);
            this.otterAnimationTimers.delete(target);
        }

        target.classList.remove('hop', 'eating', 'bathing', 'rest');
        target.classList.remove('happy', 'sad', 'sleepy');
        target.dataset.animating = animation;

        const applyAction = (assetBase: string, classes: string[], duration: number): void => {
            const { src } = this.buildOtterImage(assetBase, accessories);
            this.otterRenderCache.delete(target);
            target.src = src;
            if (classes.length) {
                target.classList.add(...classes);
            }
            const timerId = window.setTimeout(() => {
                if (classes.length) {
                    target.classList.remove(...classes);
                }
                delete target.dataset.animating;
                this.otterAnimationTimers.delete(target);
                onComplete();
            }, duration);
            this.otterAnimationTimers.set(target, timerId);
        };

        if (animation === 'feed') {
            applyAction('otter_eat', ['hop', 'eating'], 1500);
        } else if (animation === 'bathe') {
            applyAction('otter_bath', ['bathing'], 1600);
        } else if (animation === 'sleep') {
            applyAction('otter_sleepy', ['rest'], 4000);
        }
    }

    private collectOtterElements(): void {
        this.otterElements.clear();
        document.querySelectorAll<HTMLImageElement>('.otter-img').forEach(img => {
            this.otterElements.add(img);
        });
    }

    private getActiveOtterElement(): HTMLImageElement | null {
        const activeScene = document.querySelector<HTMLElement>('.scene.active');
        if (activeScene) {
            const activeOtter = activeScene.querySelector<HTMLImageElement>('.otter-img');
            if (activeOtter) {
                return activeOtter;
            }
        }
        return $('otterImage') as HTMLImageElement | null;
    }

    private applyExpressionToElement(
        element: HTMLImageElement,
        mood: Mood,
        accessories: AccessoryState,
        force = false
    ): void {
        const { src, outfit } = this.buildOtterImage(`otter_${mood}`, accessories);
        const cached = this.otterRenderCache.get(element);
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
