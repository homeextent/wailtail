import React, { useState } from 'react';
import { Auction } from '../types';
import { formatCurrency } from '../utils/formatters';
import { CatalogCard } from './CatalogCard';
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
  Tag
} from 'lucide-react';

interface VehicleCatalogGridProps {
  auctions: Auction[];
  activeAuctionId: string;
  onSelectAuction: (auctionId: string) => void;
  onOpenListingEditor?: (auctionId: string) => void;
  onOpenNewListingModal?: () => void;
  onOpenConsignmentModal?: () => void;
  isAdmin?: boolean;
}

export const isLive = (status?: string | null): boolean =>
  status === 'live' || status === 'ending_soon' || status === 'active';

export const isUpcoming = (status?: string | null): boolean =>
  status === 'upcoming' || status === 'preview' || status === 'draft' || !status;

export const isEnded = (status?: string | null): boolean =>
  status === 'ended' || status === 'sold' || status === 'reserve_not_met';

export const VehicleCatalogGrid: React.FC<VehicleCatalogGridProps> = ({
  auctions,
  activeAuctionId,
  onSelectAuction,
  onOpenListingEditor,
  onOpenNewListingModal,
  onOpenConsignmentModal,
  isAdmin = false
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'live' | 'upcoming' | 'ended'>('all');

  const filteredAuctions = auctions.filter((lot) => {
    if (filterStatus === 'live' && !isLive(lot.status)) return false;
    if (filterStatus === 'upcoming' && !isUpcoming(lot.status)) return false;
    if (filterStatus === 'ended' && !isEnded(lot.status)) return false;

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

  return (
    <div className="w-full bg-[#f8f9fa] text-zinc-900 py-8 px-4 sm:px-6 lg:px-8">
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
                All Lots ({auctions.length})
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
                Live ({auctions.filter((a) => isLive(a.status)).length})
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
                Upcoming ({auctions.filter((a) => isUpcoming(a.status)).length})
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
                Ended ({auctions.filter((a) => isEnded(a.status)).length})
              </button>
            </div>
          </div>
        </div>

        {/* Vehicle Catalog Grid */}
        {filteredAuctions.length === 0 ? (
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
              className="mt-2 px-4 py-2 rounded-lg text-xs font-bold bg-zinc-900 text-white hover:bg-zinc-800 transition-colors"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAuctions.map((lot) => (
              <CatalogCard
                key={lot.id}
                lot={lot}
                isActive={lot.id === activeAuctionId}
                onSelectAuction={onSelectAuction}
                onOpenListingEditor={onOpenListingEditor}
                onOpenConsignmentModal={onOpenConsignmentModal}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
