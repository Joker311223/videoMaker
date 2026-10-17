export type ZoomPoint = { x: number; y: number };
export function clampImageScale(value: number) {
  return Math.min(5, Math.max(0.05, value));
}
/** Chromium sends touchpad pinch as ctrl+wheel; keep ordinary two-finger scrolling native. */
export function bindPinchZoom(element: HTMLElement, zoom: (factor: number, point: ZoomPoint) => void) {
  const handleWheel = (event: WheelEvent) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
    const delta = Math.min(100, Math.max(-100, event.deltaY * unit));
    zoom(Math.exp(-delta * 0.01), {x: event.clientX, y: event.clientY});
  };
  element.addEventListener('wheel', handleWheel, {passive: false});
  return () => element.removeEventListener('wheel', handleWheel);
}
