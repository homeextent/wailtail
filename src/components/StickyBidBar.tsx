import React, { useState, useEffect } from 'react';
import { Auction } from '../types';
import { formatCurrency, formatAuctionCountdown } from '../utils/formatters';
import { Gavel, Clock, CheckCircle2, AlertTriangle, Car } from 'lucide-react';

interface StickyBidBarProps {
  auction: Auction;
  thumbnailUrl?: string;
  onOpenBid: () => void;
}

export const StickyBidBar: React.FC<StickyBidBarProps> = ({
  auction,
  thumbnailUrl,
  onOpenBid
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      // Show sticky bar after scrolling past top 450px
      if (window.scrollY > 450) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (!isVisible) return null;

  const timeData = formatAuctionCountdown(auction.startTime, auction.endTime, auction.status, now);
  const isEnded = timeData.isEnded;
  const isUpcoming = timeData.isUpcoming;
  const reserveMet = Boolean(auction.isReserveMet || auction.currentBid >= auction.reserveAmount);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 bg-[#121619]/95 backdrop-blur-md border-t border-zinc-700 shadow-2xl text-white py-2.5 px-4 animate-in slide-in-from-bottom duration-300">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Left: Thumbnail & Title */}
        <div className="flex items-center gap-3 min-w-0">
          {thumbnailUrl && thumbnailUrl.trim() !== '' ? (
            <img
              src={thumbnailUrl}
              alt={auction.title}
              className="w-12 h-9 rounded object-cover border border-zinc-700 hidden sm:block flex-shrink-0"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-12 h-9 rounded bg-zinc-800 border border-zinc-700 hidden sm:flex items-center justify-center flex-shrink-0 text-zinc-500">
              <Car className="w-5 h-5" />
            </div>
          )}
          <div className="truncate">
            <h3 className="text-xs sm:text-sm font-bold text-zinc-100 truncate">
              {auction.title}
            </h3>
            <div className="flex items-center gap-2 text-[11px] text-zinc-400">
              <span className="flex items-center gap-1 font-mono text-zinc-300">
                <Clock className="w-3 h-3 text-zinc-400" />
                {timeData.formatted}
              </span>
              <span>•</span>
              <span className="text-zinc-300">{auction.bidCount} Bids</span>
            </div>
          </div>
        </div>

        {/* Middle: Reserve Met badge (hidden on tiny screens) */}
        <div className="hidden md:flex items-center">
          {reserveMet ? (
            <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-600/80 text-emerald-300 text-[11px] font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              RESERVE MET
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 text-[11px] font-semibold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              RESERVE NOT MET
            </span>
          )}
        </div>

        {/* Right: High Bid + Bid Button */}
        <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
          <div className="text-right">
            <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">
              Current Bid
            </div>
            <div className="text-base sm:text-xl font-black text-emerald-400 font-mono">
              {formatCurrency(auction.currentBid)}
            </div>
          </div>

          <button
            onClick={onOpenBid}
            disabled={isEnded || isUpcoming}
            className={`px-4 sm:px-6 py-2 rounded-lg font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-md transition-all ${
              isEnded
                ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                : isUpcoming
                ? 'bg-blue-800 text-blue-300 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white hover:scale-105 active:scale-95'
            }`}
          >
            <Gavel className="w-4 h-4" />
            <span>{isEnded ? 'Ended' : isUpcoming ? 'Upcoming' : 'Place Bid'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
