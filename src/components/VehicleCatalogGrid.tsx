import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Auction, 
  PlatformPromoSettings, 
  PromoCardConfig, 
  PromoCtaAction, 
  PromoAudience 
} from '../types';
import { formatCurrency } from '../utils/formatters';
import { CatalogCard } from './CatalogCard';
import { 
  subscribeToPromoSettings, 
  recordPromoClick, 
  DEFAULT_PROMO_SETTINGS,
  updateAuctionStatus,
  reconcileAuctionClosureAndNotifyWinner,
  isPromoAudienceMatch,
  isPromoScheduleActive
} from '../services/auctionService';
import { useAuth } from '../context/AuthContext';
import { 
  Car, 
  Search, 
  ArrowRight, 
  CheckCircle, 
  Clock, 
  MapPin, 
  Gauge, 
  ExternalLink, 
  Plus, 
  ShieldCheck, 
  Flame, 
  ChevronRight, 
  Tag, 
  Sparkles, 
  Zap 
} from 'lucide-react';

interface VehicleCatalogGridProps {
  auctions: Auction[];
  activeAuctionId: string;
  onSelectAuction: (auctionId: string) => void;
  onOpenListingEditor?: (auctionId: string) => void;
  onOpenNewListingModal?: () => void;
  onOpenConsignmentModal?: () => void;
  onOpenAuthModal?: () => void;
  onOpenContactModal?: () => void;
  isAdmin?: boolean;
}

export const isLive = (
  status?: string | null,
  startTime?: number | null,
  endTime?: number | null,
  now: number = Date.now()
): boolean => {
  if (status === 'draft' || status === 'pending_review' || status === 'sold') return false;
  if (startTime !== undefined && startTime !== null && endTime !== undefined && endTime !== null) {
    return now >= startTime && now < endTime;
  }
  return status === 'live' || status === 'ending_soon' || status === 'active';
};

export const isUpcoming = (
  status?: string | null,
  startTime?: number | null,
  endTime?: number | null,
  now: number = Date.now()
): boolean => {
  if (status === 'draft' || status === 'pending_review' || status === 'sold') return false;
  if (startTime !== undefined && startTime !== null) {
    return now < startTime;
  }
  return status !== 'draft' && status !== 'pending_review' && (status === 'upcoming' || status === 'preview' || !status);
};

export const isEnded = (
  status?: string | null,
  startTime?: number | null,
  endTime?: number | null,
  now: number = Date.now()
): boolean => {
  if (status === 'sold' || status === 'ended') return true;
  if (status === 'draft' || status === 'pending_review') return false;
  if (endTime !== undefined && endTime !== null) {
    return now >= endTime;
  }
  return status === 'ended' || status === 'sold' || status === 'reserve_not_met';
};

