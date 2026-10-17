import { useEffect, useRef, useState } from "react";
import { Minus, Plus, X, Maximize } from "lucide-react";

export type PreviewImage = { url: string; name: string };
export function ImagePreview({ image, onClose }: { image: PreviewImage; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    closeButton.current?.focus();
    return () => { previous?.focus(); };
  }, []);
  const fit = (width = dimensions.width, height = dimensions.height) => {
    const box = viewport.current;
    if (box && width && height) setScale(Math.min(1, (box.clientWidth - 48) / width, (box.clientHeight - 48) / height));
  };
  const zoom = (factor: number) => setScale(old => Math.min(5, Math.max(0.05, old * factor)));
  return <dialog ref={dialog} className="image-viewer" aria-label={`图片预览：${image.name}`} onCancel={e => {e.preventDefault(); onClose();}}>
    <div className="image-viewer-toolbar">
      <span>{image.name}</span>
      <div>
        <button onClick={() => zoom(1 / 1.25)} aria-label="缩小" disabled={!dimensions.width}><Minus size={18} /></button>
        <output aria-live="polite">{Math.round(scale * 100)}%</output>
        <button onClick={() => zoom(1.25)} aria-label="放大" disabled={!dimensions.width}><Plus size={18} /></button>
        <button onClick={() => setScale(1)} disabled={!dimensions.width}>原始大小</button>
        <button onClick={() => fit()} disabled={!dimensions.width}><Maximize size={16} />适应窗口</button>
        <button ref={closeButton} onClick={onClose} aria-label="关闭图片预览"><X size={22} /></button>
      </div>
    </div>
    <div ref={viewport} className="image-viewer-viewport" onClick={e => {if (e.target === e.currentTarget) onClose();}}>
      {failed ? <p>图片加载失败，请关闭后重试。</p> : <img src={image.url} alt={image.name} draggable={false} onError={() => setFailed(true)} onLoad={e => {
        const {naturalWidth: width, naturalHeight: height} = e.currentTarget;
        setDimensions({width, height}); fit(width, height);
      }} style={dimensions.width ? {width: dimensions.width * scale, height: dimensions.height * scale} : undefined} />}
    </div>
    <div className="image-viewer-hint">放大后滚动查看细节 · Esc 关闭</div>
  </dialog>;
}
