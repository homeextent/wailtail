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
  FileText,
  Car,
  Tag,
  ChevronDown,
  Gavel,
  ClipboardList,
  Bookmark,
  Menu,
  X
} from 'lucide-react';

interface NavbarProps {
  onOpenAuth: () => void;
  onOpenAdmin: () => void;
  onOpenAccountHub?: (initialTab?: 'bids' | 'listings' | 'seller' | 'consignments' | 'watchlist') => void;
  userProfile?: UserProfile | null;
  onOpenListingEditor?: () => void;
  onOpenShare?: () => void;
  isWatching?: boolean;
  onToggleWatch?: () => void;
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
      if (
        mobileMenuRef.current && 
        !mobileMenuRef.current.contains(e.target as Node) &&
        !(e.target as HTMLElement).closest('[data-mobile-menu-toggle]')
      ) {
        setIsMobileMenuOpen(false);
      }
    };
    if (isUserMenuOpen || isMobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isUserMenuOpen, isMobileMenuOpen]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsMobileMenuOpen(false);
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

      {/* Main navigation container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-16 flex items-center justify-between gap-2 sm:gap-4">
          {/* Brand / Logo (Preserving Native Horizontal Aspect Ratio & Subtitle) */}
          <div className="flex items-center gap-2.5 sm:gap-3 flex-shrink-0 min-w-0">
            <a 
              href="/catalog" 
              onClick={handleLogoClick}
              className="flex items-center gap-2.5 sm:gap-3 group transition-opacity hover:opacity-90 max-h-11 cursor-pointer"
              title="Wailtail - Vehicle Auction Catalog"
            >
              {siteLogo && siteLogo.trim() !== '' ? (
                <img
                  src={siteLogo}
                  alt={siteName || "Wailtail Logo"}
                  className="h-9 sm:h-10 max-h-10 w-auto object-contain flex-shrink-0"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <WailtailLogo className="h-8 sm:h-9 max-h-9 w-auto object-contain flex-shrink-0" theme="dark" variant="icon" />
              )}

              {/* Dynamic Brand Name & Tagline */}
              <div className="flex flex-col justify-center min-w-0">
                <span className="font-black italic tracking-tight text-lg sm:text-2xl leading-none text-white font-sans whitespace-nowrap uppercase">
                  {siteName || 'wailtail'}
                </span>
                <span className="text-[8px] sm:text-[9px] uppercase tracking-[0.2em] font-semibold text-zinc-400 mt-0.5 whitespace-nowrap">
                  {siteTagline || 'Single-Car Auctions'}
                </span>
              </div>
            </a>
          </div>

          {/* Desktop Action Controls & User state (hidden on viewports below md:) */}
          <div className="hidden md:flex items-center gap-2 sm:gap-3 flex-shrink-0">
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
              <div className="pl-2 border-l border-zinc-800" ref={userMenuRef}>
                <div className="relative inline-block">
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
                    <div className="absolute right-0 top-full mt-2 w-64 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-50 p-2 space-y-1">
                      {/* Dropdown User Info Header */}
                      <div className="px-3 py-2 border-b border-slate-800">
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
                      <div className="space-y-1">
                        <button
                          onClick={() => {
                            setIsUserMenuOpen(false);
                            onOpenAccountHub?.('bids');
                          }}
                          className="w-full px-3 py-2 rounded-lg text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-800/80 flex items-center gap-2.5 transition-colors text-left cursor-pointer"
                        >
                          <Gavel className="w-4 h-4 text-amber-400" />
                          <span>My Bids & Activity</span>
                        </button>

                        <button
                          onClick={() => {
                            setIsUserMenuOpen(false);
                            onOpenAccountHub?.('watchlist');
                          }}
                          className="w-full px-3 py-2 rounded-lg text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-800/80 flex items-center gap-2.5 transition-colors text-left cursor-pointer"
                        >
                          <Bookmark className="w-4 h-4 text-amber-400" />
                          <span>My Watchlist</span>
                        </button>

                        {(isSeller || isAdmin) && (
                          <button
                            onClick={() => {
                              setIsUserMenuOpen(false);
                              onOpenAccountHub?.('listings');
                            }}
                            className="w-full px-3 py-2 rounded-lg text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-800/80 flex items-center gap-2.5 transition-colors text-left cursor-pointer"
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
                          className="w-full px-3 py-2 rounded-lg text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-800/80 flex items-center gap-2.5 transition-colors text-left cursor-pointer"
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
                          className="w-full px-3 py-2 rounded-lg text-xs font-semibold text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 flex items-center gap-2.5 transition-colors text-left cursor-pointer"
                        >
                          <LogOut className="w-4 h-4" />
                          <span>Sign Out</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <button
                onClick={onOpenAuth}
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-zinc-100 text-zinc-950 transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5 text-zinc-900" />
                <span>Sign In / Register</span>
              </button>
            )}
          </div>

          {/* Mobile Action Controls: Compact avatar + Hamburger Toggle (viewports below md:) */}
          <div className="flex md:hidden items-center gap-1">
            {/* Compact User Profile Avatar Button (or Sign In if logged out) */}
            {user ? (
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center p-1 rounded-full focus:outline-none cursor-pointer"
                title="User Profile & Menu"
                aria-label="Toggle user menu"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-600 to-amber-400 text-black font-black flex items-center justify-center text-xs shadow-xs uppercase">
                  {(userProfile?.displayName || user?.displayName || user?.email || 'U').charAt(0).toUpperCase()}
                </div>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenAuth();
                }}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2 rounded-lg text-zinc-200 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Sign In / Register"
                aria-label="Sign In / Register"
              >
                <LogIn className="w-5 h-5" />
              </button>
            )}

            {/* Mobile Hamburger Icon Button (44x44px touch target) */}
            <button
              type="button"
              data-mobile-menu-toggle="true"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer focus:outline-none"
              aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6 text-zinc-200" />
              ) : (
                <Menu className="w-6 h-6 text-zinc-200" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Slide-Down Navigation Drawer */}
        {isMobileMenuOpen && (
          <div 
            ref={mobileMenuRef}
            className="md:hidden border-t border-zinc-800 bg-[#121619] py-4 space-y-4 max-h-[calc(100vh-5rem)] overflow-y-auto animate-fadeIn"
          >
            {/* User Identity / Role Badges & Activity Hub Links (if logged in) */}
            {user ? (
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-600 to-amber-400 text-black font-black flex items-center justify-center text-xs shadow-xs flex-shrink-0 uppercase">
                      {(userProfile?.displayName || user?.displayName || user?.email || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate flex items-center gap-1">
                        <span>{userProfile?.displayName || user?.displayName || 'Registered Member'}</span>
                        {isEmailVerified ? (
                          <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-3 h-3 text-amber-400 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-400 truncate font-mono">
                        {userProfile?.email || user?.email}
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 text-[9px] font-mono font-bold uppercase rounded bg-slate-800 text-amber-300 border border-slate-700 flex-shrink-0">
                    {isAdmin ? 'ADMIN' : isSeller ? 'SELLER' : 'BIDDER'}
                  </span>
                </div>

                {/* Account Hub Links in Mobile Drawer */}
                <div className="grid grid-cols-1 gap-1 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onOpenAccountHub?.('bids');
                    }}
                    className="min-h-[44px] w-full px-3 py-2 rounded-lg text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-800/80 flex items-center gap-2.5 transition-colors text-left cursor-pointer"
                  >
                    <Gavel className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <span>My Bids & Activity</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onOpenAccountHub?.('watchlist');
                    }}
                    className="min-h-[44px] w-full px-3 py-2 rounded-lg text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-800/80 flex items-center gap-2.5 transition-colors text-left cursor-pointer"
                  >
                    <Bookmark className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <span>My Watchlist</span>
                  </button>

                  {(isSeller || isAdmin) && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        onOpenAccountHub?.('listings');
                      }}
                      className="min-h-[44px] w-full px-3 py-2 rounded-lg text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-800/80 flex items-center gap-2.5 transition-colors text-left cursor-pointer"
                    >
                      <Car className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span>My Vehicle Listings</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onOpenAccountHub?.('consignments');
                    }}
                    className="min-h-[44px] w-full px-3 py-2 rounded-lg text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-800/80 flex items-center gap-2.5 transition-colors text-left cursor-pointer"
                  >
                    <ClipboardList className="w-4 h-4 text-sky-400 flex-shrink-0" />
                    <span>Consignment Requests</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      signOut();
                    }}
                    className="min-h-[44px] w-full px-3 py-2 rounded-lg text-xs font-semibold text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 flex items-center gap-2.5 transition-colors text-left cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 flex-shrink-0" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenAuth();
                  }}
                  className="min-h-[44px] w-full px-4 py-2.5 rounded-xl text-xs font-bold bg-white hover:bg-zinc-100 text-zinc-950 flex items-center justify-center gap-2 transition-colors shadow-sm cursor-pointer"
                >
                  <LogIn className="w-4 h-4 text-zinc-900" />
                  <span>Sign In / Register</span>
                </button>
              </div>
            )}

            {/* Primary Actions Vertical Stack */}
            <div className="space-y-2">
              {/* Sell Your Vehicle Mobile Action */}
              {onOpenConsignmentModal && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenConsignmentModal();
                  }}
                  className="min-h-[44px] w-full px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black flex items-center justify-between transition-all shadow-sm active:scale-98 cursor-pointer"
                  title="Consign your vehicle with Wailtail (0% Seller Fee)"
                >
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-black" />
                    <span>Sell Your Vehicle</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-amber-950 text-amber-200">
                    0% Seller Fee
                  </span>
                </button>
              )}

              {/* Catalog / All Auctions Switcher */}
              {onToggleCatalog && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onToggleCatalog();
                  }}
                  className={`min-h-[44px] w-full px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between transition-all border cursor-pointer ${
                    isCatalogView
                      ? 'bg-red-700 text-white border-red-600 shadow-xs'
                      : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Car className="w-4 h-4 text-zinc-400" />
                    <span>{isCatalogView ? 'Featured Lot' : 'All Auctions'}</span>
                  </div>
                  {totalAuctionsCount !== undefined && totalAuctionsCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full font-mono text-[10px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
                      {totalAuctionsCount} Lots
                    </span>
                  )}
                </button>
              )}

              {/* Admin / Seller Actions in Mobile Drawer */}
              {isAdmin && (
                <div className="pt-2 border-t border-zinc-800 space-y-2">
                  {onOpenListingEditor && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        onOpenListingEditor();
                      }}
                      className="min-h-[44px] w-full px-4 py-2.5 rounded-xl text-xs font-bold bg-red-700 hover:bg-red-600 text-white transition-all flex items-center gap-2 shadow-sm cursor-pointer"
                    >
                      <FileText className="w-4 h-4" />
                      <span>Edit Listing Workspace</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setIsMobileMenuOpen(false);
                      if (onOpenAdmin) {
                        onOpenAdmin();
                      } else {
                        window.history.pushState({}, '', '/admin');
                        window.dispatchEvent(new PopStateEvent('popstate'));
                      }
                    }}
                    className="min-h-[44px] w-full px-4 py-2.5 rounded-xl text-xs font-bold bg-red-950/90 hover:bg-red-900 border border-red-600 text-red-200 transition-all flex items-center gap-2 shadow-sm cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4 text-red-400" />
                    <span>Admin Portal (/admin)</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
