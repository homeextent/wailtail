import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  fetchUserActivitySummary, 
  fetchUserWatchlist,
  toggleWatchlistLot,
  MAIN_AUCTION_ID 
} from '../services/auctionService';
import { 
  UserProfile,
  UserActivitySummary, 
  UserBidActivity, 
  UserWonAuction, 
  UserSellerListing, 
  UserConsignmentItem,
  Auction
} from '../types';
import { formatCurrency, formatAuctionCountdown } from '../utils/formatters';
import { 
  X, 
  User as UserIcon, 
  ShieldCheck, 
  Tag, 
  Gavel, 
  Car, 
  FileText, 
  ExternalLink, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Mail, 
  Phone, 
  MapPin, 
  ArrowRight, 
  Sparkles, 
  RefreshCw, 
  Award, 
  DollarSign, 
  ClipboardList,
  Bookmark
} from 'lucide-react';

export interface UserAccountHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'bids' | 'seller' | 'consignments' | 'listings' | 'watchlist';
  userProfile?: UserProfile | null;
  onNavigateToAuction?: (auctionId: string) => void;
  onOpenListingEditor?: (auctionId: string) => void;
  onOpenBidModal?: (auctionId: string) => void;
  onOpenConsignmentModal?: () => void;
  onBrowseCatalog?: () => void;
}

