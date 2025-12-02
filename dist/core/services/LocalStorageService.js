export class LocalStorageService {
    getItem(key) {
        if (typeof window === 'undefined')
            return null;
        try {
            return window.localStorage.getItem(key);
        }
        catch {
            return null;
        }
    }
    setItem(key, value) {
        if (typeof window === 'undefined')
            return;
        try {
            window.localStorage.setItem(key, value);
        }
        catch (e) {
            console.warn('Failed to save to localStorage', e);
        }
    }
    removeItem(key) {
        if (typeof window === 'undefined')
            return;
        try {
            window.localStorage.removeItem(key);
        }
        catch (e) {
            console.warn('Failed to remove from localStorage', e);
        }
    }
}