export const VehicleCatalogGrid: React.FC<VehicleCatalogGridProps> = ({
  auctions,
  activeAuctionId,
  onSelectAuction,
  onOpenListingEditor,
  onOpenNewListingModal,
  onOpenConsignmentModal,
  onOpenAuthModal,
  onOpenContactModal,
  isAdmin = false
}) => {
  const { user, userProfile } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'live' | 'upcoming' | 'ended'>('all');
  const [promoSettings, setPromoSettings] = useState<PlatformPromoSettings>(DEFAULT_PROMO_SETTINGS);
  const [brokenImageMap, setBrokenImageMap] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState(Date.now());

  // Tick countdown timer every 1000ms for dynamic status transitions
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const reconciledLotsRef = useRef<Set<string>>(new Set());

  // Real-time clock reconciliation for active auctions crossing endTime (now >= endTime)
  // When real-time clock tickers detect an active lot crossing endTime (now >= endTime),
  // directly invoke reconcileAuctionClosureAndNotifyWinner(auction.id) to guarantee settlement execution.
  useEffect(() => {
    auctions.forEach((auction: Auction) => {
      const hasValidEndTime = typeof auction.endTime === 'number' && auction.endTime > 0;
      const isDraftOrPending = auction.status === 'draft' || auction.status === 'pending_review';

      if (
        auction.id &&
        !isDraftOrPending &&
        hasValidEndTime &&
        now >= auction.endTime &&
        auction.winningEmailSent !== true &&
        !reconciledLotsRef.current.has(auction.id)
      ) {
        reconciledLotsRef.current.add(auction.id);
        console.log(`[Settlement] Real-time clock ticker in VehicleCatalogGrid detected lot ${auction.id} crossing endTime. Directly invoking reconcileAuctionClosureAndNotifyWinner.`);
        const isReserveMet = Boolean(
          auction.isReserveMet ||
          (auction.reserveAmount > 0 ? auction.currentBid >= auction.reserveAmount : true)
        );
        const terminalStatus = isReserveMet ? 'sold' : 'ended';

        if (auction.status !== terminalStatus) {
          updateAuctionStatus(auction.id, terminalStatus).catch((err) => {
            console.warn('[Settlement] VehicleCatalogGrid: silent auction status reconciliation failed:', err);
          });
        }
        reconcileAuctionClosureAndNotifyWinner(auction.id).catch((err) => {
          console.warn('[Settlement] VehicleCatalogGrid: silent auction closure reconciliation failed:', err);
        });
      }
    });
  }, [auctions, now]);

  // Subscribe to promotional settings in real-time
  useEffect(() => {
    const unsub = subscribeToPromoSettings((settings) => {
      setPromoSettings(settings);
    });
    return () => unsub();
  }, []);

  const handlePromoAction = (card: PromoCardConfig) => {
    // 1. Silent non-blocking telemetry failover
    try {
      recordPromoClick(card.id, false).catch(() => {});
    } catch {
      // Telemetry error swallowed silently to ensure zero guest modal latency
    }

    // 2. Immediate route CTA action
    const action = card.ctaAction;
    if (action === 'consignment_modal') {
      if (onOpenConsignmentModal) {
        onOpenConsignmentModal();
        return;
      }
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Sell Your Vehicle') || b.textContent?.includes('Consign')
      );
      if (btn) btn.click();
    } else if (action === 'auth_modal') {
      if (onOpenAuthModal) {
        onOpenAuthModal();
        return;
      }
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Sign In') || b.textContent?.includes('Register')
      );
      if (btn) btn.click();
    } else if (action === 'contact_modal') {
      if (onOpenContactModal) {
        onOpenContactModal();
        return;
      }
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Contact') || b.textContent?.includes('Inquiry')
      );
      if (btn) btn.click();
    } else if (action === 'external_url') {
      if (card.ctaUrl) {
        if (card.ctaUrl.startsWith('http://') || card.ctaUrl.startsWith('https://')) {
          window.open(card.ctaUrl, '_blank', 'noopener,noreferrer');
        } else {
          window.location.href = card.ctaUrl;
        }
      }
    }
  };

  const isAuthenticated = Boolean(user || userProfile);

  const catalogBanner = promoSettings?.catalogBanner;
  const isCatalogBannerVisible = useMemo(() => {
    if (!promoSettings?.enabled || !catalogBanner?.enabled) return false;
    if (!isPromoAudienceMatch(catalogBanner.targetAudience, isAuthenticated)) return false;
    if (!isPromoScheduleActive(catalogBanner.startDate, catalogBanner.expiresAt, now)) return false;
    if (!catalogBanner.text && !catalogBanner.badgeText) return false;
    return true;
  }, [promoSettings?.enabled, catalogBanner, isAuthenticated, now]);

  const handleCatalogBannerCtaClick = () => {
    try {
      recordPromoClick('catalog_banner', true).catch(() => {});
    } catch {
      // Telemetry error swallowed silently to ensure zero latency
    }

    if (!catalogBanner) return;
    const action = catalogBanner.ctaAction;
    if (action === 'consignment_modal') {
      if (onOpenConsignmentModal) {
        onOpenConsignmentModal();
        return;
      }
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Sell Your Vehicle') || b.textContent?.includes('Consign')
      );
      if (btn) btn.click();
    } else if (action === 'auth_modal') {
      if (onOpenAuthModal) {
        onOpenAuthModal();
        return;
      }
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Sign In') || b.textContent?.includes('Register')
      );
      if (btn) btn.click();
    } else if (action === 'contact_modal') {
      if (onOpenContactModal) {
        onOpenContactModal();
        return;
      }
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Contact') || b.textContent?.includes('Inquiry')
      );
      if (btn) btn.click();
    } else if (action === 'external_url') {
      if (catalogBanner.ctaUrl) {
        let destination = catalogBanner.ctaUrl.trim();
        if (!destination.startsWith('http://') && !destination.startsWith('https://')) {
          destination = `https://${destination}`;
        }
        window.open(destination, '_blank', 'noopener,noreferrer');
      }
    }
  };

  // Active promo cards filtered by enabled, targetAudience, and active schedule window
  const activePromoCards = useMemo(() => {
    if (!promoSettings.enabled) return [];
    return (promoSettings.cards || []).filter((card) => {
      if (!card.enabled) return false;
      if (!isPromoAudienceMatch(card.targetAudience, isAuthenticated)) return false;
      if (!isPromoScheduleActive(card.startDate, card.expiresAt, now)) return false;
      return true;
    });
  }, [promoSettings.enabled, promoSettings.cards, isAuthenticated, now]);

  const filteredAuctions = useMemo(() => {
    return auctions.filter((lot: Auction) => {
      // Draft and pending_review lots are strictly excluded from public catalog views
      if (lot.status === 'draft' || lot.status === 'pending_review') return false;
      if (filterStatus === 'live' && !isLive(lot.status, lot.startTime, lot.endTime, now)) return false;
      if (filterStatus === 'upcoming' && !isUpcoming(lot.status, lot.startTime, lot.endTime, now)) return false;
      if (filterStatus === 'ended' && !isEnded(lot.status, lot.startTime, lot.endTime, now)) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const match =
          (lot.title || '').toLowerCase().includes(q) ||
          (lot.subtitle || '').toLowerCase().includes(q) ||
          (lot.vin || '').toLowerCase().includes(q) ||
          (lot.make || '').toLowerCase().includes(q) ||
          (lot.model || '').toLowerCase().includes(q) ||
          (lot.location || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [auctions, filterStatus, now, searchTerm]);

  const publicAuctions = useMemo(
    () => auctions.filter((a: Auction) => a.status !== 'draft' && a.status !== 'pending_review'),
    [auctions]
  );

  // Unified grid injection pipeline
  const gridItems = useMemo(() => {
    const isLaunchMode = promoSettings?.cadenceInterval === -1;

    // Launch Mode (cadenceInterval === -1):
    // Inject all eligible active promo cards without slot-capping.
    if (isLaunchMode && promoSettings.enabled && activePromoCards.length > 0) {
      if (publicAuctions.length <= 2) {
        // Low Inventory (<= 2 lots):
        // Bypass the slice(0, Math.max(0, 3 - auctions.length)) slot-capping math.
        // Inject all eligible, active, audience-matched promo cards into the grid
        // so they wrap naturally into subsequent grid rows alongside active vehicle cards.
        const items: Array<{ kind: 'auction'; lot: Auction } | { kind: 'promo'; card: PromoCardConfig }> =
          filteredAuctions.map((lot) => ({ kind: 'auction', lot }));

        activePromoCards.forEach((card) => {
          items.push({ kind: 'promo', card });
        });
        return items;
      }

      // Populated Inventory (> 2 lots):
      // Interleave all eligible promo cards evenly throughout inventory rows
      // to ensure 100% impression visibility for all active cards.
      const items: Array<{ kind: 'auction'; lot: Auction } | { kind: 'promo'; card: PromoCardConfig }> = [];
      const totalAuctions = filteredAuctions.length;
      const totalPromos = activePromoCards.length;
      const interval = Math.max(1, Math.floor(totalAuctions / totalPromos));

      let promoIndex = 0;
      filteredAuctions.forEach((lot, index) => {
        items.push({ kind: 'auction', lot });
        if (
          promoIndex < totalPromos &&
          ((index + 1) % interval === 0 || index === totalAuctions - 1)
        ) {
          items.push({ kind: 'promo', card: activePromoCards[promoIndex] });
          promoIndex++;
        }
      });

      // Append any remaining promo cards if not yet injected
      while (promoIndex < totalPromos) {
        items.push({ kind: 'promo', card: activePromoCards[promoIndex] });
        promoIndex++;
      }

      return items;
    }

    // Standard Mode (isLaunchMode === false):
    // Low Inventory (<= 2 lots): Maintain padding behavior by appending active promo cards
    // to trailing slots to preserve a full 3-card desktop row.
    if (publicAuctions.length <= 2) {
      const items: Array<{ kind: 'auction'; lot: Auction } | { kind: 'promo'; card: PromoCardConfig }> =
        filteredAuctions.map((lot) => ({ kind: 'auction', lot }));

      if (promoSettings.enabled && activePromoCards.length > 0) {
        if (filteredAuctions.length > 0) {
          const promoSlotsCount = Math.max(0, 3 - filteredAuctions.length);
          const trailingPromos = activePromoCards.slice(0, promoSlotsCount);
          trailingPromos.forEach((card) => {
            items.push({ kind: 'promo', card });
          });
        } else if (!searchTerm.trim() && filterStatus === 'all') {
          // Zero catalog lots and unfiltered view: populate up to 3 cards
          activePromoCards.slice(0, 3).forEach((card) => {
            items.push({ kind: 'promo', card });
          });
        }
      }
      return items;
    }

    // Populated Inventory (> 2 lots):
    // If cadenceInterval > 0 and active promo cards exist, splice qualifying cards into the grid at every N-th position
    // (e.g., if interval is 6, insert at index 5, index 11, etc.), sequentially cycling through available active promo cards.
    // If cadenceInterval === 0, undefined, or no promo cards qualify, render vehicle listings only.
    const cadenceInterval = promoSettings.cadenceInterval ?? 6;
    if (!promoSettings.enabled || cadenceInterval <= 0 || activePromoCards.length === 0) {
      return filteredAuctions.map((lot) => ({ kind: 'auction' as const, lot }));
    }

    const items: Array<{ kind: 'auction'; lot: Auction } | { kind: 'promo'; card: PromoCardConfig }> = [];
    let promoIndex = 0;
    let lotIndex = 0;

    while (lotIndex < filteredAuctions.length) {
      if ((items.length + 1) % cadenceInterval === 0) {
        const promoCard = activePromoCards[promoIndex % activePromoCards.length];
        items.push({
          kind: 'promo',
          card: promoCard
        });
        promoIndex++;
      } else {
        items.push({
          kind: 'auction',
          lot: filteredAuctions[lotIndex]
        });
        lotIndex++;
      }
    }

    return items;
  }, [
    publicAuctions.length,
    filteredAuctions,
    promoSettings.enabled,
    promoSettings.cadenceInterval,
    activePromoCards,
    searchTerm,
    filterStatus
  ]);

  return (
    <div className="w-full bg-[#f8f9fa] text-zinc-900">
      {/* Edge-to-Edge Catalog Announcement Ribbon (Flush directly beneath Navbar) */}
      {isCatalogBannerVisible && catalogBanner && (
        <div className="w-full border-b border-slate-800 bg-slate-900/95 backdrop-blur-md py-2 sm:py-2.5 relative z-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap min-w-0">
              {catalogBanner.badgeText && catalogBanner.badgeText.trim() !== '' && (
                <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[11px] sm:text-xs font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider shrink-0">
                  {catalogBanner.badgeText}
                </span>
              )}
              {catalogBanner.text && (
                <span className="text-xs sm:text-sm text-slate-200 font-normal leading-relaxed">
                  {catalogBanner.text}
                </span>
              )}
            </div>

            {catalogBanner.ctaText && (
              <button
                type="button"
                onClick={handleCatalogBannerCtaClick}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm px-3.5 py-1.5 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 shrink-0 self-end sm:self-auto cursor-pointer"
              >
                <span>{catalogBanner.ctaText}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Catalog Container */}
      <div className="w-full pt-6 pb-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Catalog Banner & Title */}
        <div className="bg-[#121619] rounded-2xl text-white p-6 sm:p-8 border border-zinc-800 shadow-xl relative overflow-hidden">
          {/* Subtle background glow */}
          <div className="absolute -right-20 -top-20 w-80 h-80 bg-red-700/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-2 max-w-2xl">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-red-950 text-red-300 border border-red-800 flex items-center gap-1">
                  <Flame className="w-3 h-3 text-red-400" />
                  Live Marketplace
                </span>
                <span className="text-xs text-zinc-400">• Canadian Classic & Enthusiast Lots</span>
              </div>
              <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight font-serif text-white">
                Vehicle Auction Catalog
              </h1>
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                Explore curated single-car auctions with transparent bidding, no buyer fees, certified inspection records, and Canadian CAD settlements.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
              {onOpenConsignmentModal && (
                <button
                  type="button"
                  onClick={onOpenConsignmentModal}
                  className="px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 flex items-center gap-2 shadow-sm transition-all cursor-pointer active:scale-95"
                >
                  <Tag className="w-4 h-4 text-amber-400" />
                  <span>Sell Your Vehicle</span>
                </button>
              )}

              {isAdmin && onOpenNewListingModal && (
                <button
                  type="button"
                  onClick={onOpenNewListingModal}
                  className="px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-2 shadow-lg transition-all cursor-pointer active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ New Vehicle Listing</span>
                </button>
              )}
            </div>
          </div>

          {/* Search Bar & Filter Tabs */}
          <div className="mt-6 pt-6 border-t border-zinc-800/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by make, model, VIN, or location..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs sm:text-sm text-white placeholder-zinc-500 focus:ring-2 focus:ring-red-600 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-xl border border-zinc-700 text-xs font-semibold overflow-x-auto">
              <button
                type="button"
                onClick={() => setFilterStatus('all')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  filterStatus === 'all'
                    ? 'bg-zinc-800 text-white shadow-xs font-bold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                All Lots ({publicAuctions.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('live')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  filterStatus === 'live'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800 shadow-xs font-bold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live ({publicAuctions.filter((a: Auction) => isLive(a.status, a.startTime, a.endTime, now)).length})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('upcoming')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  filterStatus === 'upcoming'
                    ? 'bg-blue-950 text-blue-300 border border-blue-800 shadow-xs font-bold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Upcoming ({publicAuctions.filter((a: Auction) => isUpcoming(a.status, a.startTime, a.endTime, now)).length})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('ended')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  filterStatus === 'ended'
                    ? 'bg-zinc-800 text-zinc-200 shadow-xs font-bold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Ended ({publicAuctions.filter((a: Auction) => isEnded(a.status, a.startTime, a.endTime, now)).length})
              </button>
            </div>
          </div>
        </div>

        {/* Vehicle Catalog Grid */}
        {gridItems.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-200 p-12 text-center space-y-3 shadow-xs">
            <Car className="w-12 h-12 text-zinc-400 mx-auto" />
            <h3 className="text-base font-bold text-zinc-800">No vehicle listings match your filter</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              Try adjusting your search query or switching to "All Lots" to see all catalog entries.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setFilterStatus('all');
              }}
              className="mt-2 px-4 py-2 rounded-lg text-xs font-bold bg-zinc-900 text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {gridItems.map((item, index) => {
              if (item.kind === 'auction') {
                return (
                  <CatalogCard
                    key={item.lot.id}
                    lot={item.lot}
                    isActive={item.lot.id === activeAuctionId}
                    onSelectAuction={onSelectAuction}
                    onOpenListingEditor={onOpenListingEditor}
                    onOpenConsignmentModal={onOpenConsignmentModal}
                    isAdmin={isAdmin}
                  />
                );
              }

              const card = item.card;
              const themeStyles = {
                amber: {
                  container: 'border-amber-500/30 hover:border-amber-500/60 bg-gradient-to-b from-[#1c1813] via-[#141619] to-[#0e1114]',
                  badge: 'bg-amber-950/80 text-amber-300 border-amber-700/60',
                  glow: 'bg-amber-500/10',
                  btn: 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black shadow-amber-900/20'
                },
                emerald: {
                  container: 'border-emerald-500/30 hover:border-emerald-500/60 bg-gradient-to-b from-[#101c15] via-[#121719] to-[#0e1114]',
                  badge: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60',
                  glow: 'bg-emerald-500/10',
                  btn: 'bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white shadow-emerald-900/20'
                },
                purple: {
                  container: 'border-purple-500/30 hover:border-purple-500/60 bg-gradient-to-b from-[#191220] via-[#13151b] to-[#0e1114]',
                  badge: 'bg-purple-950/80 text-purple-300 border-purple-700/60',
                  glow: 'bg-purple-500/10',
                  btn: 'bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white shadow-purple-900/20'
                },
                blue: {
                  container: 'border-blue-500/30 hover:border-blue-500/60 bg-gradient-to-b from-[#0f1927] via-[#12161b] to-[#0e1114]',
                  badge: 'bg-blue-950/80 text-blue-300 border-blue-700/60',
                  glow: 'bg-blue-500/10',
                  btn: 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white shadow-blue-900/20'
                }
              }[card.accentColor || 'amber'];

              const hasMedia = !!card.imageUrl && !brokenImageMap[card.id];

              return (
                <div
                  key={`${card.id}-${index}`}
                  className={`rounded-2xl border flex flex-col justify-between relative shadow-xl overflow-hidden transition-all duration-300 hover:shadow-2xl group ${themeStyles.container}`}
                  style={{ minHeight: '380px' }}
                >
                  {/* Atmospheric Glow */}
                  <div className={`absolute -right-16 -top-16 w-56 h-56 rounded-full blur-3xl pointer-events-none ${themeStyles.glow}`} />

                  {/* Top Media Header */}
                  {hasMedia && (
                    <div className="relative aspect-[16/9] w-full bg-zinc-950 overflow-hidden rounded-t-2xl">
                      <img
                        src={card.imageUrl}
                        alt={card.imageAlt || card.headline}
                        onError={() => setBrokenImageMap((prev) => ({ ...prev, [card.id]: true }))}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        referrerPolicy="no-referrer"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                    </div>
                  )}

                  {/* Card Content Body */}
                  <div className="p-6 flex-1 flex flex-col justify-between relative z-10">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        {card.badgeText && (
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border flex items-center gap-1 ${themeStyles.badge}`}>
                            <Sparkles className="w-3 h-3" />
                            <span>{card.badgeText}</span>
                          </span>
                        )}
                      </div>

                      <h3 className="text-xl sm:text-2xl font-black font-serif text-white leading-snug tracking-tight">
                        {card.headline}
                      </h3>

                      <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                        {card.copy}
                      </p>
                    </div>

                    {/* Bottom Action CTA */}
                    <div className="pt-6 relative z-10 border-t border-zinc-800/80 mt-6">
                      <button
                        type="button"
                        onClick={() => handlePromoAction(card)}
                        className={`w-full py-3 px-4 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 shadow-md transition-all active:scale-98 cursor-pointer group-hover:brightness-110 ${themeStyles.btn}`}
                      >
                        <span>{card.ctaText || 'Learn More'}</span>
                        {card.ctaAction === 'external_url' ? (
                          <ExternalLink className="w-4 h-4" />
                        ) : (
                          <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  </div>
  );
};

