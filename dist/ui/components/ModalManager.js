import { $, toggleOverlayVisibility } from '../utils';
import { recordEvent } from '../../analytics';
export class ModalManager {
    constructor(inventoryView) {
        this.inventoryView = inventoryView;
        this.giftModalOpen = false;
        this.denJournalOpen = false;
        this.settingsModalOpen = false;
        this.initGiftModal();
        this.initSettingsOverlay();
        this.initDenJournal();
    }
    showGiftModal(item, inventory) {
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
            const closeBtn = $('giftCloseBtn');
            closeBtn?.focus();
        }, 0);
    }
    setSettingsOverlayVisibility(visible) {
        const overlay = $('settingsOverlay');
        const settingsBtn = $('settingsBtn');
        const closeBtn = $('settingsCloseBtn');
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
    setDenJournalVisibility(visible) {
        const journal = $('denJournal');
        const toggleBtn = $('statsToggleBtn');
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
    updateOverlays(state) {
        const tutorialOverlay = $('tutorialOverlay');
        const nameOverlay = $('nameOverlay');
        const shouldShowNamePrompt = !state.petNameConfirmed;
        const shouldShowTutorial = !state.tutorialSeen && state.petNameConfirmed;
        toggleOverlayVisibility(nameOverlay, shouldShowNamePrompt);
        toggleOverlayVisibility(tutorialOverlay, shouldShowTutorial);
        this.recomputeOverlayState();
    }
    setGiftModalVisibility(show) {
        const overlay = $('giftOverlay');
        if (!overlay) {
            return;
        }
        this.giftModalOpen = show;
        toggleOverlayVisibility(overlay, show);
        overlay.classList.toggle('active', show);
        document.body.classList.toggle('gift-modal-open', show);
    }
    hideGiftModal() {
        this.setGiftModalVisibility(false);
        const trigger = $('giftCloseBtn');
        trigger?.blur();
    }
    recomputeOverlayState() {
        const nameOverlay = $('nameOverlay');
        const tutorialOverlay = $('tutorialOverlay');
        const isNameOpen = Boolean(nameOverlay && !nameOverlay.classList.contains('hidden'));
        const isTutorialOpen = Boolean(tutorialOverlay && !tutorialOverlay.classList.contains('hidden'));
        const anyOverlayOpen = this.settingsModalOpen || isNameOpen || isTutorialOpen;
        document.body.classList.toggle('overlay-active', anyOverlayOpen);
    }
    initGiftModal() {
        const closeBtn = $('giftCloseBtn');
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
    initSettingsOverlay() {
        const settingsBtn = $('settingsBtn');
        const closeBtn = $('settingsCloseBtn');
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
    initDenJournal() {
        const toggleBtn = $('statsToggleBtn');
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
