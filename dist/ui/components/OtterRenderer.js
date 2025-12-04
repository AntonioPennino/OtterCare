import { $ } from '../utils.js';
const OTTER_ASSET_BASE = 'src/assets/otter';
const OUTFIT_VARIANTS = [
    { key: 'hatScarfSunglasses', suffix: '-hatScarfSunglasses', required: ['hat', 'scarf', 'sunglasses'] },
    { key: 'hatScarf', suffix: '-hatScarf', required: ['hat', 'scarf'] },
    { key: 'hat', suffix: '-hat', required: ['hat'] }
];
export class OtterRenderer {
    constructor() {
        this.otterElements = new Set();
        this.otterRenderCache = new WeakMap();
        this.otterAnimationTimers = new WeakMap();
        this.latestMood = 'neutral';
        this.latestAccessories = { hat: false, scarf: false, sunglasses: false };
    }
    sync(mood, accessories, force = false) {
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
    triggerAnimation(animation, accessories, onComplete) {
        this.collectOtterElements();
        let completionCalled = false;
        const handleCompletion = () => {
            if (!completionCalled) {
                completionCalled = true;
                onComplete();
            }
        };
        this.otterElements.forEach(target => {
            const previousTimer = this.otterAnimationTimers.get(target);
            if (typeof previousTimer === 'number') {
                window.clearTimeout(previousTimer);
                this.otterAnimationTimers.delete(target);
            }
            target.classList.remove('hop', 'eating', 'bathing', 'rest');
            target.classList.remove('happy', 'sad', 'sleepy');
            target.dataset.animating = animation;
            const applyAction = (assetBase, classes, duration) => {
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
                    // Only call completion once, after the first animation finishes (they are synced)
                    handleCompletion();
                }, duration);
                this.otterAnimationTimers.set(target, timerId);
            };
            if (animation === 'feed') {
                applyAction('otter_eat', ['hop', 'eating'], 1500);
            }
            else if (animation === 'bathe') {
                applyAction('otter_bath', ['bathing'], 1600);
            }
            else if (animation === 'sleep') {
                applyAction('otter_sleepy', ['rest'], 4000);
            }
        });
    }
    collectOtterElements() {
        this.otterElements.clear();
        document.querySelectorAll('.otter-img').forEach(img => {
            this.otterElements.add(img);
        });
    }
    getActiveOtterElement() {
        const activeScene = document.querySelector('.scene.active');
        if (activeScene) {
            const activeOtter = activeScene.querySelector('.otter-img');
            if (activeOtter) {
                return activeOtter;
            }
        }
        return $('otterImage');
    }
    applyExpressionToElement(element, mood, accessories, force = false) {
        const { src, outfit } = this.buildOtterImage(`otter_${mood}`, accessories);
        const cached = this.otterRenderCache.get(element);
        if (!force && cached && cached.mood === mood && cached.outfit === outfit) {
            return;
        }
        this.otterRenderCache.set(element, { mood, outfit });
        element.src = src;
        this.applyMoodClasses(element, mood);
    }
    applyMoodClasses(element, mood) {
        element.classList.remove('happy', 'sad', 'sleepy');
        if (mood !== 'neutral') {
            element.classList.add(mood);
        }
    }
    buildOtterImage(baseName, accessories) {
        const outfit = this.resolveOutfit(accessories);
        return {
            src: `${OTTER_ASSET_BASE}/${baseName}${outfit.suffix}.png`,
            outfit: outfit.key
        };
    }
    resolveOutfit(accessories) {
        for (const variant of OUTFIT_VARIANTS) {
            if (variant.required.every(name => accessories[name])) {
                return { key: variant.key, suffix: variant.suffix };
            }
        }
        return { key: 'base', suffix: '' };
    }
}
