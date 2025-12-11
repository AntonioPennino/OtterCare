
import { $ } from '../utils.js';
import { getGameServiceInstance, getGameStateInstance } from '../../bootstrap.js';
import { getAdService } from '../../core/services/AdService.js';
import { NotificationUI } from './NotificationUI.js';

export class Seagull {
    private element: HTMLElement;
    private container: HTMLElement;
    private isFlying: boolean = false;
    private timer: number | null = null;
    private notificationUI: NotificationUI;

    constructor(notificationUI: NotificationUI) {
        this.notificationUI = notificationUI;
        this.container = document.body;

        // Create the element
        this.element = document.createElement('div');
        this.element.className = 'seagull hidden';
        this.element.textContent = '🐦'; // Placeholder emoji
        this.container.appendChild(this.element);

        this.element.addEventListener('click', () => this.handleClick());

        // Start the spawn loop
        this.scheduleNextSpawn();
    }

    private scheduleNextSpawn(): void {
        // Random time between 5 and 15 minutes
        const delay = (Math.random() * (15 - 5) + 5) * 60 * 1000;
        // const delay = 60 * 1000; // 1 min for testing

        setTimeout(() => {
            this.spawn();
        }, delay);
    }

    private spawn(): void {
        if (this.isFlying) return;

        // Position logic (start from left, fly to right)
        this.isFlying = true;
        this.element.classList.remove('hidden');
        this.element.style.top = '100px';
        this.element.style.left = '-50px';

        // Add fly animation class
        this.element.classList.add('flying');

        // Stop after animation ends (e.g., 20s)
        setTimeout(() => {
            if (this.isFlying) {
                this.despawn();
                this.scheduleNextSpawn();
            }
        }, 21000);
    }

    private despawn(): void {
        this.isFlying = false;
        this.element.classList.remove('flying');
        this.element.classList.add('hidden');
    }

    private async handleClick(): Promise<void> {
        if (!this.isFlying) return;

        // Pause flight (visually)
        this.element.style.animationPlayState = 'paused';

        const confirm = window.confirm('Il gabbiano ha portato un dono luccicante! Vuoi vederlo? (Guarda breve video)');

        if (confirm) {
            const adService = getAdService();
            const result = await adService.showRewardVideo();

            if (result.rewarded) {
                // Grant Reward
                // 80% Sea Glass (50-100), 20% Item (if we had logic, for now just glass)
                const glass = Math.floor(Math.random() * 50) + 50;
                getGameServiceInstance().addSeaGlass(glass);
                this.notificationUI.showAlert(`+${glass} Sea Glass dal Gabbiano!`, 'success');
            } else {
                this.notificationUI.showAlert('Nessuna ricompensa ottenuta.', 'info');
            }
        }

        // Always fly away after interaction
        this.element.style.animationPlayState = 'running';
        this.despawn();
        this.scheduleNextSpawn();
    }
}
