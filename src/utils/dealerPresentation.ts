import type { Auction, PublicDealerSummary } from '../types';
export const DEALER_VERIFICATION_NOTICE = 'WAILTAIL manually reviews business identity, representative authority and declarations of exclusive vehicle ownership. Verification is not provincial regulatory endorsement, a vehicle-condition inspection or a guarantee.';
export function dealerTaxText(dealer: PublicDealerSummary) {
  return dealer.taxHandling === 'dealer_collects' ? 'Dealer collects applicable tax at settlement.' : dealer.taxHandling === 'buyer_pays_at_registration' ? 'Buyer pays applicable tax at registration.' : 'Tax arrangement requires confirmation with the seller before purchase.';
}
export type DealerCampaignStage = 'upcoming' | 'live' | 'ending_soon';
export function dealerCampaignState(auction: Partial<Auction>, requestedStage: DealerCampaignStage, now = Date.now()) {
  const end = Number(auction.endTime), start = Number(auction.startTime);
  const closed = ['ended', 'sold', 'reserve_not_met'].includes(auction.status || '') || (Number.isFinite(end) && end > 0 && end <= now);
  const live = !closed && ['active', 'live', 'ending_soon'].includes(auction.status || '') && (!Number.isFinite(start) || start <= now) && Number.isFinite(end) && end > now;
  const upcoming = !closed && ['preview', 'upcoming'].includes(auction.status || '') && Number.isFinite(start) && start > now;
  const ending = live && requestedStage === 'ending_soon' && end - now <= 86400000;
  const hook = closed ? 'AUCTION CLOSED' : ending ? 'ENDING SOON' : live ? 'LIVE NOW' : upcoming ? 'COMING TO AUCTION' : 'VEHICLE PREVIEW';
  const cta = closed ? 'View the auction result and vehicle details.' : ending ? 'Explore the listing and place your bid before closing.' : live ? 'See the vehicle, ask questions and join the bidding.' : upcoming ? 'Explore the vehicle and register ahead of bidding.' : 'Explore the vehicle listing and confirm auction availability.';
  return { end, start, closed, live, upcoming, ending, hook, cta };
}
export function dealerPromoTemplates(dealer: PublicDealerSummary | undefined, auction: Partial<Auction>, requestedStage: DealerCampaignStage, url: string, now = Date.now()) {
  const clean = (value: unknown) => typeof value === 'string' ? value.trim() : '';
  const title = clean(auction.title) || [auction.year, auction.make, auction.model].filter(Boolean).join(' ') || 'Dealer vehicle';
  const { end, start, closed, live, upcoming, ending, hook, cta } = dealerCampaignState(auction, requestedStage, now);
  const identity = dealer ? `${dealer.name} · ${dealer.city}, ${dealer.province}` : 'Dealer inventory';
  const provenance = dealer?.verified ? 'Verified Boutique Dealer on WAILTAIL' : 'Dealer-listed vehicle';
  const facts = [clean(auction.mileage) && `Odometer: ${clean(auction.mileage)}${/\b(km|mi|miles)\b/i.test(clean(auction.mileage)) ? '' : ` ${auction.distanceUnit || 'KM'}`}`, clean(auction.engine) && `Engine: ${clean(auction.engine)}`, clean(auction.drivetrain) && `Transmission: ${clean(auction.drivetrain)}`, clean(auction.exteriorColor) && `Exterior: ${clean(auction.exteriorColor)}`, clean(auction.location) && `Vehicle location: ${clean(auction.location)}`].filter(Boolean) as string[];
  const money = (n: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n) + ' CAD';
  const bid = live && Number.isFinite(auction.currentBid) && auction.currentBid! > 0 ? `Current bid: ${money(auction.currentBid!)}` : (live || upcoming) && Number.isFinite(auction.startingBid) && auction.startingBid! >= 0 ? `Starting bid: ${money(auction.startingBid!)}` : '';
  const utc = (time: number) => new Date(time).toISOString().replace('T', ' ').replace('.000Z', ' UTC');
  const deadline = ending ? `Closes: ${utc(end)} (subject to auction extensions).` : upcoming ? `Bidding starts: ${utc(start)}.` : '';
  const fees = [dealer?.documentationFee === 0 ? 'Dealer documentation fee: CAD $0.' : '', dealer ? dealerTaxText(dealer) : '', 'WAILTAIL does not calculate or collect sales tax.'].filter(Boolean).join(' ');
  const qualification = 'Verification is not provincial regulatory endorsement, a vehicle-condition inspection or a guarantee.';
  return {
    enthusiast_forum: [`${hook}: ${title}`, `Offered by ${identity}. ${provenance}.`, facts.length ? `Vehicle details:\n${facts.map(f => `• ${f}`).join('\n')}` : 'Explore the listing for available vehicle details and disclosures.', bid, deadline, cta, `View the lot: ${url}`, fees, qualification].filter(Boolean).join('\n\n'),
    marketplace_pitch: [`${hook} — ${title}`, facts.slice(0, 2).join(' • '), `${identity} | ${provenance}`, bid, deadline, cta, url, fees, qualification].filter(Boolean).join('\n'),
    x_thread: [
      `1/3 ${hook}: ${title.slice(0, 60)}\n${identity.slice(0, 60)}\n${provenance}\nWAILTAIL review is not regulatory endorsement or a condition guarantee.`,
      `2/3 ${facts.slice(0, 2).map(f => f.slice(0, 40)).join(' • ') || 'Vehicle details on the lot.'}\n${bid}\n${dealer?.documentationFee === 0 ? 'CAD $0 dealer doc fee. ' : ''}${dealer ? dealerTaxText(dealer) : 'Confirm taxes with seller.'} WAILTAIL does not collect sales tax.`,
      `3/3 ${closed ? 'View results and full disclosures:' : live ? 'View full disclosures and bid before close:' : upcoming ? 'Explore the lot and register before bidding:' : 'Explore the lot and confirm availability:'}\n${url}`
    ].join('\n\n')
  };
}
