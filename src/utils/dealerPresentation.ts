import type { PublicDealerSummary } from '../types';
export const DEALER_VERIFICATION_NOTICE = 'WAILTAIL manually reviews business identity, representative authority and declarations of exclusive vehicle ownership. Verification is not provincial regulatory endorsement, a vehicle-condition inspection or a guarantee.';
export function dealerTaxText(dealer: PublicDealerSummary) {
  return dealer.taxHandling === 'dealer_collects' ? 'Dealer collects applicable tax at settlement.' : dealer.taxHandling === 'buyer_pays_at_registration' ? 'Buyer pays applicable tax at registration.' : 'Tax arrangement requires confirmation with the seller before purchase.';
}
export function dealerPromoText(dealer: PublicDealerSummary | undefined, vehicle: string, url: string) {
  const identity = dealer ? `${dealer.name} · ${dealer.city}, ${dealer.province}` : 'Dealer inventory';
  return `${vehicle}\n${identity}${dealer?.verified ? '\nVerified Boutique Dealer on WAILTAIL' : ''}\n${dealer?.documentationFee === 0 ? 'Dealer documentation fee: CAD $0.\n' : ''}${dealer ? dealerTaxText(dealer) + '\n' : ''}WAILTAIL does not calculate or collect sales tax.\nReview the vehicle listing, disclosures and auction status:\n${url}\n${DEALER_VERIFICATION_NOTICE}`;
}
