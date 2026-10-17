import { useEffect, useRef, useState } from "react";
import { bindPinchZoom, clampImageScale, type ZoomPoint } from "./pinch-zoom";
import { Minus, Plus, X, Maximize } from "lucide-react";

export type PreviewImage = { url: string; name: string };
export function ImagePreview({ image, onClose }: { image: PreviewImage; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const imageElement = useRef<HTMLImageElement>(null);
  const scaleOutput = useRef<HTMLOutputElement>(null);
  const scale = useRef(1);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    closeButton.current?.focus();
    return () => { previous?.focus(); };
  }, []);
  // Update only the preview image during a gesture, avoiding a React render per wheel event.
  const setScale = (value: number, point?: ZoomPoint) => {
    const box = viewport.current, img = imageElement.current;
    if (!box || !img || !img.naturalWidth) return;
    const next = clampImageScale(value);
    const before = img.getBoundingClientRect();
    const bounds = box.getBoundingClientRect();
    const anchor = point || {x: bounds.left + box.clientWidth / 2, y: bounds.top + box.clientHeight / 2};
    const imageX = Math.max(0, Math.min(before.width, anchor.x - before.left));
    const imageY = Math.max(0, Math.min(before.height, anchor.y - before.top));
    const ratio = next / scale.current;
    img.style.width = `${img.naturalWidth * next}px`;
    img.style.height = `${img.naturalHeight * next}px`;
    scale.current = next;
    if (scaleOutput.current) scaleOutput.current.textContent = `${Math.round(next * 100)}%`;
    const after = img.getBoundingClientRect();
    box.scrollLeft += after.left + imageX * ratio - anchor.x;
    box.scrollTop += after.top + imageY * ratio - anchor.y;
  };
  useEffect(() => {
    const box = viewport.current;
    if (box) return bindPinchZoom(box, (factor, point) => setScale(scale.current * factor, point));
  }, []);
  const fit = (width = dimensions.width, height = dimensions.height) => {
    const box = viewport.current;
    if (box && width && height) setScale(Math.min(1, (box.clientWidth - 48) / width, (box.clientHeight - 48) / height));
  };
  const zoom = (factor: number) => setScale(scale.current * factor);
  return <dialog ref={dialog} className="image-viewer" aria-label={`图片预览：${image.name}`} onCancel={e => {e.preventDefault(); onClose();}}>
    <div className="image-viewer-toolbar">
      <span>{image.name}</span>
      <div>
        <button onClick={() => zoom(1 / 1.25)} aria-label="缩小" disabled={!dimensions.width}><Minus size={18} /></button>
        <output ref={scaleOutput} aria-label="图片缩放比例">100%</output>
        <button onClick={() => zoom(1.25)} aria-label="放大" disabled={!dimensions.width}><Plus size={18} /></button>
        <button onClick={() => setScale(1)} disabled={!dimensions.width}>原始大小</button>
        <button onClick={() => fit()} disabled={!dimensions.width}><Maximize size={16} />适应窗口</button>
        <button ref={closeButton} onClick={onClose} aria-label="关闭图片预览"><X size={22} /></button>
      </div>
    </div>
    <div ref={viewport} className="image-viewer-viewport" onClick={e => {if (e.target === e.currentTarget) onClose();}}>
      {failed ? <p>图片加载失败，请关闭后重试。</p> : <img ref={imageElement} src={image.url} alt={image.name} draggable={false} onError={() => setFailed(true)} onLoad={e => {
        const {naturalWidth: width, naturalHeight: height} = e.currentTarget;
        setDimensions({width, height}); fit(width, height);
      }} />}
    </div>
    <div className="image-viewer-hint">双指捏合缩放 · 双指滑动查看细节 · Esc 关闭</div>
  </dialog>;
}
