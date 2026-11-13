import React from 'react';
import type { PublicDealerSummary } from '../types';
import { DEALER_VERIFICATION_NOTICE, dealerTaxText } from '../utils/dealerPresentation';
export function PublicDealerDisclosure({ dealer, compact = false }: { dealer?: PublicDealerSummary; compact?: boolean }) {
  if (!dealer) return null;
  return <section aria-label="Dealer information" className={`break-words rounded-lg border border-emerald-200 bg-emerald-50 text-zinc-800 ${compact ? 'p-2 mt-2 text-xs' : 'p-4 my-4 text-sm space-y-2'}`}>
    <p className="font-semibold">{dealer.verified ? 'Verified Boutique Dealer' : 'Dealer-listed vehicle'}</p>
    <p>{dealer.name} · Dealership location: {dealer.city}, {dealer.province}</p>
    {!compact && <>
      {!dealer.verified && <p>Historical dealer attribution. Current WAILTAIL verification is not confirmed.</p>}
      {dealer.documentationFee === 0 && <p>Dealer documentation fee: CAD $0</p>}
      <p>{dealerTaxText(dealer)} WAILTAIL does not calculate or collect sales tax.</p>
      <div className="flex flex-wrap gap-4">
        {dealer.phone && <a className="underline" href={`tel:${dealer.phone.replace(/[^+0-9]/g, '')}`}>Call dealership: {dealer.phone}</a>}
        {dealer.website && <a className="underline" href={dealer.website} target="_blank" rel="noopener noreferrer">Visit dealership website</a>}
      </div>
      <p className="text-xs leading-relaxed">{DEALER_VERIFICATION_NOTICE}</p>
    </>}
  </section>;
}
