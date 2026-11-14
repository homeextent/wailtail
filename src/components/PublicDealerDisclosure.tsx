import React from 'react';
import type { PublicDealerSummary } from '../types';
import { DEALER_VERIFICATION_NOTICE, dealerTaxText } from '../utils/dealerPresentation';
export function PublicDealerDisclosure({ dealer, compact = false }: { dealer?: PublicDealerSummary; compact?: boolean }) {
  if (!dealer) return null;
  return <section aria-label="Dealer information" className={`break-words rounded-lg border border-emerald-200 bg-emerald-50 text-zinc-800 ${compact ? 'p-2 mt-2 text-xs' : 'p-3 sm:p-4 my-4 text-sm space-y-1'}`}>
    <p className="font-semibold">{dealer.verified ? 'Verified Boutique Dealer' : 'Dealer-listed vehicle'}</p>
    <p>{dealer.name} · {dealer.city}, {dealer.province}{!compact && <span className="text-xs"> (dealership location)</span>}</p>
    {!compact && <>
      {!dealer.verified && <p>Historical dealer attribution. Current WAILTAIL verification is not confirmed.</p>}
      {dealer.documentationFee === 0 && <p>Dealer documentation fee: CAD $0</p>}
      <p>{dealerTaxText(dealer)}</p>
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">
          <span aria-hidden="true" className="group-open:rotate-90">›</span> Dealer details &amp; verification
        </summary>
        <div className="space-y-3 pb-2">
          <p>WAILTAIL does not calculate or collect sales tax.</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-4">
            {dealer.phone && <a className="flex min-h-11 items-center underline" href={`tel:${dealer.phone.replace(/[^+0-9]/g, '')}`}>Call dealership: {dealer.phone}</a>}
            {dealer.website && <a className="flex min-h-11 items-center underline" href={dealer.website} target="_blank" rel="noopener noreferrer">Visit dealership website</a>}
          </div>
          <p className="text-xs leading-relaxed">{DEALER_VERIFICATION_NOTICE}</p>
        </div>
      </details>
    </>}
  </section>;
}