export const UserAccountHubModal: React.FC<UserAccountHubModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'bids',
  userProfile: userProfileProp,
  onNavigateToAuction,
  onOpenListingEditor,
  onOpenBidModal,
  onOpenConsignmentModal,
  onBrowseCatalog
}) => {
  const { user, userProfile: contextProfile, isAdmin: contextAdmin, isSeller: contextSeller } = useAuth();
  const userProfile = userProfileProp !== undefined ? userProfileProp : contextProfile;
  const isAdmin = Boolean(contextAdmin || userProfile?.role?.toLowerCase() === 'admin');
  const isSeller = Boolean(contextSeller || userProfile?.role?.toLowerCase() === 'seller');
  const [activeTab, setActiveTab] = useState<'bids' | 'watchlist' | 'seller' | 'consignments'>(
    initialTab === 'listings' ? 'seller' : (initialTab as any)
  );
  const [summary, setSummary] = useState<UserActivitySummary>({
    activeBids: [],
    wonAuctions: [],
    sellerListings: [],
    consignments: []
  });
  const [watchlistItems, setWatchlistItems] = useState<Auction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Sync tab when initialTab prop changes
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab === 'listings' ? 'seller' : (initialTab as any));
    }
  }, [initialTab, isOpen]);

  // Load activity summary and saved watchlist from service
  const loadActivity = async (isManualRefresh = false) => {
    if (!user) return;
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [data, watchlistData] = await Promise.all([
        fetchUserActivitySummary(user.uid, user.email || ''),
        fetchUserWatchlist(user.uid)
      ]);
      setSummary(data);
      setWatchlistItems(watchlistData);
    } catch (err) {
      console.error('Failed to load user activity summary:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isOpen && user) {
      loadActivity();
    }
  }, [isOpen, user?.uid, user?.email]);

  // Lock underlying viewport scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow || '';
      };
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Determine user role label and badge style
  const roleDisplay = useMemo(() => {
    if (isAdmin || userProfile?.role?.toUpperCase() === 'ADMIN') {
      return {
        label: 'ADMIN',
        badgeClass: 'bg-red-950/80 text-red-300 border-red-800/80'
      };
    }
    if (isSeller || userProfile?.role?.toUpperCase() === 'SELLER' || summary.sellerListings.length > 0) {
      return {
        label: 'SELLER',
        badgeClass: 'bg-amber-950/80 text-amber-300 border-amber-800/80'
      };
    }
    return {
      label: 'BIDDER',
      badgeClass: 'bg-sky-950/80 text-sky-300 border-sky-800/80'
    };
  }, [isAdmin, isSeller, userProfile?.role, summary.sellerListings.length]);

  // Tab visibility rules:
  // - Tab 1: My Bids & Activity: Always visible
  // - Tab 2: My Vehicle Listings: Visible if role === 'SELLER' or role === 'ADMIN' or user has created listings
  // - Tab 3: Consignment Requests: Visible if user has submitted consignment inquiries or is seller/admin
  const showSellerTab = Boolean(
    isAdmin || 
    isSeller || 
    userProfile?.role?.toUpperCase() === 'SELLER' || 
    summary.sellerListings.length > 0
  );

  const showConsignmentsTab = Boolean(
    summary.consignments.length > 0 || 
    isAdmin || 
    isSeller || 
    userProfile?.role?.toUpperCase() === 'SELLER'
  );

  if (!isOpen) return null;

  const displayName = userProfile?.displayName || user?.displayName || (user?.email ? user.email.split('@')[0] : 'Member');
  const userEmail = userProfile?.email || user?.email || '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto animate-fadeIn">
      {/* Click outside to close backdrop */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Main Account Hub Modal Container */}
      <div 
        className="relative z-10 bg-slate-900 text-white rounded-2xl max-w-4xl w-full max-h-[90vh] mx-auto border border-slate-800 shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Section */}
        <div className="bg-slate-950/90 border-b border-slate-800/90 px-4 sm:px-6 py-4 sm:py-5 flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            {/* User Profile Info */}
            <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-tr from-amber-600 to-amber-400 text-black font-black flex items-center justify-center text-base sm:text-lg shadow-inner ring-2 ring-amber-400/30 flex-shrink-0 uppercase">
                {displayName.charAt(0) || 'U'}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base sm:text-xl font-black tracking-tight text-white truncate">
                    {displayName}
                  </h2>
                  <span className={`px-2.5 py-0.5 text-[10px] font-mono font-bold tracking-wider rounded border uppercase ${roleDisplay.badgeClass}`}>
                    {roleDisplay.label}
                  </span>
                </div>
                <p className="text-xs text-slate-400 truncate mt-0.5 font-mono">
                  {userEmail}
                </p>
              </div>
            </div>

            {/* Top Right Controls */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              <button
                onClick={() => loadActivity(true)}
                disabled={loading || refreshing}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                title="Refresh Activity"
                aria-label="Refresh Activity"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-amber-400' : ''}`} />
              </button>
              <button
                onClick={onClose}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                title="Close Modal"
                aria-label="Close Modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Dynamic Tab Navigation Bar - horizontally scrollable without awkward wrapping */}
          <div className="flex items-center gap-2 mt-4 sm:mt-5 border-b border-slate-800 -mb-4 sm:-mb-5 overflow-x-auto whitespace-nowrap scrollbar-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pb-2 sm:pb-0">
            <button
              onClick={() => setActiveTab('bids')}
              className={`min-h-[44px] pb-3 px-3 sm:px-4 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap cursor-pointer flex-shrink-0 ${
                activeTab === 'bids'
                  ? 'border-amber-400 text-amber-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Gavel className="w-4 h-4" />
              <span>My Bids & Activity</span>
              {summary.activeBids.length > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-mono rounded-full bg-amber-400/20 text-amber-300 font-semibold">
                  {summary.activeBids.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('watchlist')}
              className={`min-h-[44px] pb-3 px-3 sm:px-4 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap cursor-pointer flex-shrink-0 ${
                activeTab === 'watchlist'
                  ? 'border-amber-400 text-amber-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Bookmark className="w-4 h-4" />
              <span>Watchlist</span>
              {watchlistItems.length > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-mono rounded-full bg-amber-400/20 text-amber-300 font-semibold">
                  {watchlistItems.length}
                </span>
              )}
            </button>

            {showSellerTab && (
              <button
                onClick={() => setActiveTab('seller')}
                className={`min-h-[44px] pb-3 px-3 sm:px-4 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap cursor-pointer flex-shrink-0 ${
                  activeTab === 'seller'
                    ? 'border-amber-400 text-amber-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Car className="w-4 h-4" />
                <span>My Vehicle Listings</span>
                {summary.sellerListings.length > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-mono rounded-full bg-slate-800 text-slate-300 font-semibold">
                    {summary.sellerListings.length}
                  </span>
                )}
              </button>
            )}

            {showConsignmentsTab && (
              <button
                onClick={() => setActiveTab('consignments')}
                className={`min-h-[44px] pb-3 px-3 sm:px-4 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap cursor-pointer flex-shrink-0 ${
                  activeTab === 'consignments'
                    ? 'border-amber-400 text-amber-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <ClipboardList className="w-4 h-4" />
                <span>Consignment Requests</span>
                {summary.consignments.length > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-mono rounded-full bg-slate-800 text-slate-300 font-semibold">
                    {summary.consignments.length}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {loading ? (
            /* Async Loading Skeletons */
            <div className="space-y-4 animate-pulse">
              <div className="h-6 w-48 bg-slate-800 rounded mb-4" />
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/50 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                  <div className="w-full sm:w-24 h-24 sm:h-18 bg-slate-700 rounded-lg flex-shrink-0" />
                  <div className="flex-1 space-y-2 w-full">
                    <div className="h-4 bg-slate-700 rounded w-3/4" />
                    <div className="h-3 bg-slate-700 rounded w-1/2" />
                    <div className="h-3 bg-slate-700 rounded w-1/4" />
                  </div>
                  <div className="w-full sm:w-28 h-10 bg-slate-700 rounded-lg" />
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* TAB 1: BIDS & ACTIVITY */}
              {activeTab === 'bids' && (
                <div className="space-y-8">
                  {/* Section 1: Active Bids */}
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-4">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-amber-400" />
                        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                          Active Bids ({summary.activeBids.length})
                        </h3>
                      </div>
                      <span className="text-xs text-slate-500 font-mono">
                        CAD Currency • No Buyer's Premium
                      </span>
                    </div>

                    {summary.activeBids.length === 0 ? (
                      /* Zero-State Callout for Active Bids */
                      <div className="p-8 rounded-xl bg-slate-800/40 border border-slate-800 text-center space-y-3">
                        <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                          <Gavel className="w-6 h-6 text-slate-400" />
                        </div>
                        <h4 className="text-base font-bold text-white">No active bids yet</h4>
                        <p className="text-xs text-slate-400 max-w-md mx-auto">
                          You are not currently competing in any live vehicle auctions. Explore our curated collector inventory and place your opening bid.
                        </p>
                        {onBrowseCatalog && (
                          <div className="pt-2">
                            <button
                              onClick={() => {
                                onClose();
                                onBrowseCatalog();
                              }}
                              className="min-h-[44px] px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                            >
                              <span>Browse Live Auctions</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {summary.activeBids.map((bid) => {
                          const isLeading = bid.status === 'LEADING';
                          const countdown = formatAuctionCountdown(Date.now() - 3600000, bid.endTime, 'active');

                          return (
                            <div
                              key={bid.auctionId}
                              className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                                isLeading
                                  ? 'bg-slate-800/70 border-emerald-500/40 shadow-sm'
                                  : 'bg-slate-800/40 border-rose-500/40'
                              }`}
                            >
                              {/* Hero Thumbnail & Info */}
                              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3.5 min-w-0 w-full sm:w-auto">
                                {bid.auctionHeroImage ? (
                                  <img
                                    src={bid.auctionHeroImage}
                                    alt={bid.auctionTitle}
                                    className="w-full sm:w-24 h-36 sm:h-16 rounded-lg object-cover bg-slate-950 flex-shrink-0 border border-slate-700"
                                    onError={(e) => {
                                      (e.target as HTMLElement).style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  <div className="w-full sm:w-24 h-24 sm:h-16 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0 text-slate-500">
                                    <Car className="w-6 h-6" />
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <span
                                      className={`px-2 py-0.5 text-[10px] font-black tracking-wider rounded-md border uppercase flex items-center gap-1 ${
                                        isLeading
                                          ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/50'
                                          : 'bg-rose-950/90 text-rose-300 border-rose-500/50'
                                      }`}
                                    >
                                      <span
                                        className={`w-1.5 h-1.5 rounded-full ${
                                          isLeading ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                                        }`}
                                      />
                                      {bid.status}
                                    </span>
                                    <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                                      <Clock className="w-3 h-3 text-slate-500" />
                                      {countdown.formatted}
                                    </span>
                                  </div>

                                  <h4 
                                    onClick={() => {
                                      onClose();
                                      if (onNavigateToAuction) onNavigateToAuction(bid.auctionId);
                                    }}
                                    className="text-sm font-bold text-white hover:text-amber-300 transition-colors cursor-pointer truncate"
                                    title={bid.auctionTitle}
                                  >
                                    {bid.auctionTitle}
                                  </h4>

                                  <div className="flex items-center gap-2 sm:gap-3 text-xs text-slate-400 mt-1 flex-wrap">
                                    <span>
                                      Your Bid: <strong className="text-white font-mono">{formatCurrency(bid.userHighestBid)}</strong>
                                    </span>
                                    <span className="hidden sm:inline">•</span>
                                    <span>
                                      High Bid: <strong className="text-amber-400 font-mono">{formatCurrency(bid.currentHighBid)}</strong>
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Quick Action Button */}
                              <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-shrink-0">
                                <button
                                  onClick={() => {
                                    onClose();
                                    if (onOpenBidModal) {
                                      onOpenBidModal(bid.auctionId);
                                    } else if (onNavigateToAuction) {
                                      onNavigateToAuction(bid.auctionId);
                                    }
                                  }}
                                  className={`min-h-[44px] px-4 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 w-full sm:w-auto cursor-pointer shadow-sm ${
                                    isLeading
                                      ? 'bg-slate-700 hover:bg-slate-600 text-white'
                                      : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/40'
                                  }`}
                                >
                                  <span>{isLeading ? 'Manage Bid →' : 'Increase Bid →'}</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Section 2: Won Auctions & Settlement Checklist */}
                  <div className="pt-2 border-t border-slate-800/80">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-4">
                      <div className="flex items-center gap-2">
                        <Award className="w-4 h-4 text-emerald-400" />
                        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                          Won Auctions & Settlement ({summary.wonAuctions.length})
                        </h3>
                      </div>
                      <span className="text-xs text-emerald-400 font-mono">
                        Official Buyer Handoff Checklist
                      </span>
                    </div>

                    {summary.wonAuctions.length === 0 ? (
                      <div className="p-6 rounded-xl bg-slate-800/25 border border-slate-800 text-center text-xs text-slate-400">
                        No won auctions yet. When you win an auction with the reserve met, your CAD settlement checklist and seller contact credentials will appear here.
                      </div>
                    ) : (
                      <div className="space-y-5">
                        {summary.wonAuctions.map((won) => (
                          <div
                            key={won.auctionId}
                            className="p-4 sm:p-5 rounded-xl bg-gradient-to-b from-emerald-950/20 to-slate-900 border border-emerald-600/40 shadow-lg space-y-4"
                          >
                            {/* Vehicle Winning Header */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                                {won.auctionHeroImage ? (
                                  <img
                                    src={won.auctionHeroImage}
                                    alt={won.auctionTitle}
                                    className="w-full sm:w-20 h-32 sm:h-14 rounded-lg object-cover bg-slate-950 border border-emerald-500/30 flex-shrink-0"
                                  />
                                ) : (
                                  <div className="w-full sm:w-20 h-20 sm:h-14 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 text-emerald-400">
                                    <Car className="w-5 h-5" />
                                  </div>
                                )}
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500 text-slate-950 uppercase tracking-wide">
                                      AUCTION WON
                                    </span>
                                    {won.vin && (
                                      <span className="text-[11px] font-mono text-slate-400">
                                        VIN: {won.vin}
                                      </span>
                                    )}
                                  </div>
                                  <h4 className="text-sm sm:text-base font-bold text-white mt-0.5">
                                    {won.auctionTitle}
                                  </h4>
                                </div>
                              </div>

                              <div className="text-left sm:text-right sm:flex-shrink-0">
                                <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                                  Final Hammer Price
                                </span>
                                <span className="text-base sm:text-lg font-black font-mono text-emerald-400">
                                  {formatCurrency(won.winningBid)} CAD
                                </span>
                              </div>
                            </div>

                            {/* Seller Contact Info Card */}
                            <div className="p-3.5 rounded-lg bg-slate-800/60 border border-slate-700/60 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div>
                                <span className="text-slate-400 font-semibold block text-[11px]">
                                  Seller Contact Info:
                                </span>
                                <span className="text-white font-bold text-sm">
                                  {won.sellerName}
                                </span>
                                {won.location && (
                                  <span className="text-slate-400 text-xs ml-0 sm:ml-2 block sm:inline">
                                    ({won.location})
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
                                {won.sellerEmail && (
                                  <a
                                    href={`mailto:${won.sellerEmail}?subject=Wailtail Settlement: ${won.auctionTitle}`}
                                    className="min-h-[44px] px-3.5 py-2 rounded-md bg-slate-700 hover:bg-slate-600 text-white font-medium flex items-center justify-center gap-1.5 transition-colors"
                                  >
                                    <Mail className="w-3.5 h-3.5 text-amber-400" />
                                    <span>Email Seller</span>
                                  </a>
                                )}
                                {won.sellerPhone && (
                                  <a
                                    href={`tel:${won.sellerPhone}`}
                                    className="min-h-[44px] px-3.5 py-2 rounded-md bg-slate-700 hover:bg-slate-600 text-white font-medium flex items-center justify-center gap-1.5 transition-colors"
                                  >
                                    <Phone className="w-3.5 h-3.5 text-emerald-400" />
                                    <span>Call Seller</span>
                                  </a>
                                )}
                              </div>
                            </div>

                            {/* Step-by-Step Offline CAD Settlement Checklist */}
                            <div>
                              <h5 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Step-by-Step CAD Settlement Checklist</span>
                              </h5>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                                <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 flex gap-2.5">
                                  <span className="w-5 h-5 rounded-full bg-emerald-950 text-emerald-400 font-mono font-bold text-[11px] flex items-center justify-center flex-shrink-0 border border-emerald-600/40">
                                    1
                                  </span>
                                  <div>
                                    <strong className="text-white block font-semibold">
                                      Bank Wire / Certified Draft
                                    </strong>
                                    <span className="text-slate-400 text-[11px] leading-tight">
                                      Remit {formatCurrency(won.winningBid)} CAD directly to seller or designated escrow within 3 business days. No buyer fees added.
                                    </span>
                                  </div>
                                </div>

                                <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 flex gap-2.5">
                                  <span className="w-5 h-5 rounded-full bg-emerald-950 text-emerald-400 font-mono font-bold text-[11px] flex items-center justify-center flex-shrink-0 border border-emerald-600/40">
                                    2
                                  </span>
                                  <div>
                                    <strong className="text-white block font-semibold">
                                      Title & Bill of Sale
                                    </strong>
                                    <span className="text-slate-400 text-[11px] leading-tight">
                                      Execute signed provincial transfer forms and obtain vehicle ownership slip in buyer's name.
                                    </span>
                                  </div>
                                </div>

                                <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 flex gap-2.5">
                                  <span className="w-5 h-5 rounded-full bg-emerald-950 text-emerald-400 font-mono font-bold text-[11px] flex items-center justify-center flex-shrink-0 border border-emerald-600/40">
                                    3
                                  </span>
                                  <div>
                                    <strong className="text-white block font-semibold">
                                      Transport / Collection
                                    </strong>
                                    <span className="text-slate-400 text-[11px] leading-tight">
                                      Coordinate enclosed carrier dispatch or schedule local in-person pickup with seller.
                                    </span>
                                  </div>
                                </div>

                                <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 flex gap-2.5">
                                  <span className="w-5 h-5 rounded-full bg-emerald-950 text-emerald-400 font-mono font-bold text-[11px] flex items-center justify-center flex-shrink-0 border border-emerald-600/40">
                                    4
                                  </span>
                                  <div>
                                    <strong className="text-white block font-semibold">
                                      VIN Check & Key Handover
                                    </strong>
                                    <span className="text-slate-400 text-[11px] leading-tight">
                                      Verify VIN stamping upon vehicle release and complete transfer of keys and service records.
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Deep link to auction view */}
                            <div className="pt-2 flex justify-end">
                              <button
                                onClick={() => {
                                  onClose();
                                  if (onNavigateToAuction) onNavigateToAuction(won.auctionId);
                                }}
                                className="min-h-[44px] px-3 py-2 text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                              >
                                <span>View Completed Auction Lot →</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB: WATCHLIST */}
              {activeTab === 'watchlist' && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
                    <div className="flex items-center gap-2">
                      <Bookmark className="w-4 h-4 text-amber-400" />
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                        Saved Watchlist ({watchlistItems.length})
                      </h3>
                    </div>
                    <span className="text-xs text-slate-500 font-mono">
                      CAD Currency • Live Vehicle Lots
                    </span>
                  </div>

                  {watchlistItems.length === 0 ? (
                    /* Zero-State Callout for Watchlist */
                    <div className="p-8 rounded-xl bg-slate-800/40 border border-slate-800 text-center space-y-3">
                      <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-amber-400">
                        <Bookmark className="w-6 h-6 text-amber-400" />
                      </div>
                      <h4 className="text-base font-bold text-white">No saved vehicles in your watchlist</h4>
                      <p className="text-xs text-slate-400 max-w-md mx-auto">
                        No saved vehicles in your watchlist — Browse Live Catalog to follow auctions, track CAD high bids, and get live ending alerts.
                      </p>
                      {onBrowseCatalog && (
                        <div className="pt-2">
                          <button
                            onClick={() => {
                              onClose();
                              onBrowseCatalog();
                            }}
                            className="min-h-[44px] px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                          >
                            <span>Browse Live Catalog</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {watchlistItems.map((lot) => {
                        const countdown = formatAuctionCountdown(
                          lot.startTime,
                          lot.endTime,
                          lot.status,
                          Date.now()
                        );
                        const hero = lot.leadHeroImage || lot.heroImages?.[0];

                        return (
                          <div
                            key={lot.id}
                            className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/60 hover:border-slate-600 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                          >
                            {/* Lead Thumbnail & Details */}
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3.5 min-w-0 w-full sm:w-auto">
                              {hero ? (
                                <img
                                  src={hero}
                                  alt={lot.title}
                                  className="w-full sm:w-28 h-36 sm:h-20 rounded-lg object-cover bg-slate-950 flex-shrink-0 border border-slate-700"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <div className="w-full sm:w-28 h-24 sm:h-20 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0 text-slate-500">
                                  <Car className="w-6 h-6" />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded border bg-amber-950/80 text-amber-300 border-amber-600/40">
                                    {lot.status || 'Active'}
                                  </span>
                                  <span className="text-xs text-slate-400 flex items-center gap-1 font-mono">
                                    <Clock className="w-3 h-3 text-slate-400" />
                                    {countdown.isEnded ? 'Auction Ended' : countdown.formatted}
                                  </span>
                                </div>

                                <h4
                                  onClick={() => {
                                    onClose();
                                    if (onNavigateToAuction) onNavigateToAuction(lot.id);
                                  }}
                                  className="text-sm sm:text-base font-bold text-white hover:text-amber-300 transition-colors cursor-pointer truncate"
                                  title={lot.title}
                                >
                                  {lot.title}
                                </h4>

                                <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 flex-wrap">
                                  <span>
                                    Current Bid: <strong className="text-emerald-400 font-mono">{formatCurrency(lot.currentBid || lot.startingBid)} {lot.currency || 'CAD'}</strong>
                                  </span>
                                  <span>•</span>
                                  <span>
                                    {lot.bidCount || 0} {lot.bidCount === 1 ? 'Bid' : 'Bids'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* View Lot -> Direct Link & Unwatch Button */}
                            <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-shrink-0">
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!user) return;
                                  try {
                                    await toggleWatchlistLot(user.uid, lot.id);
                                    setWatchlistItems((prev) => prev.filter((a) => a.id !== lot.id));
                                  } catch (err) {
                                    console.warn('Could not remove lot from watchlist:', err);
                                  }
                                }}
                                className="min-h-[44px] min-w-[44px] p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer flex items-center justify-center"
                                title="Remove from Watchlist"
                                aria-label="Remove from Watchlist"
                              >
                                <X className="w-4 h-4" />
                              </button>

                              <button
                                onClick={() => {
                                  onClose();
                                  if (onNavigateToAuction) {
                                    onNavigateToAuction(lot.id);
                                  } else {
                                    window.history.pushState({}, '', `/auctions/${lot.id}`);
                                    window.dispatchEvent(new PopStateEvent('popstate'));
                                  }
                                }}
                                className="min-h-[44px] px-4 py-2.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black transition-colors flex items-center justify-center gap-1.5 w-full sm:w-auto cursor-pointer shadow-sm"
                              >
                                <span>View Lot →</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: SELLER LISTINGS */}
              {activeTab === 'seller' && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <Car className="w-4 h-4 text-amber-400" />
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                        Owned Vehicle Listings ({summary.sellerListings.length})
                      </h3>
                    </div>
                    {onOpenConsignmentModal && (
                      <button
                        onClick={() => {
                          onClose();
                          onOpenConsignmentModal();
                        }}
                        className="min-h-[44px] px-3.5 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm w-full sm:w-auto"
                      >
                        <Tag className="w-3.5 h-3.5 text-black" />
                        <span>List New Vehicle</span>
                      </button>
                    )}
                  </div>

                  {summary.sellerListings.length === 0 ? (
                    /* Zero-State Callout for Seller Listings */
                    <div className="p-8 rounded-xl bg-slate-800/40 border border-slate-800 text-center space-y-3">
                      <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                        <Car className="w-6 h-6 text-slate-400" />
                      </div>
                      <h4 className="text-base font-bold text-white">No vehicle listings yet</h4>
                      <p className="text-xs text-slate-400 max-w-md mx-auto">
                        You have not published or drafted any vehicle listings under this account. Consign your classic or sports vehicle today with 0% seller fees.
                      </p>
                      {onOpenConsignmentModal && (
                        <div className="pt-2">
                          <button
                            onClick={() => {
                              onClose();
                              onOpenConsignmentModal();
                            }}
                            className="min-h-[44px] px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                          >
                            <span>Sell Your Vehicle</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {summary.sellerListings.map((listing) => {
                        const statusColors: Record<string, string> = {
                          live: 'bg-emerald-950 text-emerald-300 border-emerald-500/50',
                          active: 'bg-emerald-950 text-emerald-300 border-emerald-500/50',
                          preview: 'bg-zinc-800 text-zinc-300 border-zinc-700',
                          upcoming: 'bg-sky-950 text-sky-300 border-sky-700',
                          ended: 'bg-zinc-900 text-zinc-400 border-zinc-700',
                          sold: 'bg-purple-950 text-purple-300 border-purple-700'
                        };

                        const badgeClass = statusColors[listing.status] || 'bg-slate-800 text-slate-300 border-slate-700';

                        return (
                          <div
                            key={listing.auctionId}
                            className="p-4 rounded-xl bg-slate-800/50 border border-slate-800 hover:border-slate-700 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                          >
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3.5 min-w-0 w-full sm:w-auto">
                              {listing.heroImage ? (
                                <img
                                  src={listing.heroImage}
                                  alt={listing.title}
                                  className="w-full sm:w-24 h-36 sm:h-16 rounded-lg object-cover bg-slate-950 flex-shrink-0 border border-slate-700"
                                />
                              ) : (
                                <div className="w-full sm:w-24 h-24 sm:h-16 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0 text-slate-500">
                                  <Car className="w-6 h-6" />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded border ${badgeClass}`}>
                                    {listing.status}
                                  </span>
                                  <span className="text-xs text-slate-400 font-mono">
                                    {listing.bidCount} {listing.bidCount === 1 ? 'Bid' : 'Bids'}
                                  </span>
                                </div>
                                <h4 className="text-sm font-bold text-white truncate" title={listing.title}>
                                  {listing.title}
                                </h4>
                                <div className="text-xs text-slate-400 mt-1">
                                  Top Bid: <strong className="text-amber-400 font-mono">{formatCurrency(listing.currentBid)} {listing.currency}</strong>
                                </div>
                              </div>
                            </div>

                            {/* Open in Listing Editor Quick Action */}
                            <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-shrink-0">
                              <button
                                onClick={() => {
                                  onClose();
                                  if (onOpenListingEditor) {
                                    onOpenListingEditor(listing.auctionId);
                                  } else {
                                    window.history.pushState({}, '', listing.draftEditUrl);
                                    window.dispatchEvent(new PopStateEvent('popstate'));
                                  }
                                }}
                                className="min-h-[44px] px-4 py-2.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black transition-colors flex items-center justify-center gap-1.5 w-full sm:w-auto cursor-pointer shadow-sm"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                <span>Open in Listing Editor →</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: CONSIGNMENT REQUESTS */}
              {activeTab === 'consignments' && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="w-4 h-4 text-amber-400" />
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                        Consignment Submissions ({summary.consignments.length})
                      </h3>
                    </div>
                    {onOpenConsignmentModal && (
                      <button
                        onClick={() => {
                          onClose();
                          onOpenConsignmentModal();
                        }}
                        className="min-h-[44px] px-3.5 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm w-full sm:w-auto"
                      >
                        <Tag className="w-3.5 h-3.5 text-black" />
                        <span>Submit Vehicle</span>
                      </button>
                    )}
                  </div>

                  {summary.consignments.length === 0 ? (
                    <div className="p-8 rounded-xl bg-slate-800/40 border border-slate-800 text-center space-y-3">
                      <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                        <ClipboardList className="w-6 h-6 text-slate-400" />
                      </div>
                      <h4 className="text-base font-bold text-white">No consignment requests found</h4>
                      <p className="text-xs text-slate-400 max-w-md mx-auto">
                        Submit an inquiry with your vehicle details and photographs to be evaluated by our auction curation team.
                      </p>
                      {onOpenConsignmentModal && (
                        <div className="pt-2">
                          <button
                            onClick={() => {
                              onClose();
                              onOpenConsignmentModal();
                            }}
                            className="min-h-[44px] px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                          >
                            <span>Consign a Vehicle</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {summary.consignments.map((item) => {
                        const statusBadgeMap: Record<string, { bg: string; text: string }> = {
                          PENDING: { bg: 'bg-amber-950/80 border-amber-600/50', text: 'text-amber-300' },
                          APPROVED: { bg: 'bg-emerald-950/80 border-emerald-600/50', text: 'text-emerald-300' },
                          REJECTED: { bg: 'bg-rose-950/80 border-rose-600/50', text: 'text-rose-300' },
                          REVIEWED: { bg: 'bg-sky-950/80 border-sky-600/50', text: 'text-sky-300' }
                        };
                        const badgeInfo = statusBadgeMap[item.status.toUpperCase()] || {
                          bg: 'bg-slate-800 border-slate-700',
                          text: 'text-slate-300'
                        };

                        const formattedDate = new Date(item.submittedAt).toLocaleDateString('en-CA', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        });

                        return (
                          <div
                            key={item.id}
                            className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                          >
                            <div>
                              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded border uppercase ${badgeInfo.bg} ${badgeInfo.text}`}>
                                  {item.status}
                                </span>
                                <span className="text-xs text-slate-400 font-mono">
                                  Submitted {formattedDate}
                                </span>
                              </div>
                              <h4 className="text-base font-bold text-white">
                                {item.year} {item.make} {item.model} {item.generation ? `(${item.generation})` : ''}
                              </h4>
                              <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 flex-wrap">
                                {item.location && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3 text-slate-500" />
                                    {item.location}
                                  </span>
                                )}
                                {item.reserveExpectation && (
                                  <span>
                                    Reserve: <strong className="text-slate-300">{item.reserveExpectation}</strong>
                                  </span>
                                )}
                              </div>
                            </div>

                            {item.convertedAuctionId && (
                              <div className="flex-shrink-0 w-full sm:w-auto">
                                <button
                                  onClick={() => {
                                    onClose();
                                    if (onOpenListingEditor) {
                                      onOpenListingEditor(item.convertedAuctionId!);
                                    } else {
                                      window.history.pushState({}, '', `/dashboard/listings/${item.convertedAuctionId}/edit`);
                                      window.dispatchEvent(new PopStateEvent('popstate'));
                                    }
                                  }}
                                  className="min-h-[44px] w-full sm:w-auto px-3.5 py-2 rounded-lg text-xs font-bold bg-slate-700 hover:bg-slate-600 text-white transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                  <span>Open Lot in Editor →</span>
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Section */}
        <div className="bg-slate-950 border-t border-slate-800 px-4 sm:px-6 py-3.5 flex items-center justify-between text-xs text-slate-500 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="truncate">Wailtail Unified Activity Hub</span>
          </div>
          <button
            onClick={onClose}
            className="min-h-[44px] px-3 py-2 text-slate-400 hover:text-white transition-colors font-medium cursor-pointer flex items-center"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
