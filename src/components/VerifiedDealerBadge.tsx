import React from 'react';
import { Check } from 'lucide-react';
import { WailtailLogo } from './WailtailLogo';

/** Presentation only: callers decide whether current verification permits display. */
export function VerifiedDealerBadge({ compact = false }: { compact?: boolean }) {
  return <span className={`inline-flex max-w-full items-center gap-2 rounded-lg border border-emerald-600/50 bg-[#121619] text-white ${compact ? 'px-2 py-1' : 'px-2.5 py-1.5'}`}>
    <span aria-hidden="true" className={`shrink-0 ${compact ? '[&_svg]:h-4 [&_svg]:w-4' : '[&_svg]:h-5 [&_svg]:w-5'}`}>
      <WailtailLogo theme="dark" />
    </span>
    <span className={`shrink-0 font-black italic tracking-wide ${compact ? 'text-[9px]' : 'text-[10px]'}`}>WAILTAIL</span>
    <span aria-hidden="true" className="h-5 w-px shrink-0 bg-emerald-700" />
    <span className={`min-w-0 font-semibold leading-tight text-emerald-100 ${compact ? 'text-[10px]' : 'text-xs'}`}>Verified Boutique Dealer</span>
    <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-emerald-400" strokeWidth={3} />
  </span>;
}
