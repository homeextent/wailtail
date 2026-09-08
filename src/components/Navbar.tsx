import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserProfile } from '../types';
import { WailtailLogo } from './WailtailLogo';
import { 
  ShieldCheck, 
  User as UserIcon, 
  LogOut, 
  LogIn, 
  Settings, 
  CheckCircle, 
  AlertCircle, 
  Share2, 
  Bookmark,
  FileText,
  Car,
  Tag,
  ChevronDown,
  Gavel,
  ClipboardList
} from 'lucide-react';

interface NavbarProps {
  onOpenAuth: () => void;
  onOpenAdmin: () => void;
  onOpenAccountHub?: (initialTab?: 'bids' | 'listings' | 'seller' | 'consignments') => void;
  userProfile?: UserProfile | null;
  onOpenListingEditor?: () => void;
  onOpenShare: () => void;
  isWatching: boolean;
  onToggleWatch: () => void;
  watchCount?: number;
  auctionHeadline?: string;
  auctionTitle?: string;
  siteLogo?: string;
  siteName?: string;
  siteTagline?: string;
  onToggleCatalog?: () => void;
  onNavigateHome?: () => void;
  onOpenConsignmentModal?: () => void;
  isCatalogView?: boolean;
  totalAuctionsCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenAuth,
  onOpenAdmin,
  onOpenAccountHub,
  userProfile: userProfileProp,
  onOpenListingEditor,
  onOpenShare,
  isWatching,
  onToggleWatch,
  watchCount = 18,
  auctionHeadline,
  auctionTitle,
  siteLogo,
  siteName,
  siteTagline,
  onToggleCatalog,
  onNavigateHome,
  onOpenConsignmentModal,
  isCatalogView = false,
  totalAuctionsCount
}) => {
  const { user, userProfile: contextProfile, isAdmin: contextAdmin, isSeller: contextSeller, isEmailVerified, signOut } = useAuth();
  const userProfile = userProfileProp !== undefined ? userProfileProp : contextProfile;
  const isAdmin = Boolean(contextAdmin || userProfile?.role?.toLowerCase() === 'admin');
  const isSeller = Boolean(contextSeller || userProfile?.role?.toLowerCase() === 'seller');
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    if (isUserMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isUserMenuOpen]);

  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onNavigateHome) {
      onNavigateHome();
    } else if (onToggleCatalog) {
      onToggleCatalog();
    } else {
      window.location.href = '/';
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-[#121619] text-white border-b border-zinc-800 shadow-md">
      {/* Top micro announcement bar */}
      <div className="bg-[#181f25] border-b border-zinc-800/80 px-4 py-1.5 text-xs text-zinc-300">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-hidden mr-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0"></span>
            <span className="font-semibold text-emerald-400 flex-shrink-0">LIVE SINGLE-CAR AUCTION</span>
            <span className="hidden sm:inline text-zinc-500 flex-shrink-0">•</span>
            <span className="truncate text-zinc-300 font-medium text-xs">
              {auctionHeadline || auctionTitle || "1978 Porsche 911 Turbo-Look Coupe 'Whale Tail'"}
            </span>
          </div>
          <div className="flex items-center gap-4 text-zinc-400 text-xs flex-shrink-0">
            <span className="hidden md:inline">No Buyer's Fees • CAD Currency</span>
            <span className="text-zinc-300 font-mono text-[11px] bg-zinc-800/80 px-2 py-0.5 rounded border border-zinc-700/50">
              wailtail.com
            </span>
          </div>
        </div>
      </div>

      {/* Main navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand / Logo (Preserving Native Horizontal Aspect Ratio & Subtitle) */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <a 
            href="/catalog" 
            onClick={handleLogoClick}
            className="flex items-center gap-3 group transition-opacity hover:opacity-90 max-h-11 cursor-pointer"
            title="Wailtail - Vehicle Auction Catalog"
          >
            {siteLogo && siteLogo.trim() !== '' ? (
              <img
                src={siteLogo}
                alt={siteName || "Wailtail Logo"}
                className="h-10 max-h-10 w-auto object-contain flex-shrink-0"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <WailtailLogo className="h-9 max-h-9 w-auto object-contain flex-shrink-0" theme="dark" variant="icon" />
            )}

            {/* Dynamic Brand Name & Tagline */}
            <div className="flex flex-col justify-center">
              <span className="font-black italic tracking-tight text-xl sm:text-2xl leading-none text-white font-sans whitespace-nowrap uppercase">
                {siteName || 'wailtail'}
              </span>
              <span className="text-[9px] uppercase tracking-[0.22em] font-semibold text-zinc-400 mt-0.5 whitespace-nowrap">
                {siteTagline || 'Single-Car Auctions'}
              </span>
            </div>
          </a>
        </div>

        {/* Action Controls & User state */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Sell Your Vehicle Header Action */}
          {onOpenConsignmentModal && (
            <button
              onClick={onOpenConsignmentModal}
              className="px-3 py-1.5 sm:px-3.5 sm:py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer whitespace-nowrap"
              title="Consign your vehicle with Wailtail (0% Seller Fee)"
            >
              <Tag className="w-3.5 h-3.5 text-black" />
              <span>Sell Your Vehicle</span>
            </button>
          )}

          {/* Catalog / All Auctions Switcher */}
          {onToggleCatalog && (
            <button
              onClick={onToggleCatalog}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border cursor-pointer ${
                isCatalogView
                  ? 'bg-red-700 text-white border-red-600 shadow-xs ring-1 ring-red-500/40'
                  : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-300'
              }`}
              title={isCatalogView ? "Back to Featured Vehicle Auction" : "Browse all vehicle auction lots"}
            >
              <Car className="w-3.5 h-3.5 text-zinc-400" />
              <span>{isCatalogView ? 'Featured Lot' : 'All Auctions'}</span>
              {totalAuctionsCount !== undefined && totalAuctionsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full font-mono text-[10px] font-bold bg-zinc-800 text-zinc-300">
                  {totalAuctionsCount}
                </span>
              )}
            </button>
          )}

          {/* Watchlist button with dynamic counter */}
          <button
            onClick={onToggleWatch}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border ${
              isWatching
                ? 'bg-amber-950/50 border-amber-500/60 text-amber-300 ring-1 ring-amber-500/40'
                : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-300'
            }`}
            title={isWatching ? 'Remove from Watchlist' : 'Add to Watchlist'}
          >
            <Bookmark className={`w-3.5 h-3.5 ${isWatching ? 'fill-amber-400 text-amber-400' : ''}`} />
            <span>{isWatching ? 'Watching' : 'Watch'}</span>
            <span className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] font-bold ${
              isWatching ? 'bg-amber-400/25 text-amber-200' : 'bg-zinc-800 text-zinc-400'
            }`}>
              {watchCount}
            </span>
          </button>

          {/* Share button */}
          <button
            onClick={onOpenShare}
            className="p-1.5 sm:px-3 sm:py-1.5 rounded-lg text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 transition-colors flex items-center gap-1.5"
            title="Share Auction"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Share</span>
          </button>

          {/* Admin / Seller Actions */}
          {isAdmin && (
            <div className="flex items-center gap-1.5">
              {onOpenListingEditor && (
                <button
                  onClick={onOpenListingEditor}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-700 hover:bg-red-600 text-white transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                  title="Open Dedicated Full-Page Listing Editor"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Edit Listing</span>
                  <span className="sm:hidden">Edit</span>
                </button>
              )}

              <button
                onClick={(e) => {
                  e.preventDefault();
                  if (onOpenAdmin) {
                    onOpenAdmin();
                  } else {
                    window.history.pushState({}, '', '/admin');
                    window.dispatchEvent(new PopStateEvent('popstate'));
                  }
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-950/90 hover:bg-red-900 border border-red-600 text-red-200 transition-all flex items-center gap-1.5 shadow-sm ring-1 ring-red-500/40 cursor-pointer"
                title="Open Operations Admin Portal (/admin)"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-red-400" />
                <span className="hidden sm:inline">Admin</span>
                <span className="sm:hidden">Admin</span>
              </button>
            </div>
          )}

          {/* User Auth Profile State */}
          {user ? (
            <div className="relative pl-2 border-l border-zinc-800" ref={userMenuRef}>
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-2 p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/80 transition-all text-left cursor-pointer group"
                aria-expanded={isUserMenuOpen}
                aria-haspopup="true"
                title="Account Menu & Activity Hub"
              >
                {/* User Avatar Circle */}
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-amber-600 to-amber-400 text-black font-black flex items-center justify-center text-xs shadow-xs flex-shrink-0 uppercase">
                  {(userProfile?.displayName || user?.displayName || user?.email || 'U').charAt(0).toUpperCase()}
                </div>

                <div className="text-left hidden sm:block">
                  <div className="text-xs font-bold text-zinc-100 flex items-center gap-1 leading-tight group-hover:text-amber-300 transition-colors">
                    <span className="truncate max-w-[120px]">{userProfile?.displayName || 'Registered Bidder'}</span>
                    {isEmailVerified ? (
                      <span title="Verified Bidder" className="text-emerald-400 flex-shrink-0">
                        <CheckCircle className="w-3 h-3" />
                      </span>
                    ) : (
                      <span title="Email Verification Required" className="text-amber-400 flex-shrink-0">
                        <AlertCircle className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono">
                    {isAdmin ? 'Administrator' : isSeller ? 'Verified Seller' : 'Verified Bidder'}
                  </div>
                </div>

                <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${isUserMenuOpen ? 'rotate-180 text-amber-400' : ''}`} />
              </button>

              {/* Floating Dropdown Menu */}
              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-xl bg-slate-900 text-white border border-slate-800 shadow-2xl py-2 z-50 animate-fadeIn">
                  {/* Dropdown User Info Header */}
                  <div className="px-4 py-2.5 border-b border-slate-800">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-white truncate">
                        {userProfile?.displayName || user?.displayName || 'Registered Member'}
                      </span>
                      <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase rounded bg-slate-800 text-amber-300 border border-slate-700">
                        {isAdmin ? 'ADMIN' : isSeller ? 'SELLER' : 'BIDDER'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5 font-mono">
                      {userProfile?.email || user?.email}
                    </p>
                  </div>

                  {/* Menu Items */}
                  <div className="py-1">
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onOpenAccountHub?.('bids');
                      }}
                      className="w-full px-4 py-2.5 text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-800/80 flex items-center gap-2.5 transition-colors text-left cursor-pointer"
                    >
                      <Gavel className="w-4 h-4 text-amber-400" />
                      <span>My Bids & Activity</span>
                    </button>

                    {(isSeller || isAdmin) && (
                      <button
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          onOpenAccountHub?.('listings');
                        }}
                        className="w-full px-4 py-2.5 text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-800/80 flex items-center gap-2.5 transition-colors text-left cursor-pointer"
                      >
                        <Car className="w-4 h-4 text-emerald-400" />
                        <span>My Vehicle Listings</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onOpenAccountHub?.('consignments');
                      }}
                      className="w-full px-4 py-2.5 text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-800/80 flex items-center gap-2.5 transition-colors text-left cursor-pointer"
                    >
                      <ClipboardList className="w-4 h-4 text-sky-400" />
                      <span>Consignment Requests</span>
                    </button>
                  </div>

                  {/* Divider and Sign Out */}
                  <div className="border-t border-slate-800 pt-1 mt-1">
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        signOut();
                      }}
                      className="w-full px-4 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 flex items-center gap-2.5 transition-colors text-left cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-zinc-100 text-zinc-950 transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <LogIn className="w-3.5 h-3.5 text-zinc-900" />
              <span>Sign In / Register</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
