import React, { useState } from 'react';
import { 
  Car, 
  MapPin, 
  Gauge, 
  Clock, 
  Eye, 
  ShieldCheck, 
  Zap, 
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { Auction } from '../types';
import { MAIN_AUCTION_ID, DEFAULT_MEDIA_CONFIG } from '../services/auctionService';

interface CatalogCardProps {
  lot: Auction;
  isActive?: boolean;
  onSelectAuction: (id: string) => void;
  onOpenListingEditor?: (id: string) => void;
  onOpenConsignmentModal?: () => void;
  isAdmin?: boolean;
}

export const CatalogCard: React.FC<CatalogCardProps> = ({
  lot,
  isActive = false,
  onSelectAuction,
  onOpenListingEditor,
  isAdmin = false
}) => {
  const [imgError, setImgError] = useState(false);

  // Status computation
  const status = lot.status || 'upcoming';
  const hasReserve = (lot.reserveAmount || 0) > 0;
  const isReserveMet = lot.isReserveMet || (lot.currentBid || 0) >= (lot.reserveAmount || 0);

  // Hero image resolution order:
  // 1. lot.leadHeroImage
  // 2. lot.heroImages[0]
  // 3. Fallback for MAIN_AUCTION_ID lot to DEFAULT_MEDIA_CONFIG.heroImages[0]
  // 4. LocalStorage custom media if available
  const resolvedHeroImage = React.useMemo(() => {
    if (lot.leadHeroImage && lot.leadHeroImage.trim()) {
      return lot.leadHeroImage;
    }
    if (lot.heroImages && lot.heroImages.length > 0 && lot.heroImages[0]) {
      return lot.heroImages[0];
    }
    if (lot.id === MAIN_AUCTION_ID && DEFAULT_MEDIA_CONFIG.heroImages.length > 0) {
      return DEFAULT_MEDIA_CONFIG.heroImages[0];
    }
    try {
      const cached = localStorage.getItem(`wailtail_custom_media_${lot.id}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.heroImages && parsed.heroImages[0]) {
          return parsed.heroImages[0];
        }
      }
    } catch {
      // ignore
    }
    return null;
  }, [lot]);

  // Format countdown or remaining time
  const getTimeRemaining = () => {
    if (status === 'ended') return 'Auction Closed';
    const now = Date.now();
    const diff = lot.endTime - now;
    if (diff <= 0) return 'Ended';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}d ${hours}h left`;
    if (hours > 0) return `${hours}h ${mins}m left`;
    return `${mins}m left`;
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      maximumFractionDigits: 0
    }).format(val);
  };

  const displayPrice = lot.currentBid > 0 ? lot.currentBid : (lot.startingBid || 1000);

  return (
    <article
      id={`catalog-card-${lot.id}`}
      onClick={() => onSelectAuction(lot.id)}
      className={`group bg-white rounded-2xl border overflow-hidden transition-all duration-300 shadow-xs hover:shadow-xl flex flex-col cursor-pointer ${
        isActive 
          ? 'border-emerald-600 ring-2 ring-emerald-500/30' 
          : 'border-zinc-200 hover:border-zinc-300'
      }`}
    >
      {/* Photo Lead Banner */}
      <div className="relative aspect-16/10 bg-zinc-950 overflow-hidden">
        {resolvedHeroImage && !imgError ? (
          <img
            src={resolvedHeroImage}
            alt={lot.title}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 bg-linear-to-b from-zinc-900 to-zinc-950 p-6">
            <Car className="w-12 h-12 text-zinc-600 mb-2 group-hover:text-zinc-500 transition-colors" />
            <span className="text-xs font-bold text-zinc-400 tracking-wide uppercase">
              Photo Gallery Pending
            </span>
            <span className="text-[10px] text-zinc-500 mt-1">
              Curated studio assets being staged
            </span>
          </div>
        )}

        {/* Status Pills Container */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10">
          {status === 'active' || status === 'live' ? (
            <span className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-950/90 backdrop-blur-xs text-emerald-300 border border-emerald-500/60 flex items-center gap-1.5 shadow-md">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live Auction
            </span>
          ) : status === 'ended' || status === 'sold' ? (
            <span className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-zinc-900/90 backdrop-blur-xs text-zinc-300 border border-zinc-700 shadow-md">
              {status === 'sold' ? 'Sold' : 'Auction Ended'}
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-zinc-900/90 backdrop-blur-xs text-amber-300 border border-amber-600/60 shadow-md">
              Upcoming Lot
            </span>
          )}

          {isActive && (
            <span className="px-2 py-1 rounded-md text-[10px] font-black bg-zinc-950 text-white shadow-md border border-zinc-800">
              Active Lot
            </span>
          )}
        </div>

        {/* Highlights / Special Badges on top-right */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
          {lot.highlightsBadge && (
            <span className="px-2 py-1 rounded-md text-[10px] font-bold bg-black/80 backdrop-blur-xs text-white border border-white/20 shadow-md">
              {lot.highlightsBadge}
            </span>
          )}
          {hasReserve && isReserveMet && (
            <span className="px-2 py-1 rounded-md text-[10px] font-bold bg-emerald-900/90 text-emerald-200 border border-emerald-500/50 flex items-center gap-1 shadow-md">
              <ShieldCheck className="w-3 h-3 text-emerald-300" />
              Reserve Met
            </span>
          )}
          {!hasReserve && (
            <span className="px-2 py-1 rounded-md text-[10px] font-bold bg-blue-950/90 text-blue-200 border border-blue-500/40 flex items-center gap-1 shadow-md">
              <Zap className="w-3 h-3 text-blue-300" />
              No Reserve
            </span>
          )}
        </div>

        {/* Bottom gradient overlay with time remaining */}
        <div className="absolute bottom-0 inset-x-0 bg-linear-to-t from-black/80 via-black/40 to-transparent p-3 flex items-end justify-between text-white text-xs z-10">
          <div className="flex items-center gap-1.5 font-medium text-[11px] text-zinc-200">
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            <span>{getTimeRemaining()}</span>
          </div>

          <div className="flex items-center gap-1 text-[11px] text-zinc-300">
            <Eye className="w-3.5 h-3.5 text-zinc-400" />
            <span>{lot.watchCount ?? 18} watching</span>
          </div>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold text-base text-zinc-950 group-hover:text-red-700 transition-colors line-clamp-1">
              {lot.title || 'Untitled Vehicle'}
            </h3>
          </div>

          <p className="text-xs text-zinc-600 line-clamp-2 mt-1 leading-relaxed">
            {lot.subtitle || `${lot.engine || ''} ${lot.drivetrain ? '• ' + lot.drivetrain : ''} ${lot.exteriorColor ? '• ' + lot.exteriorColor : ''}`.trim() || 'Detailed inspection report and provenance available.'}
          </p>
        </div>

        {/* Specifications Pills */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-600">
          {lot.mileage && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200 font-medium">
              <Gauge className="w-3 h-3 text-zinc-500" />
              {lot.mileage}
            </span>
          )}

          {lot.engine && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200 font-medium line-clamp-1">
              {lot.engine}
            </span>
          )}

          {lot.location && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200 font-medium">
              <MapPin className="w-3 h-3 text-zinc-500" />
              {lot.location.split(',')[0]}
            </span>
          )}
        </div>

        {/* Footer: Financials & Action */}
        <div className="pt-3 border-t border-zinc-100 flex items-end justify-between">
          <div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-zinc-600">
              {lot.currentBid > 0 ? 'Current Bid' : 'Starting Bid'}
            </div>
            <div className="text-lg font-black text-zinc-900 tracking-tight">
              {formatCurrency(displayPrice)} <span className="text-[11px] font-bold text-zinc-600">CAD</span>
            </div>
            <div className="text-[10px] text-zinc-600 font-medium">
              {lot.bidCount || 0} {lot.bidCount === 1 ? 'bid' : 'bids'} placed
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && onOpenListingEditor && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenListingEditor(lot.id);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-semibold transition-colors border border-zinc-300"
              >
                Edit
              </button>
            )}

            <button
              type="button"
              className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-red-700 text-white text-xs font-bold transition-colors flex items-center gap-1 group-hover:translate-x-0.5"
            >
              <span>View Lot</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
};

// Export alias to support either import convention
export const AuctionCard = CatalogCard;
export default CatalogCard;
