import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Auction, Bid, Comment, MediaConfiguration, UserProfile } from './types';
import { mediaConfig as DEFAULT_MEDIA_CONFIG, BLANK_MEDIA_CONFIG } from './mediaConfig';
import { 
  initializeAuctionIfNotExists, 
  initializeMediaConfigIfNotExists,
  subscribeToAuction, 
  subscribeToAllAuctions,
  subscribeToBids, 
  subscribeToComments, 
  subscribeToMediaConfig,
  subscribeToUserProfile,
  subscribeToGlobalBranding,
  getStoredGlobalBranding,
  GLOBAL_BRANDING_STORAGE_KEY,
  saveMediaConfig,
  toggleWatchAuction,
  createNewListing,
  MAIN_AUCTION_ID, 
  BLANK_AUCTION 
} from './services/auctionService';
import { updateAuctionConfig } from './services/auctionService';

// Subcomponents
import { Navbar } from './components/Navbar';
import { AuctionHeader } from './components/AuctionHeader';
import { HeroMediaCarousel } from './components/HeroMediaCarousel';
import { InlineShowcaseSection } from './components/InlineShowcaseSection';
import { YouTubePlaylistSection } from './components/YouTubePlaylistSection';
import { PhotoGalleryGrid } from './components/PhotoGalleryGrid';
import { CommentSection } from './components/CommentSection';
import { StickyBidBar } from './components/StickyBidBar';
import { BidModal } from './components/BidModal';
import { AuthModal } from './components/AuthModal';
import { AdminPanelModal } from './components/AdminPanelModal';
import { ShareModal } from './components/ShareModal';
import { ContactSellerModal } from './components/ContactSellerModal';
import { ConsignmentModal } from './components/ConsignmentModal';
import { UserAccountHubModal } from './components/UserAccountHubModal';
import { ListingSubNav } from './components/ListingSubNav';
import { Footer } from './components/Footer';
import { ListingEditorWorkspace } from './components/ListingEditorWorkspace';
import { VehicleCatalogGrid } from './components/VehicleCatalogGrid';
import { AdminPortalPage } from './components/AdminPortalPage';

// Icons for listing facts & features
import { 
  FileText, 
  CheckCircle2, 
  ShieldCheck, 
  MapPin, 
  Award, 
  Sparkles, 
  Wrench, 
  ExternalLink,
  ChevronDown,
  Mail
} from 'lucide-react';

