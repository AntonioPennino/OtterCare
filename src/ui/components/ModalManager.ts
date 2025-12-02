import { $, toggleOverlayVisibility } from '../utils.js';
import { InventoryView } from './InventoryView.js';
import { recordEvent } from '../../core/analytics.js';
import { GameState } from '../../types.js';

export class ModalManager {
    private giftModalOpen = false;
    private denJournalOpen = false;
    private settingsModalOpen = false;

    constructor(private inventoryView: InventoryView) {
        this.initGiftModal();
        this.initSettingsOverlay();
        this.initDenJournal();
    }

    public showGiftModal(item: string, inventory: string[]): void {
        const title = $('giftTitle');
        if (title) {
            title.textContent = 'La tua lontra ha un dono!';
        }
        const message = $('giftMessage');
        if (message) {
            message.textContent = `Ha trovato ${item}.`;
        }
        this.inventoryView.render(inventory);
        this.setGiftModalVisibility(true);
        window.setTimeout(() => {
            const closeBtn = $('giftCloseBtn') as HTMLButtonElement | null;
            closeBtn?.focus();
        }, 0);
    }

    public setSettingsOverlayVisibility(visible: boolean): void {
        const overlay = $('settingsOverlay');
        const settingsBtn = $('settingsBtn') as HTMLButtonElement | null;
        const closeBtn = $('settingsCloseBtn') as HTMLButtonElement | null;
        this.settingsModalOpen = visible;
        toggleOverlayVisibility(overlay, visible);
        overlay?.classList.toggle('active', visible);
        if (overlay) {
            overlay.style.display = visible ? 'flex' : 'none';
        }
        if (settingsBtn) {
            settingsBtn.setAttribute('aria-expanded', String(visible));
        }
        if (visible) {
            window.setTimeout(() => closeBtn?.focus(), 0);
        }
        document.body.classList.toggle('settings-open', visible);
        this.recomputeOverlayState();
    }

    public setDenJournalVisibility(visible: boolean): void {
        const journal = $('denJournal');
        const toggleBtn = $('statsToggleBtn') as HTMLButtonElement | null;
        this.denJournalOpen = visible;
        if (journal) {
            journal.classList.toggle('hidden', !visible);
            journal.setAttribute('aria-hidden', String(!visible));
        }
        if (toggleBtn) {
            toggleBtn.setAttribute('aria-expanded', String(visible));
            toggleBtn.textContent = visible ? 'Nascondi i regali della lontra' : 'Mostra i regali della lontra';
        }
    }

    public updateOverlays(state: GameState): void {
        const tutorialOverlay = $('tutorialOverlay');
        const nameOverlay = $('nameOverlay');
        const shouldShowNamePrompt = !state.petNameConfirmed;
        const shouldShowTutorial = !state.tutorialSeen && state.petNameConfirmed;

        toggleOverlayVisibility(nameOverlay, shouldShowNamePrompt);
        toggleOverlayVisibility(tutorialOverlay, shouldShowTutorial);
        this.recomputeOverlayState();
    }

    private setGiftModalVisibility(show: boolean): void {
        const overlay = $('giftOverlay');
        if (!overlay) {
            return;
        }
        this.giftModalOpen = show;
        toggleOverlayVisibility(overlay, show);
        overlay.classList.toggle('active', show);
        document.body.classList.toggle('gift-modal-open', show);
    }

    private hideGiftModal(): void {
        this.setGiftModalVisibility(false);
        const trigger = $('giftCloseBtn') as HTMLButtonElement | null;
        trigger?.blur();
    }

    private recomputeOverlayState(): void {
        const nameOverlay = $('nameOverlay');
        const tutorialOverlay = $('tutorialOverlay');
        const isNameOpen = Boolean(nameOverlay && !nameOverlay.classList.contains('hidden'));
        const isTutorialOpen = Boolean(tutorialOverlay && !tutorialOverlay.classList.contains('hidden'));
        const anyOverlayOpen = this.settingsModalOpen || isNameOpen || isTutorialOpen;
        document.body.classList.toggle('overlay-active', anyOverlayOpen);
    }

    private initGiftModal(): void {
        const closeBtn = $('giftCloseBtn') as HTMLButtonElement | null;
        const overlay = $('giftOverlay');
        closeBtn?.addEventListener('click', () => this.hideGiftModal());
        overlay?.addEventListener('click', event => {
            if (event.target === overlay) {
                this.hideGiftModal();
            }
        });
        window.addEventListener('keydown', event => {
            if (event.key === 'Escape' && this.giftModalOpen) {
                this.hideGiftModal();
            }
        });
    }

    private initSettingsOverlay(): void {
        const settingsBtn = $('settingsBtn') as HTMLButtonElement | null;
        const closeBtn = $('settingsCloseBtn') as HTMLButtonElement | null;
        const overlay = $('settingsOverlay');

        settingsBtn?.setAttribute('aria-expanded', 'false');

        settingsBtn?.addEventListener('click', () => {
            this.setSettingsOverlayVisibility(true);
        });

        closeBtn?.addEventListener('click', () => {
            this.setSettingsOverlayVisibility(false);
            settingsBtn?.focus();
        });

        overlay?.addEventListener('click', event => {
            if (event.target === overlay) {
                this.setSettingsOverlayVisibility(false);
                settingsBtn?.focus();
            }
        });

        window.addEventListener('keydown', event => {
            if (event.key === 'Escape' && this.settingsModalOpen) {
                this.setSettingsOverlayVisibility(false);
                settingsBtn?.focus();
            }
        });
    }

    private initDenJournal(): void {
        const toggleBtn = $('statsToggleBtn') as HTMLButtonElement | null;
        if (!toggleBtn) {
            return;
        }

        this.setDenJournalVisibility(false);

        toggleBtn.addEventListener('click', () => {
            this.setDenJournalVisibility(!this.denJournalOpen);
            if (this.denJournalOpen) {
                recordEvent('nav:den-journal');
            }
        });

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && this.denJournalOpen) {
                this.setDenJournalVisibility(false);
            }
        });
    }
}
