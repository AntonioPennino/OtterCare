export function $(id) {
    return document.getElementById(id);
}
export function toggleOverlayVisibility(element, show) {
    if (!element) {
        return;
    }
    element.classList.toggle('hidden', !show);
    element.setAttribute('aria-hidden', String(!show));
}
