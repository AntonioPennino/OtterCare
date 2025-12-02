import { $ } from '../utils';
import { notificationsSupported } from '../../notifications';
const STAT_ICONS = {
    hunger: '🍗',
    happy: '🎉',
    clean: '🧼',
    energy: '⚡'
};
export class NotificationUI {
    constructor() {
        this.alertTimeoutId = null;
    }
    refresh(state) {
        const statusEl = $('notificationStatus');
        const enableBtn = $('notificationEnableBtn');
        const disableBtn = $('notificationDisableBtn');
        const warningEl = $('notificationUnsupported');
        const granted = state.notifications.permission === 'granted';
        const supported = notificationsSupported();
        if (warningEl) {
            warningEl.classList.toggle('hidden', supported);
        }
        if (!supported) {
            if (statusEl) {
                statusEl.textContent = 'Il tuo dispositivo non supporta le notifiche push.';
            }
            enableBtn?.setAttribute('disabled', 'true');
            disableBtn?.setAttribute('disabled', 'true');
            const details = $('notificationNextDetails');
            if (details) {
                details.textContent = '';
            }
            return;
        }
        if (enableBtn) {
            enableBtn.disabled = state.notifications.enabled && granted;
        }
        if (disableBtn) {
            disableBtn.disabled = !state.notifications.enabled;
        }
        if (statusEl) {
            if (!granted) {
                statusEl.textContent = 'Promemoria disattivati. Concedi il permesso per ricevere notifiche.';
            }
            else if (!state.notifications.enabled) {
                statusEl.textContent = 'Permesso attivo, premi "Attiva promemoria" per ricevere segnali di promemoria.';
            }
            else {
                statusEl.textContent = 'Promemoria attivi. Ti avviseremo quando la lontra avrà bisogno di attenzioni.';
            }
        }
        const nextList = $('notificationNextDetails');
        if (nextList) {
            const items = [];
            ['hunger', 'happy', 'clean', 'energy'].forEach(key => {
                const last = state.notifications.lastSent[key];
                if (typeof last === 'number') {
                    items.push(`${STAT_ICONS[key]} ${this.formatDateTime(new Date(last).toISOString())}`);
                }
            });
            nextList.textContent = items.length ? `Ultimi promemoria: ${items.join(' · ')}` : 'Nessun promemoria inviato finora.';
        }
    }
    showAlert(message, variant = 'warning') {
        const banner = $('alertBanner');
        if (!banner) {
            return;
        }
        banner.textContent = message;
        banner.dataset.variant = variant;
        banner.classList.remove('hidden');
        if (this.alertTimeoutId !== null) {
            window.clearTimeout(this.alertTimeoutId);
        }
        this.alertTimeoutId = window.setTimeout(() => {
            banner.classList.add('hidden');
        }, 5000);
    }
    formatDateTime(iso) {
        if (!iso) {
            return 'Mai sincronizzato';
        }
        try {
            return new Date(iso).toLocaleString();
        }
        catch {
            return iso;
        }
    }
}
