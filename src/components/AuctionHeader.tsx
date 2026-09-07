import React, { useState, useEffect } from 'react';
import { Auction } from '../types';
import { formatCurrency, formatAuctionCountdown } from '../utils/formatters';
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
  Radio
} from 'lucide-react';

interface AuctionHeaderProps {
  auction: Auction;
  onOpenBid: () => void;
  onScrollToComments: () => void;
}

export const AuctionHeader: React.FC<AuctionHeaderProps> = ({
  auction,
  onOpenBid,
  onScrollToComments
}) => {
  const [now, setNow] = useState(Date.now());

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
      </div>
    </div>
  );
};
