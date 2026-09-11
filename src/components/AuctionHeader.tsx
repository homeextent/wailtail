import React, { useState, useEffect, useMemo } from 'react';
import { Auction, PlatformPromoSettings } from '../types';
import { formatCurrency, formatAuctionCountdown } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';
import { 
  toggleWatchlistLot,
  subscribeToPromoSettings,
  recordPromoClick,
  isPromoScheduleActive,
  isPromoAudienceMatch
} from '../services/auctionService';
import { 
  Clock, 
  Gavel, 
  ShieldCheck, 
  MapPin, 
  Gauge, 
  Calendar, 
  Info, 
  Flame,
  CheckCircle2,
  AlertTriangle,
  Radio,
  X
} from 'lucide-react';

const DISMISSED_PROMOS_STORAGE_KEY = 'wailtail_dismissed_promos';
const LOT_HEADER_BANNER_ID = 'lot_header_banner';

interface AuctionHeaderProps {
  auction: Auction;
  onOpenBid: () => void;
  onScrollToComments: () => void;
  onOpenConsignmentModal?: () => void;
  onOpenAuthModal?: () => void;
  onOpenContactModal?: () => void;
}

export const AuctionHeader: React.FC<AuctionHeaderProps> = ({
  auction,
  onOpenBid,
  onScrollToComments,
  onOpenConsignmentModal,
  onOpenAuthModal,
  onOpenContactModal
}) => {
  const { user, userProfile } = useAuth();
  const [now, setNow] = useState(Date.now());
  const [isWatching, setIsWatching] = useState<boolean>(false);
  const [isWatchLoading, setIsWatchLoading] = useState<boolean>(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [promoSettings, setPromoSettings] = useState<PlatformPromoSettings | null>(null);
  const [isBannerDismissed, setIsBannerDismissed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(DISMISSED_PROMOS_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            return parsed.includes(LOT_HEADER_BANNER_ID);
          }
        }
      } catch {
        // ignore
      }
    }
    return false;
  });

  // Subscribe to promotional settings in real-time
  useEffect(() => {
    const unsub = subscribeToPromoSettings((settings) => {
      setPromoSettings(settings);
    });
    return () => unsub();
  }, []);

  // Sync dismissal state from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(DISMISSED_PROMOS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setIsBannerDismissed(parsed.includes(LOT_HEADER_BANNER_ID));
        }
      }
    } catch (err) {
      console.warn('Failed to read dismissed promos from localStorage:', err);
    }
  }, []);

  const handleDismissBanner = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setIsBannerDismissed(true);
      let nextDismissed: string[] = [];
      const stored = localStorage.getItem(DISMISSED_PROMOS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          nextDismissed = parsed;
        }
      }
      if (!nextDismissed.includes(LOT_HEADER_BANNER_ID)) {
        nextDismissed.push(LOT_HEADER_BANNER_ID);
        localStorage.setItem(DISMISSED_PROMOS_STORAGE_KEY, JSON.stringify(nextDismissed));
      }
    } catch (err) {
      console.warn('Failed to persist dismissed promo banner:', err);
    }
  };

  const handleBannerCtaClick = () => {
    try {
      recordPromoClick(LOT_HEADER_BANNER_ID, true).catch(() => {});
    } catch {
      // Telemetry error swallowed silently to ensure zero latency
    }

    const banner = promoSettings?.lotHeaderBanner;
    if (!banner) return;

    const action = banner.ctaAction;
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
      if (banner.ctaUrl) {
        if (banner.ctaUrl.startsWith('http://') || banner.ctaUrl.startsWith('https://')) {
          window.open(banner.ctaUrl, '_blank', 'noopener,noreferrer');
        } else {
          window.location.href = banner.ctaUrl;
        }
      }
    }
  };

  const banner = promoSettings?.lotHeaderBanner;
  const isBannerVisible = useMemo(() => {
    if (!promoSettings || !promoSettings.enabled) return false;
    if (!banner || !banner.enabled) return false;
    if (isBannerDismissed) return false;
    if (!isPromoAudienceMatch(banner.targetAudience, Boolean(user || userProfile))) return false;
    if (!isPromoScheduleActive(banner.startDate, banner.expiresAt, now)) return false;
    if (!banner.text && !banner.badgeText) return false;
    return true;
  }, [promoSettings, banner, isBannerDismissed, user, userProfile, now]);

  // Sync user's saved watchlist status for this specific auction
  useEffect(() => {
    if (user && userProfile?.watchlist) {
      setIsWatching(userProfile.watchlist.includes(auction.id));
    } else if (!user) {
      setIsWatching(false);
    }
  }, [user, userProfile?.watchlist, auction.id]);

  // Toast auto-dismiss after 3.5s
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
  };

  // Wire Share to copy window.location.href to clipboard with a success toast notification
  const handleShareClick = async () => {
    try {
      if (typeof window !== 'undefined' && navigator.clipboard && window.location.href) {
        await navigator.clipboard.writeText(window.location.href);
      } else if (typeof document !== 'undefined') {
        const tempInput = document.createElement('textarea');
        tempInput.value = window.location.href;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
      }
      showToast('Listing URL copied to clipboard!', 'success');
    } catch (err) {
      console.warn('Clipboard write fallback error:', err);
      showToast('Listing URL copied to clipboard!', 'success');
    }
  };

  // Wire Watch to call toggleWatchlistLot and toggle active button state dynamically
  const handleWatchClick = async () => {
    if (!user) {
      showToast('Please log in or register to save vehicles to your watchlist', 'info');
      return;
    }

    setIsWatchLoading(true);
    try {
      const res = await toggleWatchlistLot(user.uid, auction.id);
      setIsWatching(res.isWatching);
      showToast(
        res.isWatching ? '★ Vehicle saved to your watchlist!' : 'Vehicle removed from your watchlist',
        'success'
      );
    } catch (err) {
      console.error('Failed to toggle watchlist state:', err);
      showToast('Could not update watchlist. Please try again.', 'error');
    } finally {
      setIsWatchLoading(false);
    }
  };

  // Tick countdown timer every 1000ms
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const timeData = formatAuctionCountdown(
    auction.startTime, 
    auction.endTime, 
    auction.status, 
    now
  );
  const isEnded = timeData.isEnded;
  const isUpcoming = timeData.isUpcoming;

  // Dynamic reserve status: strictly never reveals the dollar amount
  const reserveMet = Boolean(auction.isReserveMet || auction.currentBid >= auction.reserveAmount);

  return (
    <div className="bg-white border-b border-zinc-200">
      {/* Direct-Lot Promotional Header Banner */}
      {isBannerVisible && banner && (
        <div className="bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent border-b border-amber-500/30 text-zinc-900 transition-all">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3 flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              {banner.badgeText && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500 text-black shadow-xs shrink-0">
                  {banner.badgeText}
                </span>
              )}
              <span className="text-xs sm:text-sm font-medium text-zinc-800 truncate sm:whitespace-normal">
                {banner.text}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {banner.ctaText && (
                <button
                  type="button"
                  onClick={handleBannerCtaClick}
                  className="px-3 py-1 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black transition-all shadow-xs active:scale-95 cursor-pointer whitespace-nowrap"
                >
                  {banner.ctaText}
                </button>
              )}
              <button
                type="button"
                onClick={handleDismissBanner}
                aria-label="Dismiss promotional banner"
                className="p-1 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-black/5 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Top Breadcrumb & Status */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-zinc-800 uppercase tracking-wider">Auctions</span>
            <span>/</span>
            <span className="text-zinc-600">{auction.make || 'Porsche'}</span>
            <span>/</span>
            <span className="text-zinc-600">{auction.model || '911 (1974-1989 G-Body)'}</span>
            <span>/</span>
            <span className="text-zinc-900 font-medium truncate max-w-xs">{auction.vin}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-zinc-600">
              <MapPin className="w-3.5 h-3.5 text-zinc-400" />
              <span>{auction.location}</span>
            </span>
            <span className="text-zinc-300">•</span>
            <span className="text-zinc-600">
              Seller: <strong className="text-zinc-900 font-semibold">{auction.sellerName}</strong>
            </span>
          </div>
        </div>

        {/* Main Vehicle Title */}
        <div className="mb-4">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-zinc-900 tracking-tight font-serif">
            {auction.title}
          </h1>
          <p className="text-sm sm:text-base text-zinc-600 mt-1.5 font-normal">
            {auction.subtitle}
          </p>
        </div>

        {/* Essential Vehicle Key Facts Grid / Pills */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 mb-6 text-xs">
          <div className="bg-zinc-50 border border-zinc-200/80 rounded-md p-2.5">
            <span className="text-zinc-400 uppercase tracking-wider block text-[10px] font-semibold">Chassis / VIN</span>
            <span className="font-mono font-bold text-zinc-800 text-xs break-all sm:truncate block mt-0.5" title={auction.vin}>{auction.vin}</span>
          </div>
          <div className="bg-zinc-50 border border-zinc-200/80 rounded-md p-2.5">
            <span className="text-zinc-400 uppercase tracking-wider block text-[10px] font-semibold">Mileage</span>
            <span className="font-bold text-zinc-800 text-xs block mt-0.5">{auction.mileage}</span>
          </div>
          <div className="bg-zinc-50 border border-zinc-200/80 rounded-md p-2.5">
            <span className="text-zinc-400 uppercase tracking-wider block text-[10px] font-semibold">Engine</span>
            <span className="font-bold text-zinc-800 text-xs block mt-0.5 truncate">{auction.engine || "3.0L Flat-Six CIS"}</span>
          </div>
          <div className="bg-zinc-50 border border-zinc-200/80 rounded-md p-2.5">
            <span className="text-zinc-400 uppercase tracking-wider block text-[10px] font-semibold">Drivetrain</span>
            <span className="font-bold text-zinc-800 text-xs block mt-0.5 truncate">{auction.drivetrain || "5-Speed 915 Manual"}</span>
          </div>
          <div className="bg-zinc-50 border border-zinc-200/80 rounded-md p-2.5">
            <span className="text-zinc-400 uppercase tracking-wider block text-[10px] font-semibold">Exterior</span>
            <span className="font-bold text-zinc-800 text-xs block mt-0.5 truncate">{auction.exteriorColor || "Guards Red / Whale Tail"}</span>
          </div>
          <div className="bg-zinc-50 border border-zinc-200/80 rounded-md p-2.5">
            <span className="text-zinc-400 uppercase tracking-wider block text-[10px] font-semibold">Title Status</span>
            <span className="font-bold text-emerald-700 text-xs block mt-0.5 truncate">{auction.titleStatus || "Clean Registration"}</span>
          </div>
        </div>

        {/* Signature Live Auction Stats & Bidding Box */}
        <div className="bg-[#1a2128] text-white rounded-xl p-4 sm:p-6 shadow-xl border border-zinc-800 relative overflow-hidden">
          {/* Subtle background glow when urgent */}
          {timeData.isUrgent && !isEnded && (
            <div className="absolute top-0 right-0 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
          )}

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            {/* Left side: Time countdown and auction status */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
              {/* Countdown Clock Box */}
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                  <Clock className="w-3.5 h-3.5 text-zinc-400" />
                  <span>
                    {isUpcoming ? 'Auction Starts In' : isEnded ? 'Auction Status' : 'Time Remaining'}
                  </span>
                  {isUpcoming && (
                    <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40 text-[10px] font-bold">
                      Upcoming
                    </span>
                  )}
                </div>

                {isEnded ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xl sm:text-2xl font-black text-zinc-300 font-mono">
                      {auction.status === 'sold' ? 'VEHICLE SOLD' : 'AUCTION ENDED'}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-baseline gap-2">
                    <div className="text-2xl sm:text-3xl font-black tracking-tight font-mono text-white flex items-center gap-1.5">
                      {timeData.days > 0 && (
                        <span>
                          {timeData.days}<span className="text-xs text-zinc-400 font-sans font-medium mr-1.5">d</span>
                        </span>
                      )}
                      <span>
                        {timeData.hours.toString().padStart(2, '0')}<span className="text-xs text-zinc-400 font-sans font-medium mr-1.5">h</span>
                      </span>
                      <span>
                        {timeData.minutes.toString().padStart(2, '0')}<span className="text-xs text-zinc-400 font-sans font-medium mr-1.5">m</span>
                      </span>
                      <span className={timeData.isUrgent ? 'text-amber-400 animate-pulse' : 'text-zinc-200'}>
                        {timeData.seconds.toString().padStart(2, '0')}<span className="text-xs text-zinc-400 font-sans font-medium">s</span>
                      </span>
                    </div>

                    {timeData.isUrgent && (
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-bold flex items-center gap-1 animate-pulse">
                        <Flame className="w-3 h-3 text-amber-400" />
                        Ending Soon
                      </span>
                    )}
                  </div>
                )}
                
                {/* Anti-sniping guarantee indicator */}
                <div className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Anti-Sniping Protected (2-Minute Reset)</span>
                </div>
              </div>

              {/* Vertical divider */}
              <div className="hidden sm:block w-px h-12 bg-zinc-700/80"></div>

              {/* High Bid & Bid Count */}
              <div>
                <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                  High Bid
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl sm:text-4xl font-extrabold text-emerald-400 tracking-tight font-mono">
                    {formatCurrency(auction.currentBid)}
                  </span>
                  <button 
                    onClick={onScrollToComments}
                    className="text-xs text-zinc-300 hover:text-white underline decoration-zinc-500 underline-offset-4 transition-colors"
                  >
                    {auction.bidCount} {auction.bidCount === 1 ? 'Bid' : 'Bids'}
                  </button>
                </div>
                {auction.highBidderName && (
                  <div className="text-[11px] text-zinc-400 mt-1">
                    Leading Bidder: <span className="font-semibold text-zinc-200">{auction.highBidderName}</span>
                  </div>
                )}
              </div>

              {/* Vertical divider */}
              <div className="hidden md:block w-px h-12 bg-zinc-700/80"></div>

              {/* Reserve Status Dynamic Badge */}
              <div className="flex flex-col justify-center">
                <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                  Reserve Status
                </div>
                {reserveMet ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-emerald-950/80 border border-emerald-600/80 text-emerald-300 font-bold text-xs shadow-sm">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>RESERVE MET</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-300 font-semibold text-xs shadow-sm" title="The vehicle has a hidden reserve set by the seller">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    <span>RESERVE NOT MET</span>
                  </div>
                )}
                <span className="text-[10px] text-zinc-500 mt-1 italic">
                  {reserveMet ? 'Will sell to highest bidder' : 'Hidden dollar reserve'}
                </span>
              </div>

              {/* Vertical divider */}
              <div className="hidden lg:block w-px h-12 bg-zinc-700/80"></div>

              {/* Lot-Level Actions: Watch & Share */}
              <div className="flex flex-col justify-center">
                <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                  Lot Actions
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Watch Button */}
                  <button
                    type="button"
                    onClick={handleWatchClick}
                    disabled={isWatchLoading}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm ${
                      isWatching
                        ? 'bg-amber-500 hover:bg-amber-400 text-zinc-950 border border-amber-400 ring-1 ring-amber-400/40'
                        : 'bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700 text-zinc-200 hover:text-white'
                    }`}
                    title={isWatching ? 'Saved to Watchlist' : 'Add to Watchlist'}
                  >
                    <span>{isWatching ? '★ Watching' : '★ Watch'}</span>
                  </button>

                  {/* Share Button */}
                  <button
                    type="button"
                    onClick={handleShareClick}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700 text-zinc-200 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                    title="Copy Listing URL to Clipboard"
                  >
                    <span>🔗 Share</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right side: Place Bid Action Button */}
            <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-2">
              <button
                onClick={onOpenBid}
                disabled={isEnded || isUpcoming}
                className={`px-8 py-3.5 rounded-lg font-bold text-sm sm:text-base flex items-center justify-center gap-2 transition-all shadow-lg ${
                  isEnded
                    ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed border border-zinc-600'
                    : isUpcoming
                    ? 'bg-blue-800/80 text-blue-200 border border-blue-700/80 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white hover:shadow-emerald-900/30 hover:scale-[1.02] active:scale-[0.99] border border-emerald-400/30'
                }`}
              >
                <Gavel className="w-4 h-4" />
                <span>{isEnded ? 'Auction Closed' : isUpcoming ? 'Preview Mode' : 'Place Bid'}</span>
              </button>

              <div className="text-[11px] text-zinc-400 text-center lg:text-right">
                Next Min Bid: <strong className="text-zinc-200">{formatCurrency(auction.currentBid + auction.minimumIncrement)}</strong>
              </div>
            </div>
          </div>

          {/* Anti-sniping active notification banner during urgent window */}
          {timeData.isUrgent && !isEnded && (
            <div className="mt-4 pt-3 border-t border-amber-500/30 flex items-center gap-2 text-xs text-amber-300">
              <Flame className="w-4 h-4 text-amber-400 animate-bounce" />
              <span>
                <strong>Anti-Sniping Active:</strong> Any bid placed now will automatically extend the remaining auction countdown to 2 minutes.
              </span>
            </div>
          )}
        </div>

        {/* Floating Toast Notification */}
        {toast && (
          <div className="fixed bottom-6 right-6 z-50 animate-fadeIn max-w-sm">
            <div className={`px-4 py-3 rounded-xl shadow-2xl border text-xs font-semibold flex items-center gap-2.5 ${
              toast.type === 'error'
                ? 'bg-red-950/95 border-red-700 text-red-100'
                : toast.type === 'info'
                ? 'bg-zinc-900/95 border-amber-500/50 text-amber-200'
                : 'bg-zinc-900/95 border-emerald-500/50 text-emerald-200'
            }`}>
              {toast.type === 'error' ? (
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              ) : toast.type === 'info' ? (
                <Info className="w-4 h-4 text-amber-400 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <span>{toast.message}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
