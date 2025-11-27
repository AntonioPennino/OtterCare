export function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

export function toggleOverlayVisibility(element: HTMLElement | null, show: boolean): void {
  if (!element) {
    return;
  }
  element.classList.toggle('hidden', !show);
  element.setAttribute('aria-hidden', String(!show));
}
