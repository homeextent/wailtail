import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, FileText, Trash2 } from 'lucide-react';

interface Props {
  key?: string | number;
  src?: string;
  title?: string;
  isPdf?: boolean;
  heroPosition?: number;
  category?: string;
  onCategory?: (category: string) => void;
  onRemove?: () => void;
  onMove?: (direction: -1 | 1) => void;
  canLeft: boolean;
  canRight: boolean;
  disabled?: boolean;
  assetId?: string;
  dragProps?: React.HTMLAttributes<HTMLDivElement>;
}

/** Shared compact photo controls for private draft and published media. */
export function PhotoEditorCard({ src, title, isPdf, heroPosition, category, onCategory, onRemove,
  onMove, canLeft, canRight, disabled, assetId, dragProps }: Props) {
  const [open, setOpen] = useState(false);
  const close = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('keydown', escape); trigger.current?.focus(); };
  }, [open]);
  const hero = heroPosition !== undefined;
  return <div {...dragProps} data-asset-id={assetId} data-category={category}
    className={`relative rounded-xl overflow-hidden border aspect-[4/3] bg-black group shadow-md ${heroPosition === 0 ? 'border-amber-500/80 ring-1 ring-amber-500/40' : 'border-zinc-800 hover:border-zinc-600'}`}>
    {isPdf ? <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-zinc-900">
      <FileText className="w-8 h-8 text-red-400 mb-1" /><span className="text-[10px] font-bold text-zinc-300 uppercase">PDF Document</span>
      <span className="text-[11px] text-zinc-400 line-clamp-2 mt-0.5">{title || 'Inspection report'}</span>
      {src && <a href={src} download={title?.endsWith('.pdf') ? title : `${title || 'Inspection report'}.pdf`} className="text-xs text-amber-400 underline mt-1">Download PDF</a>}
    </div> : <button ref={trigger} type="button" disabled={!src} onClick={() => setOpen(true)} aria-label={`Preview ${title || 'photo'}`} className="block w-full h-full cursor-zoom-in">
      {src ? <img src={src} alt={title || 'Vehicle photo'} draggable={false} className="w-full h-full object-cover" /> : <span className="text-zinc-400 text-xs">Loading photo…</span>}
    </button>}
    <div className="absolute top-1.5 inset-x-1.5 flex items-center justify-between gap-1 z-10 pointer-events-none">
      {hero ? <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm ${heroPosition === 0 ? 'bg-amber-500 text-black' : 'bg-black/75 text-zinc-300'}`}>{heroPosition === 0 ? '★ Lead Hero' : `#${heroPosition! + 1}`}</span>
        : <select aria-label={`Category for ${title || 'photo'}`} value={category || 'exterior'} disabled={disabled || !onCategory} onChange={event => onCategory?.(event.target.value)} className="pointer-events-auto max-w-[70%] text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/85 text-zinc-200 border border-zinc-700 uppercase tracking-wider">
          <option value="exterior">Exterior</option><option value="interior">Interior</option><option value="engine">Engine</option><option value="underbody">Underbody</option><option value="documentation">Docs</option>
        </select>}
      {onRemove && <button type="button" disabled={disabled} onClick={onRemove} aria-label={`Remove ${title || 'photo'}`} title="Remove photo" className="pointer-events-auto w-6 h-6 shrink-0 rounded bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-md disabled:opacity-40"><Trash2 className="w-3.5 h-3.5" /></button>}
    </div>
    {onMove && <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-1.5 flex items-center justify-between z-10">
      <button type="button" disabled={disabled || !canLeft} onClick={() => onMove(-1)} aria-label={`Move ${title || 'photo'} left`} className="p-1 rounded text-[10px] font-bold flex items-center gap-0.5 text-zinc-200 bg-black/60 hover:bg-black/90 disabled:text-zinc-600 disabled:cursor-not-allowed"><ChevronLeft className="w-3 h-3" />Left</button>
      <button type="button" disabled={disabled || !canRight} onClick={() => onMove(1)} aria-label={`Move ${title || 'photo'} right`} className="p-1 rounded text-[10px] font-bold flex items-center gap-0.5 text-zinc-200 bg-black/60 hover:bg-black/90 disabled:text-zinc-600 disabled:cursor-not-allowed">Right<ChevronRight className="w-3 h-3" /></button>
    </div>}
    {open && src && createPortal(<div role="dialog" aria-modal="true" aria-label="Photo preview" onClick={() => setOpen(false)} className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-6">
      <button ref={close} type="button" onClick={() => setOpen(false)} onKeyDown={event => { if (event.key === 'Tab') { event.preventDefault(); close.current?.focus(); } }} className="text-white rounded bg-zinc-800 px-4 py-2 mb-3">Close preview</button>
      <img src={src} alt={title || 'Photo preview'} className="max-h-[80vh] max-w-full object-contain" />
    </div>, document.body)}
  </div>;
}