const AuctionAppContent: React.FC = () => {
  const { user, userProfile: initialUserProfile, loading: authLoading, isAdmin: authIsAdmin } = useAuth();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(initialUserProfile);

  // Sync initial profile from auth context
  useEffect(() => {
    if (initialUserProfile) {
      setUserProfile(initialUserProfile);
    }
  }, [initialUserProfile]);

  // Real-time Firestore profile listener (reflects role promotions/demotions BIDDER <-> SELLER <-> ADMIN instantly)
  useEffect(() => {
    if (!user) {
      setUserProfile(null);
      return;
    }
    const unsubscribe = subscribeToUserProfile(user.uid, (profile) => {
      setUserProfile(profile);
    });
    return () => {
      unsubscribe();
    };
  }, [user?.uid]);

  const isAdmin = Boolean(
    authIsAdmin || 
    userProfile?.role?.toUpperCase() === 'ADMIN' || 
    (user as any)?.role === 'ADMIN'
  );

  // Synchronous localStorage Branding Hydration to eliminate initial loading flash
  const [globalBranding, setGlobalBranding] = useState(() => {
    try {
      const raw = localStorage.getItem(GLOBAL_BRANDING_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return {
            siteLogo: typeof parsed.siteLogo === 'string' ? parsed.siteLogo : '',
            siteName: typeof parsed.siteName === 'string' && parsed.siteName.trim() !== '' ? parsed.siteName : 'wailtail',
            siteTagline: typeof parsed.siteTagline === 'string' && parsed.siteTagline.trim() !== '' ? parsed.siteTagline : 'Single-Car Auctions'
          };
        }
      }
    } catch (err) {
      console.warn('Failed to parse cached global branding in App:', err);
    }
    return {
      siteLogo: '',
      siteName: 'wailtail',
      siteTagline: 'Single-Car Auctions'
    };
  });

  const [auction, setAuction] = useState<Auction>(() => ({
    ...BLANK_AUCTION,
    siteLogo: globalBranding.siteLogo,
    siteName: globalBranding.siteName,
    siteTagline: globalBranding.siteTagline
  }));
  const [bids, setBids] = useState<Bid[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);

  // Dynamic Media Configuration
  const [currentMedia, setCurrentMedia] = useState<MediaConfiguration>(() => ({
    ...BLANK_MEDIA_CONFIG,
    siteLogo: globalBranding.siteLogo,
    siteName: globalBranding.siteName,
    siteTagline: globalBranding.siteTagline
  }));

  // Real-time Firestore synchronization for global branding (/settings/global)
  useEffect(() => {
    const unsubBranding = subscribeToGlobalBranding((cloudBranding) => {
      if (cloudBranding) {
        const next = {
          siteLogo: cloudBranding.siteLogo !== undefined ? cloudBranding.siteLogo : globalBranding.siteLogo,
          siteName: cloudBranding.siteName || globalBranding.siteName,
          siteTagline: cloudBranding.siteTagline || globalBranding.siteTagline
        };
        setGlobalBranding(next);
        try {
          localStorage.setItem(GLOBAL_BRANDING_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        if (cloudBranding.siteLogo !== undefined || cloudBranding.siteName || cloudBranding.siteTagline) {
          setCurrentMedia((prev) => ({
            ...prev,
            ...(cloudBranding.siteLogo !== undefined ? { siteLogo: cloudBranding.siteLogo } : {}),
            ...(cloudBranding.siteName ? { siteName: cloudBranding.siteName } : {}),
            ...(cloudBranding.siteTagline ? { siteTagline: cloudBranding.siteTagline } : {})
          }));
        }
      }
    });

    return () => {
      unsubBranding();
    };
  }, []);

  // Modals & Navigation state
  const [isBidModalOpen, setIsBidModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [isConsignmentModalOpen, setIsConsignmentModalOpen] = useState(false);
  const [isAccountHubOpen, setIsAccountHubOpen] = useState(false);
  const [accountHubTab, setAccountHubTab] = useState<'bids' | 'watchlist' | 'seller' | 'consignments' | 'notifications'>('bids');

  const handleOpenAccountHub = (tab?: string) => {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }
    const validTabs: Array<'bids' | 'watchlist' | 'seller' | 'consignments' | 'notifications'> = [
      'bids', 'watchlist', 'seller', 'consignments', 'notifications'
    ];
    const normalizedTab = tab === 'listings' ? 'seller' : tab;
    if (normalizedTab && (validTabs as string[]).includes(normalizedTab)) {
      setAccountHubTab(normalizedTab as any);
    } else {
      setAccountHubTab('bids');
    }
    setIsAccountHubOpen(true);
  };
  const [selectedLightboxIndex, setSelectedLightboxIndex] = useState<number | null>(null);
  const [isWatching, setIsWatching] = useState(() => {
    return localStorage.getItem('wailtail_watching') === 'true';
  });

  // Dedicated Full-Page Workspace Routing (/dashboard/listings/[id]/edit, /admin)
  const [currentPath, setCurrentPath] = useState(() => {
    return window.location.pathname + window.location.search + window.location.hash;
  });

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname + window.location.search + window.location.hash);
    };
    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  const navigateTo = (url: string) => {
    window.history.pushState({}, '', url);
    setCurrentPath(url);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const isAdminRoute = 
    currentPath === '/admin' || 
    currentPath.startsWith('/admin?') || 
    currentPath.startsWith('/admin/') || 
    currentPath.startsWith('/admin#') || 
    currentPath.includes('#/admin');

  const isEditorRoute = 
    (currentPath.startsWith('/dashboard/listings') || 
    currentPath.includes('/edit') || 
    currentPath.includes('#/dashboard/listings')) &&
    !currentPath.includes('/dashboard/listings/new') &&
    !isAdminRoute;

  const isNewListingRoute = 
    (currentPath === '/dashboard/listings/new' || 
    currentPath.startsWith('/dashboard/listings/new') || 
    currentPath.includes('#/dashboard/listings/new')) &&
    !isAdminRoute;

  const isSpecificAuctionRoute = 
    !isAdminRoute &&
    (currentPath.startsWith('/auctions/') || 
    currentPath.startsWith('/lot/') || 
    currentPath.startsWith('/vehicle/') || 
    currentPath.startsWith('/#auctions/'));

  // The multi-car Vehicle Auction Catalog view (/catalog) is the primary homepage route (/)
  const isCatalogRoute = 
    !isAdminRoute &&
    !isEditorRoute && 
    !isNewListingRoute && 
    !isSpecificAuctionRoute;

  // Extract active vehicle listing ID from route if on editor or public auction detail
  const editorMatch = currentPath.match(/\/dashboard\/listings\/([^/?#]+)\/edit/);
  const publicAuctionMatch = currentPath.match(/\/auctions\/([^/?#]+)/);
  const routeAuctionId = editorMatch ? editorMatch[1] : publicAuctionMatch ? publicAuctionMatch[1] : '';

  const [activeAuctionId, setActiveAuctionId] = useState<string>(routeAuctionId);
  const [allAuctions, setAllAuctions] = useState<Auction[]>([]);

  // Direct Onboarding action: opens a fresh Listing Workspace
  const handleLaunchListingWorkspace = async () => {
    setIsConsignmentModalOpen(false);
    try {
      const newLot = await createNewListing('New Vehicle Listing');
      // Optimistic state hydration for 0-lot baseline
      setAllAuctions(prev => [...prev, newLot]);
      setActiveAuctionId(newLot.id);
      navigateTo(`/dashboard/listings/${newLot.id}/edit`);
    } catch (e) {
      console.error('Error creating new lot for workspace:', e);
      navigateTo('/dashboard/listings/new');
    }
  };

  const [routeToast, setRouteToast] = useState<string | null>(null);

  // RBAC Authorization Guard for /admin
  useEffect(() => {
    if (isAdminRoute && !authLoading) {
      const isAuthorized = Boolean(
        user && (isAdmin || userProfile?.role?.toUpperCase() === 'ADMIN' || (user as any)?.role === 'ADMIN')
      );
      if (!isAuthorized) {
        setRouteToast("Access Restricted: Administrator privileges required.");
        navigateTo('/');
      }
    }
  }, [isAdminRoute, authLoading, user, userProfile, isAdmin]);

  // Auto-create and redirect if user directly lands on /dashboard/listings/new
  useEffect(() => {
    // RBAC Protection for /dashboard/listings/*
    const isProtectedListingRoute = currentPath.startsWith('/dashboard/listings') || currentPath.includes('#/dashboard/listings');
    if (isProtectedListingRoute) {
      const isAuthorized = user && (user.role === 'seller' || user.role === 'admin' || isAdmin);
      if (!isAuthorized) {
        setRouteToast('Access Denied: Consignor or Administrator privileges required to access the listing workspace.');
        navigateTo('/');
        return;
      }
    }

    if (isNewListingRoute) {
      createNewListing('New Vehicle Listing')
        .then((newLot) => {
          // Optimistic state hydration for 0-lot baseline
          setAllAuctions(prev => [...prev, newLot]);
          setActiveAuctionId(newLot.id);
          window.history.replaceState({}, '', `/dashboard/listings/${newLot.id}/edit`);
          setCurrentPath(`/dashboard/listings/${newLot.id}/edit`);
        })
        .catch((err) => {
          console.error('Error auto-creating new listing:', err);
        });
    }
  }, [currentPath, isNewListingRoute, user, isAdmin]);

  useEffect(() => {
    if (editorMatch && editorMatch[1] && editorMatch[1] !== activeAuctionId) {
      setActiveAuctionId(editorMatch[1]);
    } else if (publicAuctionMatch && publicAuctionMatch[1] && publicAuctionMatch[1] !== activeAuctionId) {
      setActiveAuctionId(publicAuctionMatch[1]);
    }
  }, [currentPath]);

  // Subscribe to all auctions catalog
  useEffect(() => {
    const unsub = subscribeToAllAuctions((list) => {
      setAllAuctions(list || []);
    });
    return () => unsub();
  }, []);

  // Initialize and subscribe to Firestore for active vehicle auction
  useEffect(() => {
    let unsubAuction = () => {};
    let unsubBids = () => {};
    let unsubComments = () => {};
    let unsubMedia = () => {};

    if (!activeAuctionId && allAuctions.length === 0) {
      setAuction(BLANK_AUCTION);
      setCurrentMedia(BLANK_MEDIA_CONFIG);
      setLoading(false);
      return;
    }

    const targetAuctionId = activeAuctionId || (allAuctions.length > 0 ? allAuctions[0].id : MAIN_AUCTION_ID);

    const setupFirestore = async () => {
      try {
        await initializeAuctionIfNotExists();
        await initializeMediaConfigIfNotExists(targetAuctionId);
        
        unsubAuction = subscribeToAuction(targetAuctionId, (data) => {
          if (data) {
            setAuction(data);
            if (data.siteLogo !== undefined || data.siteName || data.siteTagline) {
              setGlobalBranding((prev) => {
                const next = {
                  siteLogo: data.siteLogo !== undefined ? data.siteLogo : prev.siteLogo,
                  siteName: data.siteName || prev.siteName,
                  siteTagline: data.siteTagline || prev.siteTagline
                };
                try {
                  localStorage.setItem(GLOBAL_BRANDING_STORAGE_KEY, JSON.stringify(next));
                } catch {
                  // ignore
                }
                return next;
              });
            }
          } else {
            setAuction(BLANK_AUCTION);
          }
          setLoading(false);
        });

        unsubBids = subscribeToBids(targetAuctionId, (bidList) => {
          setBids(bidList);
        });

        unsubComments = subscribeToComments(targetAuctionId, (commList) => {
          setComments(commList);
        });

        unsubMedia = subscribeToMediaConfig((cloudMedia) => {
          if (cloudMedia) {
            setCurrentMedia(cloudMedia);
            if (cloudMedia.siteLogo !== undefined || cloudMedia.siteName || cloudMedia.siteTagline) {
              setGlobalBranding((prev) => {
                const next = {
                  siteLogo: cloudMedia.siteLogo !== undefined ? cloudMedia.siteLogo : prev.siteLogo,
                  siteName: cloudMedia.siteName || prev.siteName,
                  siteTagline: cloudMedia.siteTagline || prev.siteTagline
                };
                try {
                  localStorage.setItem(GLOBAL_BRANDING_STORAGE_KEY, JSON.stringify(next));
                } catch {
                  // ignore
                }
                return next;
              });
            }
            try {
              localStorage.setItem(`wailtail_custom_media_${targetAuctionId}`, JSON.stringify(cloudMedia));
            } catch (e) {
              // ignore
            }
          } else {
            setCurrentMedia(targetAuctionId === MAIN_AUCTION_ID ? DEFAULT_MEDIA_CONFIG : BLANK_MEDIA_CONFIG);
          }
        }, targetAuctionId);
      } catch (err) {
        console.error('Error initializing auction:', err);
        setLoading(false);
      }
    };

    setupFirestore();

    return () => {
      unsubAuction();
      unsubBids();
      unsubComments();
      unsubMedia();
    };
  }, [activeAuctionId, isEditorRoute, allAuctions.length]);

  const handleToggleWatch = async () => {
    const next = !isWatching;
    setIsWatching(next);
    localStorage.setItem('wailtail_watching', String(next));
    try {
      const newCount = await toggleWatchAuction(auction.id, next);
      setAuction((prev) => ({ ...prev, watchCount: newCount }));
    } catch (e) {
      console.warn('Could not update watchlist count:', e);
    }
  };

  const handleUpdateMediaConfig = async (newConfig: MediaConfiguration) => {
    setCurrentMedia(newConfig);
    const targetAuctionId = auction.id?.trim() || MAIN_AUCTION_ID;
    if (newConfig.heroImages) {
      setAuction(prev => ({
        ...prev,
        heroImages: newConfig.heroImages,
        leadHeroImage: newConfig.heroImages[0] || ''
      }));
    }
    try {
      localStorage.setItem(`wailtail_custom_media_${targetAuctionId}`, JSON.stringify(newConfig));
      await saveMediaConfig(newConfig, targetAuctionId);
    } catch (e) {
      console.warn('Media configuration saved locally:', e);
    }
  };

  const handleOpenLightboxByUrl = (url: string) => {
    const idx = currentMedia.fullGallery.findIndex((img) => img.url === url);
    if (idx >= 0) {
      setSelectedLightboxIndex(idx);
    } else {
      setSelectedLightboxIndex(0);
    }
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const renderRouteContent = () => {
    // Session Loading State for /admin to prevent flash redirects on page refresh
    if (isAdminRoute && authLoading) {
      return (
      <div className="min-h-screen bg-[#0d1114] text-white flex flex-col font-sans animate-pulse">
        {/* Top Header Skeleton */}
        <div className="h-16 bg-[#121619] border-b border-zinc-800 flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-800" />
            <div className="h-4 w-36 bg-zinc-800 rounded" />
          </div>
          <div className="h-8 w-28 bg-zinc-800 rounded-lg" />
        </div>

        {/* Analytics Header Skeleton */}
        <div className="bg-[#151a1e] border-b border-zinc-800/90 py-8 px-6">
          <div className="max-w-7xl mx-auto space-y-4">
            <div className="h-6 w-48 bg-zinc-800 rounded" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="h-24 rounded-xl bg-zinc-900 border border-zinc-800 p-4 space-y-2">
                  <div className="h-3 w-20 bg-zinc-800 rounded" />
                  <div className="h-7 w-12 bg-zinc-800 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content Skeleton */}
        <div className="max-w-7xl mx-auto px-6 py-8 w-full flex-1 space-y-6">
          <div className="h-16 rounded-2xl bg-zinc-900 border border-zinc-800" />
          <div className="h-96 rounded-2xl bg-zinc-900 border border-zinc-800" />
        </div>
      </div>
    );
  }

  // Dedicated Full-Page Admin Operations Portal Route (/admin)
  if (isAdminRoute) {
    const isAuthorized = Boolean(
      user && (isAdmin || userProfile?.role?.toUpperCase() === 'ADMIN' || (user as any)?.role === 'ADMIN')
    );
    if (isAuthorized) {
      return (
        <AdminPortalPage
          auction={auction}
          allAuctions={allAuctions}
          bids={bids}
          mediaConfig={currentMedia}
          onUpdateMediaConfig={handleUpdateMediaConfig}
          onNavigateHome={() => navigateTo('/')}
          onOpenListingEditor={(targetId) => {
            const target = targetId || activeAuctionId || auction.id;
            setActiveAuctionId(target);
            navigateTo(`/dashboard/listings/${target}/edit`);
          }}
          onSelectAuction={(newAuctionId) => {
            setActiveAuctionId(newAuctionId);
          }}
        />
      );
    }
  }

  // Dedicated Full-Page Authoring Route (/dashboard/listings/[id]/edit)
  if (isEditorRoute) {
    return (
      <ListingEditorWorkspace
        auction={auction}
        mediaConfig={currentMedia}
        allAuctions={allAuctions}
        onSelectAuction={(newAuctionId) => {
          setActiveAuctionId(newAuctionId);
          navigateTo(`/dashboard/listings/${newAuctionId}/edit`);
        }}
        onUpdateAuction={async (updates) => {
          setAuction((prev) => ({ ...prev, ...updates }));
          try {
            await updateAuctionConfig(auction.id, updates);
          } catch (err) {
            console.warn('Saved auction updates locally:', err);
          }
        }}
        onUpdateMediaConfig={handleUpdateMediaConfig}
        onBackToPublic={() => navigateTo('/')}
      />
    );
  }

  // Dedicated Full-Page Public Vehicle Catalog Route (/catalog)
  const effectiveSiteLogo = currentMedia.siteLogo || auction.siteLogo || globalBranding.siteLogo || '';
  const effectiveSiteName = currentMedia.siteName || auction.siteName || globalBranding.siteName || 'wailtail';
  const effectiveSiteTagline = currentMedia.siteTagline || auction.siteTagline || globalBranding.siteTagline || 'Single-Car Auctions';

  if (isCatalogRoute) {
    return (
      <div className="min-h-screen bg-[#f7f8fa] text-zinc-900 flex flex-col font-sans selection:bg-red-700 selection:text-white">
        {routeToast && (
          <div className="fixed top-4 right-4 z-50 max-w-md bg-red-800 text-white px-4 py-3 rounded-xl shadow-2xl border border-red-700 flex items-center justify-between gap-3 text-xs font-semibold animate-in fade-in slide-in-from-top-2">
            <span>{routeToast}</span>
            <button
              onClick={() => setRouteToast(null)}
              className="text-red-200 hover:text-white p-1"
            >
              ✕
            </button>
          </div>
        )}
        <Navbar
          userProfile={userProfile}
          onOpenAuth={() => setIsAuthModalOpen(true)}
          onOpenAdmin={() => navigateTo('/admin')}
          onOpenAccountHub={handleOpenAccountHub}
          onOpenListingEditor={() => navigateTo(`/dashboard/listings/${activeAuctionId}/edit`)}
          onOpenShare={() => setIsShareModalOpen(true)}
          isWatching={isWatching}
          onToggleWatch={handleToggleWatch}
          watchCount={auction.watchCount ?? 18}
          auctionHeadline="Vehicle Inventory & Auctions"
          auctionTitle="Wailtail Classic & Collector Auctions"
          siteLogo={effectiveSiteLogo}
          siteName={effectiveSiteName}
          siteTagline={effectiveSiteTagline}
          onNavigateHome={() => navigateTo('/')}
          onToggleCatalog={() => navigateTo('/')}
          onOpenConsignmentModal={() => setIsConsignmentModalOpen(true)}
          isCatalogView={true}
          totalAuctionsCount={allAuctions.length}
        />

        <main className="flex-1">
          <VehicleCatalogGrid
            auctions={allAuctions}
            activeAuctionId={activeAuctionId}
            onSelectAuction={(selectedId) => {
              setActiveAuctionId(selectedId);
              navigateTo(`/auctions/${selectedId}`);
            }}
            onOpenListingEditor={(selectedId) => {
              setActiveAuctionId(selectedId);
              navigateTo(`/dashboard/listings/${selectedId}/edit`);
            }}
            onOpenNewListingModal={() => setIsConsignmentModalOpen(true)}
            onOpenConsignmentModal={() => setIsConsignmentModalOpen(true)}
            isAdmin={isAdmin}
          />
        </main>

        <Footer 
          vehicleTitle="Wailtail Classic & Collector Auctions"
          siteLogo={effectiveSiteLogo}
          siteName={effectiveSiteName}
          siteTagline={effectiveSiteTagline}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-zinc-900 flex flex-col font-sans selection:bg-red-700 selection:text-white">
      {routeToast && (
        <div className="fixed top-4 right-4 z-50 max-w-md bg-red-800 text-white px-4 py-3 rounded-xl shadow-2xl border border-red-700 flex items-center justify-between gap-3 text-xs font-semibold animate-in fade-in slide-in-from-top-2">
          <span>{routeToast}</span>
          <button
            onClick={() => setRouteToast(null)}
            className="text-red-200 hover:text-white p-1"
          >
            ✕
          </button>
        </div>
      )}
      {/* 1. Navbar */}
      <Navbar
        userProfile={userProfile}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onOpenAdmin={() => navigateTo('/admin')}
        onOpenAccountHub={handleOpenAccountHub}
        onOpenListingEditor={() => navigateTo(`/dashboard/listings/${auction.id}/edit`)}
        onOpenShare={() => setIsShareModalOpen(true)}
        isWatching={isWatching}
        onToggleWatch={handleToggleWatch}
        watchCount={auction.watchCount ?? 18}
        auctionHeadline={auction.headline}
        auctionTitle={auction.title}
        siteLogo={effectiveSiteLogo}
        siteName={effectiveSiteName}
        siteTagline={effectiveSiteTagline}
        onNavigateHome={() => navigateTo('/')}
        onToggleCatalog={() => navigateTo('/')}
        onOpenConsignmentModal={() => setIsConsignmentModalOpen(true)}
        isCatalogView={false}
        totalAuctionsCount={allAuctions.length}
      />

      {/* 2. Top Auction Header (Countdown, High Bid, Reserve Status) */}
      <AuctionHeader
        auction={auction}
        onOpenBid={() => setIsBidModalOpen(true)}
        onScrollToComments={() => scrollToSection('comments-section')}
      />

      {/* Sticky Public Section Jump Navigation */}
      <ListingSubNav
        photoCount={currentMedia.fullGallery?.length || 0}
        videoCount={currentMedia.videoChapters?.length || 0}
        commentCount={comments.length}
      />

      {/* 3. Hero Media Carousel & Video Quick Launch */}
      <HeroMediaCarousel
        images={currentMedia.heroImages}
        onOpenLightbox={(idx) => setSelectedLightboxIndex(idx)}
        onScrollToVideo={() => scrollToSection('videos')}
        onScrollToGallery={() => scrollToSection('gallery')}
      />

      {/* 4. Main Body Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 flex-1 w-full space-y-12">
        {/* 1. Quick Lot Overview Listing Box (#overview) */}
        <section id="overview" className="bg-white rounded-xl border border-zinc-200/90 shadow-sm p-6 sm:p-8 scroll-mt-24">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Left: Summary Prose and Optional Featured Overview Image */}
            <div className="flex-1 space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-red-700">
                <FileText className="w-4 h-4" />
                <span>{currentMedia.overviewHeading || "Listing Overview"}</span>
              </div>
              
              <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight font-serif">
                {auction.title || "Lot #WT-911-1978: 1978 Porsche 911 Turbo-Look Coupe 'Whale Tail'"}
              </h2>

              {/* Optional Overview Target Image */}
              {currentMedia.overviewImage?.url && currentMedia.overviewImage.url.trim() !== '' && (
                <div 
                  onClick={() => handleOpenLightboxByUrl(currentMedia.overviewImage!.url)}
                  className="group relative rounded-xl overflow-hidden bg-zinc-100 border border-zinc-200 cursor-pointer shadow-sm my-4"
                >
                  <img
                    src={currentMedia.overviewImage.url}
                    alt={currentMedia.overviewImage.alt || "Listing Overview Image"}
                    className="w-full h-64 sm:h-80 object-cover group-hover:scale-[1.02] transition-transform duration-300"
                    referrerPolicy="no-referrer"
                  />
                  {currentMedia.overviewImage.caption && (
                    <div className="p-3 bg-zinc-900/90 text-zinc-200 text-xs flex items-center justify-between">
                      <span>{currentMedia.overviewImage.caption}</span>
                      <span className="text-[10px] text-zinc-400 font-mono">Click to inspect</span>
                    </div>
                  )}
                </div>
              )}

              <div className="text-sm sm:text-base text-zinc-700 space-y-3 leading-relaxed">
                {(currentMedia.overviewParagraphs && currentMedia.overviewParagraphs.length > 0) ? (
                  currentMedia.overviewParagraphs.map((p, pIdx) => (
                    <p key={pIdx}>{p}</p>
                  ))
                ) : (
                  <p className="italic text-zinc-400">
                    Detailed vehicle overview and provenance description pending.
                  </p>
                )}
              </div>
            </div>

            {/* Right: Quick Specifications Sidebar Card (#specs) */}
            <div id="specs" className="w-full lg:w-80 bg-zinc-50 rounded-xl p-5 border border-zinc-200 space-y-3.5 flex-shrink-0 text-xs scroll-mt-24">
              <h3 className="font-bold text-zinc-900 uppercase tracking-wider text-[11px] pb-2 border-b border-zinc-200 flex items-center justify-between">
                <span>Vehicle Highlights</span>
                <span className="text-red-700 font-mono font-bold">
                  {auction.highlightsBadge || currentMedia.highlightsBadge || "1978 911"}
                </span>
              </h3>

              <div className="space-y-2">
                {currentMedia.overviewSpecs && currentMedia.overviewSpecs.length > 0 ? (
                  currentMedia.overviewSpecs.map((spec, sIdx) => (
                    <div key={sIdx} className="flex justify-between py-1 border-b border-zinc-200/60 last:border-0">
                      <span className="text-zinc-500">{spec.label}:</span>
                      <span className="font-bold text-zinc-800 text-right ml-2">{spec.value}</span>
                    </div>
                  ))
                ) : (
                  <>
                    <div className="flex justify-between py-1 border-b border-zinc-200/60">
                      <span className="text-zinc-500">VIN:</span>
                      <span className="font-mono font-bold text-zinc-800">{auction.vin}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-200/60">
                      <span className="text-zinc-500">Odometer:</span>
                      <span className="font-bold text-zinc-800">
                        {auction.mileage 
                          ? (auction.mileage.includes('km') || auction.mileage.includes('mi')
                              ? auction.mileage 
                              : `${auction.mileage} ${auction.distanceUnit || 'km'}`)
                          : '126,200 km'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-200/60">
                      <span className="text-zinc-500">Engine:</span>
                      <span className="font-bold text-zinc-800">{auction.engine || '3.0L Flat-Six CIS'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-200/60">
                      <span className="text-zinc-500">Gearbox:</span>
                      <span className="font-bold text-zinc-800">{auction.drivetrain || '5-Speed Manual (915)'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-200/60">
                      <span className="text-zinc-500">Exterior Color:</span>
                      <span className="font-bold text-zinc-800">{auction.exteriorColor || 'Guards Red (027)'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-200/60">
                      <span className="text-zinc-500">Interior:</span>
                      <span className="font-bold text-zinc-800">{auction.interior || 'Black / Houndstooth'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-200/60">
                      <span className="text-zinc-500">Title:</span>
                      <span className="font-bold text-emerald-700">{auction.titleStatus || 'Clean Registration'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-zinc-200/60">
                      <span className="text-zinc-500">Location:</span>
                      <span className="font-bold text-zinc-800">{auction.location || 'Vancouver, BC, Canada'}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-zinc-500">Seller:</span>
                      <span className="font-bold text-zinc-800">{auction.sellerName || 'Private Consignor'}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Private auction badge */}
              <div className="pt-2 border-t border-zinc-200">
                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span><strong>Zero Buyer Fees:</strong> Direct offline settlement with the owner.</span>
                </div>
              </div>

              {/* Contact Seller Button with Auth Guard */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (!user) {
                      setIsAuthModalOpen(true);
                    } else {
                      setIsContactModalOpen(true);
                    }
                  }}
                  className="w-full py-2.5 px-3 rounded-lg bg-red-700 hover:bg-red-800 active:bg-red-900 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Contact Consignor / Private Inquiry</span>
                </button>
                <p className="text-[10px] text-zinc-400 text-center mt-1">
                  Inquiries, inspection booking & transport logistics
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Section A: In-Line Showcase Photos & Chapters */}
        <InlineShowcaseSection
          sections={currentMedia.inlineShowcase}
          onOpenLightboxWithUrl={handleOpenLightboxByUrl}
        />

        {/* 6. Embedded YouTube Playlist Video Section */}
        <YouTubePlaylistSection
          playlistUrl={currentMedia.youtubePlaylistUrl}
          videoTitle={currentMedia.videoTitle}
          videoSubtitle={currentMedia.videoSubtitle}
          chapters={currentMedia.videoChapters}
        />

        {/* 7. Section B: Full Photo Gallery Grid & Lightbox */}
        <PhotoGalleryGrid
          images={currentMedia.fullGallery}
          selectedImageIndex={selectedLightboxIndex}
          onOpenLightbox={(idx) => setSelectedLightboxIndex(idx)}
          onCloseLightbox={() => setSelectedLightboxIndex(null)}
        />

        {/* 8. Public Q&A Comment Thread & Real-Time Bids */}
        <CommentSection
          auction={auction}
          comments={comments}
          onOpenAuth={() => setIsAuthModalOpen(true)}
        />

        {/* 9. Multi-Car Inventory Catalog Section */}
        {allAuctions.length > 1 && (
          <section id="catalog-section" className="border-t border-zinc-200">
            <VehicleCatalogGrid
              auctions={allAuctions}
              activeAuctionId={activeAuctionId}
              onSelectAuction={(selectedId) => {
                setActiveAuctionId(selectedId);
                navigateTo(`/auctions/${selectedId}`);
              }}
              onOpenListingEditor={(selectedId) => {
                setActiveAuctionId(selectedId);
                navigateTo(`/dashboard/listings/${selectedId}/edit`);
              }}
              onOpenNewListingModal={() => setIsAdminModalOpen(true)}
              isAdmin={isAdmin}
            />
          </section>
        )}
      </main>

      {/* Sticky Bidding Bar */}
      <StickyBidBar
        auction={auction}
        thumbnailUrl={
          currentMedia.heroImages && currentMedia.heroImages.length > 0 && currentMedia.heroImages[0]?.trim() !== ''
            ? currentMedia.heroImages[0]
            : undefined
        }
        onOpenBid={() => setIsBidModalOpen(true)}
      />

      {/* Footer */}
      <Footer 
        vehicleTitle={auction.title}
        siteLogo={effectiveSiteLogo}
        siteName={effectiveSiteName}
        siteTagline={effectiveSiteTagline}
      />

      {/* Modals */}
      <BidModal
        isOpen={isBidModalOpen}
        onClose={() => setIsBidModalOpen(false)}
        auction={auction}
        onOpenAuth={() => {
          setIsBidModalOpen(false);
          setIsAuthModalOpen(true);
        }}
      />

      <ContactSellerModal
        isOpen={isContactModalOpen}
        onClose={() => setIsContactModalOpen(false)}
        auction={auction}
      />
    </div>
  );
};

  return (
    <>
      {renderRouteContent()}

      {/* Root Layout Hoisted Modals - Mounted Unconditionally Across All Views */}
      <UserAccountHubModal
        isOpen={isAccountHubOpen}
        onClose={() => setIsAccountHubOpen(false)}
        initialTab={accountHubTab}
        userProfile={userProfile}
        allAuctions={allAuctions}
        onNavigateToAuction={(targetId: string) => {
          setActiveAuctionId(targetId);
          navigateTo(`/auctions/${targetId}`);
        }}
        onOpenListingEditor={(targetId: string) => {
          setActiveAuctionId(targetId);
          navigateTo(`/dashboard/listings/${targetId}/edit`);
        }}
        onOpenBidModal={(targetId: string) => {
          setActiveAuctionId(targetId);
          if (activeAuctionId !== targetId) {
            navigateTo(`/auctions/${targetId}`);
          }
          setIsBidModalOpen(true);
        }}
        onOpenConsignmentModal={() => setIsConsignmentModalOpen(true)}
        onBrowseCatalog={() => navigateTo('/')}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />

      <ConsignmentModal
        isOpen={isConsignmentModalOpen}
        onClose={() => setIsConsignmentModalOpen(false)}
        onLaunchDirectListing={handleLaunchListingWorkspace}
      />

      {isAdmin && (
        <AdminPanelModal
          isOpen={isAdminModalOpen}
          onClose={() => setIsAdminModalOpen(false)}
          auction={auction}
          bids={bids}
          mediaConfig={currentMedia}
          onUpdateMediaConfig={handleUpdateMediaConfig}
          onOpenWorkspace={() => navigateTo(`/dashboard/listings/${activeAuctionId || auction.id}/edit`)}
          allAuctions={allAuctions}
          onSelectAuction={(newAuctionId: string) => {
            setActiveAuctionId(newAuctionId);
            navigateTo(`/dashboard/listings/${newAuctionId}/edit`);
          }}
        />
      )}

      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        title={auction.title || "Wailtail Single-Car Auctions"}
      />
    </>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AuctionAppContent />
    </AuthProvider>
  );
}
