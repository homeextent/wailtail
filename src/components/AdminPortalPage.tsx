import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Auction, 
  Bid, 
  UserProfile, 
  UserRole, 
  MediaConfiguration, 
  ConsignmentApplication 
} from '../types';
import { 
  fetchPaginatedBidders, 
  fetchPaginatedConsignments,
  updateUserRole,
  setUserBannedStatus,
  setUserEmailVerified,
  deleteUserRecord,
  convertConsignmentToDraftListing,
  createNewListing,
  purgeAllListings,
  updateAuctionConfig,
  compressImageDataUrl,
  uploadImageToStorage,
  MAIN_AUCTION_ID
} from '../services/auctionService';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import { WailtailLogo } from './WailtailLogo';
import { 
  Users, 
  FileText, 
  Trophy, 
  Palette, 
  Search, 
  Plus, 
  Car, 
  ArrowLeft, 
  ExternalLink, 
  ShieldCheck, 
  CheckCircle, 
  AlertTriangle, 
  Ban, 
  UserCheck, 
  Trash2, 
  ChevronLeft, 
  ChevronRight, 
  Zap, 
  MapPin, 
  Upload, 
  RotateCcw, 
  Save, 
  DollarSign, 
  Check, 
  Clock, 
  Flame, 
  SlidersHorizontal,
  Mail,
  Phone,
  Tag,
  Sparkles,
  RefreshCw,
  X
} from 'lucide-react';

interface AdminPortalPageProps {
  auction: Auction;
  allAuctions: Auction[];
  bids: Bid[];
  mediaConfig: MediaConfiguration;
  onUpdateMediaConfig: (newConfig: MediaConfiguration) => Promise<void> | void;
  onNavigateHome: () => void;
  onOpenListingEditor: (auctionId?: string) => void;
  onSelectAuction?: (auctionId: string) => void;
}

export const AdminPortalPage: React.FC<AdminPortalPageProps> = ({
  auction,
  allAuctions,
  bids,
  mediaConfig,
  onUpdateMediaConfig,
  onNavigateHome,
  onOpenListingEditor,
  onSelectAuction
}) => {
  const { user: authUser, userProfile: authUserProfile } = useAuth();

  // Active Management Tab: 'bidders' | 'consignments' | 'ledger' | 'branding'
  const [activeTab, setActiveTab] = useState<'bidders' | 'consignments' | 'ledger' | 'branding'>('bidders');

  // Notification Toast
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4500);
  };

  // -------------------------------------------------------------
  // TAB 1: BIDDER REGISTRY STATE (PAGINATED & FILTERED)
  // -------------------------------------------------------------
  const [bidderPage, setBidderPage] = useState<number>(1);
  const [bidderPageSize, setBidderPageSize] = useState<number>(10);
  const [bidderSearch, setBidderSearch] = useState<string>('');
  const [bidderRoleFilter, setBidderRoleFilter] = useState<string>('ALL');
  const [bidderStatusFilter, setBidderStatusFilter] = useState<string>('ALL');
  const [biddersList, setBiddersList] = useState<UserProfile[]>([]);
  const [biddersTotal, setBiddersTotal] = useState<number>(0);
  const [biddersTotalPages, setBiddersTotalPages] = useState<number>(1);
  const [loadingBidders, setLoadingBidders] = useState<boolean>(false);
  const [moderatingBidderId, setModeratingBidderId] = useState<string | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<UserProfile | null>(null);
  const [deletingUser, setDeletingUser] = useState<boolean>(false);

  // Load paginated bidders
  const loadBidders = useCallback(async () => {
    setLoadingBidders(true);
    try {
      const res = await fetchPaginatedBidders({
        page: bidderPage,
        pageSize: bidderPageSize,
        searchQuery: bidderSearch,
        roleFilter: bidderRoleFilter,
        banFilter: bidderStatusFilter
      });
      setBiddersList(res.items);
      setBiddersTotal(res.total);
      setBiddersTotalPages(res.totalPages);
    } catch (err: any) {
      console.error('Error fetching paginated bidders:', err);
      showToast('Could not load bidder profiles: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setLoadingBidders(false);
    }
  }, [bidderPage, bidderPageSize, bidderSearch, bidderRoleFilter, bidderStatusFilter]);

  useEffect(() => {
    loadBidders();
  }, [loadBidders]);

  // Handle Role Change
  const handleRoleChange = async (targetUser: UserProfile, newRole: UserRole) => {
    const currentAdminId = authUser?.uid || authUserProfile?.uid;
    const isSelf = Boolean(
      (currentAdminId && currentAdminId === targetUser.uid) ||
      (authUser?.email && targetUser.email && authUser.email.toLowerCase() === targetUser.email.toLowerCase())
    );

    if (isSelf && targetUser.role?.toUpperCase() === 'ADMIN' && newRole !== 'ADMIN') {
      showToast('Self-Demotion Guard: You cannot demote your own active administrator account.', 'error');
      return;
    }

    setModeratingBidderId(targetUser.uid);
    try {
      await updateUserRole(targetUser.uid, newRole);
      setBiddersList(prev => prev.map(b => b.uid === targetUser.uid ? { ...b, role: newRole.toLowerCase() as any } : b));
      showToast(`Assigned ${newRole} role to ${targetUser.displayName || targetUser.email}.`);
    } catch (err: any) {
      showToast(`Failed to update role: ${err.message || 'Error'}`, 'error');
    } finally {
      setModeratingBidderId(null);
    }
  };

  // Handle Verified Toggle
  const handleToggleVerified = async (targetUser: UserProfile) => {
    const nextVerified = !targetUser.isEmailVerified;
    setModeratingBidderId(targetUser.uid);
    try {
      await setUserEmailVerified(targetUser.uid, nextVerified);
      setBiddersList(prev => prev.map(b => b.uid === targetUser.uid ? { ...b, isEmailVerified: nextVerified } : b));
      showToast(`Email status set to ${nextVerified ? 'Verified' : 'Unverified'} for ${targetUser.displayName || targetUser.email}.`);
    } catch (err: any) {
      showToast(`Failed to update verification: ${err.message || 'Error'}`, 'error');
    } finally {
      setModeratingBidderId(null);
    }
  };

  // Handle Ban / Unban Toggle
  const handleToggleBan = async (targetUser: UserProfile) => {
    const currentAdminId = authUser?.uid || authUserProfile?.uid;
    const isSelf = Boolean(
      (currentAdminId && currentAdminId === targetUser.uid) ||
      (authUser?.email && targetUser.email && authUser.email.toLowerCase() === targetUser.email.toLowerCase())
    );
    const isUserBanned = Boolean(targetUser.isBanned || targetUser.bannedFromBidding);

    if (isSelf && !isUserBanned) {
      showToast('Self-Demotion Guard: You cannot ban your own active administrator account.', 'error');
      return;
    }

    const nextBanned = !isUserBanned;
    setModeratingBidderId(targetUser.uid);
    try {
      await setUserBannedStatus(targetUser.uid, nextBanned);
      setBiddersList(prev => prev.map(b => b.uid === targetUser.uid ? { ...b, isBanned: nextBanned, bannedFromBidding: nextBanned } : b));
      showToast(`${nextBanned ? 'Banned' : 'Unbanned'} ${targetUser.displayName || targetUser.email}.`);
    } catch (err: any) {
      showToast(`Failed to update ban status: ${err.message || 'Error'}`, 'error');
    } finally {
      setModeratingBidderId(null);
    }
  };

  // Handle User Deletion
  const handleDeleteUserSubmit = async () => {
    if (!confirmDeleteUser) return;
    const currentAdminId = authUser?.uid || authUserProfile?.uid;
    const isSelf = Boolean(
      (currentAdminId && currentAdminId === confirmDeleteUser.uid) ||
      (authUser?.email && confirmDeleteUser.email && authUser.email.toLowerCase() === confirmDeleteUser.email.toLowerCase())
    );

    if (isSelf) {
      showToast('Self-Deletion Guard: You cannot delete your own active administrator account.', 'error');
      setConfirmDeleteUser(null);
      return;
    }

    const targetId = confirmDeleteUser.uid;
    const targetEmail = confirmDeleteUser.email || 'User';
    setDeletingUser(true);
    try {
      await deleteUserRecord(targetId);
      setBiddersList(prev => prev.filter(b => b.uid !== targetId));
      setBiddersTotal(prev => Math.max(0, prev - 1));
      showToast(`Permanently deleted account for ${targetEmail}.`);
      setConfirmDeleteUser(null);
    } catch (err: any) {
      showToast(`Failed to delete account: ${err.message || 'Error'}`, 'error');
    } finally {
      setDeletingUser(false);
    }
  };

  // -------------------------------------------------------------
  // TAB 2: CONSIGNMENT APPLICATIONS STATE (PAGINATED & FILTERED)
  // -------------------------------------------------------------
  const [consignmentPage, setConsignmentPage] = useState<number>(1);
  const [consignmentPageSize, setConsignmentPageSize] = useState<number>(8);
  const [consignmentSearch, setConsignmentSearch] = useState<string>('');
  const [consignmentStatusFilter, setConsignmentStatusFilter] = useState<string>('ALL');
  const [consignmentsList, setConsignmentsList] = useState<ConsignmentApplication[]>([]);
  const [consignmentsTotal, setConsignmentsTotal] = useState<number>(0);
  const [consignmentsTotalPages, setConsignmentsTotalPages] = useState<number>(1);
  const [loadingConsignments, setLoadingConsignments] = useState<boolean>(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  // Load paginated consignments
  const loadConsignments = useCallback(async () => {
    setLoadingConsignments(true);
    try {
      const res = await fetchPaginatedConsignments({
        page: consignmentPage,
        pageSize: consignmentPageSize,
        searchQuery: consignmentSearch,
        statusFilter: consignmentStatusFilter
      });
      setConsignmentsList(res.items);
      setConsignmentsTotal(res.total);
      setConsignmentsTotalPages(res.totalPages);
    } catch (err: any) {
      console.error('Error fetching paginated consignments:', err);
      showToast('Could not load consignments: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setLoadingConsignments(false);
    }
  }, [consignmentPage, consignmentPageSize, consignmentSearch, consignmentStatusFilter]);

  useEffect(() => {
    loadConsignments();
  }, [loadConsignments]);

  // Convert consignment to draft listing
  const handleConvertConsignment = async (app: ConsignmentApplication) => {
    if (!app.id) return;
    setConvertingId(app.id);
    try {
      const newAuctionId = await convertConsignmentToDraftListing(app.id);
      setConsignmentsList(prev => prev.map(c => c.id === app.id ? { ...c, status: 'approved', convertedAuctionId: newAuctionId } : c));
      showToast(`Draft listing created for ${app.year} ${app.make} ${app.model}! (Lot ID: ${newAuctionId})`);
    } catch (err: any) {
      showToast(`Conversion failed: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      setConvertingId(null);
    }
  };

  // -------------------------------------------------------------
  // TAB 3: WINNER & SETTLEMENT LEDGER STATE
  // -------------------------------------------------------------
  const [selectedLedgerLotId, setSelectedLedgerLotId] = useState<string>(auction.id || allAuctions[0]?.id || '');
  const activeLedgerAuction = useMemo(() => {
    return allAuctions.find(a => a.id === selectedLedgerLotId) || auction;
  }, [allAuctions, selectedLedgerLotId, auction]);

  // -------------------------------------------------------------
  // TAB 4: SITE BRANDING & GLOBAL SETTINGS STATE
  // -------------------------------------------------------------
  const [siteLogo, setSiteLogo] = useState(mediaConfig.siteLogo || auction.siteLogo || '');
  const [siteName, setSiteName] = useState(mediaConfig.siteName || auction.siteName || 'wailtail');
  const [siteTagline, setSiteTagline] = useState(mediaConfig.siteTagline || auction.siteTagline || 'Single-Car Auctions');
  const [defaultStartingBid, setDefaultStartingBid] = useState<number>(auction.startingBid || 1000);
  const [defaultMinIncrement, setDefaultMinIncrement] = useState<number>(auction.minimumIncrement || 250);
  const [savingBranding, setSavingBranding] = useState<boolean>(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mediaConfig.siteLogo !== undefined) setSiteLogo(mediaConfig.siteLogo);
    if (mediaConfig.siteName) setSiteName(mediaConfig.siteName);
    if (mediaConfig.siteTagline) setSiteTagline(mediaConfig.siteTagline);
  }, [mediaConfig]);

  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image file (PNG, SVG, JPG, WebP).', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const rawResult = reader.result as string;
        const compressed = await compressImageDataUrl(rawResult);
        const result = await uploadImageToStorage(auction.id || MAIN_AUCTION_ID, compressed, 'branding');
        setSiteLogo(result);
        showToast('Emblem logo uploaded! Click "Save Global Settings" to persist.');
      } catch (err: any) {
        showToast('Logo upload failed: ' + err.message, 'error');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveGlobalSettings = async () => {
    setSavingBranding(true);
    try {
      const targetAuctionId = auction.id?.trim() || MAIN_AUCTION_ID;
      await updateAuctionConfig(targetAuctionId, {
        siteLogo,
        siteName,
        siteTagline,
        startingBid: Number(defaultStartingBid),
        minimumIncrement: Number(defaultMinIncrement),
        currency: 'CAD'
      });

      const updatedMedia: MediaConfiguration = {
        ...mediaConfig,
        siteLogo,
        siteName,
        siteTagline
      };
      await onUpdateMediaConfig(updatedMedia);

      showToast('Branding identity and CAD defaults saved successfully across the platform!');
    } catch (err: any) {
      showToast('Failed to save settings: ' + (err.message || 'Error'), 'error');
    } finally {
      setSavingBranding(false);
    }
  };

  // -------------------------------------------------------------
  // MODALS & DIALOGS: NEW LISTING CREATION
  // -------------------------------------------------------------
  const [showNewListingModal, setShowNewListingModal] = useState<boolean>(false);
  const [newListingTitle, setNewListingTitle] = useState<string>('');
  const [creatingListing, setCreatingListing] = useState<boolean>(false);

  const handleCreateNewListing = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = newListingTitle.trim();
    if (!cleanTitle) return;

    setCreatingListing(true);
    try {
      const newLot = await createNewListing(cleanTitle);
      showToast(`Created vehicle lot: "${newLot.title}". Redirecting to listing editor...`);
      setShowNewListingModal(false);
      setNewListingTitle('');
      if (onSelectAuction) onSelectAuction(newLot.id);
      onOpenListingEditor(newLot.id);
    } catch (err: any) {
      showToast(`Failed to create lot: ${err.message || 'Error'}`, 'error');
    } finally {
      setCreatingListing(false);
    }
  };

  // Top Metrics Calculation
  const totalAuctionsCount = allAuctions.length;
  const liveAuctionsCount = allAuctions.filter(a => a.status === 'active' || a.status === 'upcoming').length;

  return (
    <div className="min-h-screen bg-[#0d1114] text-zinc-100 flex flex-col font-sans selection:bg-red-700 selection:text-white pb-20">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 max-w-md animate-in fade-in slide-in-from-top-3 duration-200">
          <div className={`p-4 rounded-xl shadow-2xl border flex items-center justify-between gap-3 text-xs font-semibold ${
            toastMessage.type === 'error'
              ? 'bg-red-950/95 border-red-700 text-red-100'
              : toastMessage.type === 'info'
              ? 'bg-zinc-900/95 border-zinc-700 text-zinc-200'
              : 'bg-emerald-950/95 border-emerald-600 text-emerald-100'
          }`}>
            <div className="flex items-center gap-2.5">
              {toastMessage.type === 'error' ? (
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              ) : toastMessage.type === 'info' ? (
                <Sparkles className="w-4 h-4 text-zinc-400 shrink-0" />
              ) : (
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <span>{toastMessage.text}</span>
            </div>
            <button
              onClick={() => setToastMessage(null)}
              className="text-zinc-400 hover:text-white p-1 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 1. TOP OPERATIONS NAV BAR */}
      <header className="sticky top-0 z-40 bg-[#121619] border-b border-zinc-800 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Left: Branding & Portal Badge */}
          <div className="flex items-center gap-3">
            <button
              onClick={onNavigateHome}
              className="p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-all border border-zinc-700 flex items-center gap-1.5 text-xs font-semibold"
              title="Return to Public Catalog"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back to Site</span>
            </button>

            <div className="h-6 w-px bg-zinc-800 hidden sm:block" />

            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-red-700 flex items-center justify-center font-bold text-white shadow-inner">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-sm sm:text-base font-extrabold tracking-tight text-white uppercase font-sans">
                    Operations Portal
                  </h1>
                  <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-red-950 text-red-300 border border-red-800/80">
                    /admin
                  </span>
                </div>
                <p className="text-[10px] text-zinc-400 hidden sm:block">
                  Centralized platform management, bidder registry & consignment pipeline
                </p>
              </div>
            </div>
          </div>

          {/* Right: Direct Action Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setShowNewListingModal(true)}
              className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ New Listing</span>
            </button>

            <button
              type="button"
              onClick={onNavigateHome}
              className="px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white border border-zinc-700 flex items-center gap-1.5 transition-all shadow-xs"
            >
              <span>Open Catalog</span>
              <span className="text-zinc-400">→</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. TOP ANALYTICS HEADER & OPERATIONAL METRICS */}
      <section className="bg-[#151a1e] border-b border-zinc-800/90 py-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-widest text-red-500">
                Platform Intelligence
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Operational Overview
              </h2>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Live Firestore Database Connected</span>
            </div>
          </div>

          {/* 4 Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="p-4 rounded-xl bg-zinc-900/90 border border-zinc-800/80 shadow-xs">
              <div className="flex items-center justify-between text-zinc-400 text-xs mb-1 font-semibold">
                <span>Total Members</span>
                <Users className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-2xl font-black text-white font-mono">{biddersTotal || biddersList.length}</div>
              <div className="text-[11px] text-zinc-500 mt-1">Authenticated bidders & sellers</div>
            </div>

            <div className="p-4 rounded-xl bg-zinc-900/90 border border-zinc-800/80 shadow-xs">
              <div className="flex items-center justify-between text-zinc-400 text-xs mb-1 font-semibold">
                <span>Total Consignments</span>
                <FileText className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-black text-emerald-400 font-mono">{consignmentsTotal || consignmentsList.length}</div>
              <div className="text-[11px] text-zinc-500 mt-1">Inbound vehicle applications</div>
            </div>

            <div className="p-4 rounded-xl bg-zinc-900/90 border border-zinc-800/80 shadow-xs">
              <div className="flex items-center justify-between text-zinc-400 text-xs mb-1 font-semibold">
                <span>Pending Approvals</span>
                <Clock className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-black text-amber-400 font-mono">
                {consignmentsList.filter(c => !c.status || c.status === 'pending').length}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1">Requiring consignor review</div>
            </div>

            <div className="p-4 rounded-xl bg-zinc-900/90 border border-zinc-800/80 shadow-xs">
              <div className="flex items-center justify-between text-zinc-400 text-xs mb-1 font-semibold">
                <span>Vehicle Lots</span>
                <Car className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-2xl font-black text-purple-400 font-mono">{totalAuctionsCount}</div>
              <div className="text-[11px] text-zinc-500 mt-1">{liveAuctionsCount} active or scheduled</div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. PRIMARY TABS NAVIGATION */}
      <nav className="bg-[#121619] border-b border-zinc-800 sticky top-16 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 overflow-x-auto py-2.5">
            <button
              onClick={() => setActiveTab('bidders')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'bidders'
                  ? 'bg-red-700 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/70'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Bidder Registry</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                activeTab === 'bidders' ? 'bg-red-950 text-red-200' : 'bg-zinc-800 text-zinc-400'
              }`}>
                {biddersTotal}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('consignments')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'consignments'
                  ? 'bg-red-700 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/70'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Consignment Pipeline</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                activeTab === 'consignments' ? 'bg-red-950 text-red-200' : 'bg-zinc-800 text-zinc-400'
              }`}>
                {consignmentsTotal}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('ledger')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'ledger'
                  ? 'bg-red-700 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/70'
              }`}
            >
              <Trophy className="w-4 h-4" />
              <span>Winner & Settlement Ledger</span>
            </button>

            <button
              onClick={() => setActiveTab('branding')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'branding'
                  ? 'bg-red-700 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/70'
              }`}
            >
              <Palette className="w-4 h-4" />
              <span>Site Branding & Global Settings</span>
            </button>
          </div>
        </div>
      </nav>

      {/* 4. MAIN BODY CONTAINER */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-1">
        {/* =================================================================== */}
        {/* TAB 1: BIDDER REGISTRY */}
        {/* =================================================================== */}
        {activeTab === 'bidders' && (
          <div className="space-y-6">
            {/* Search & Filtering Toolbar */}
            <div className="bg-[#151a1e] rounded-2xl border border-zinc-800 p-5 space-y-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Users className="w-5 h-5 text-red-500" />
                    <span>Bidder Registry Management</span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Live authenticated member directory, 3-way role assignment, ban toggles, and email overrides
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-zinc-400">Total:</span>
                  <span className="font-mono font-bold text-white bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700">
                    {biddersTotal} member{biddersTotal === 1 ? '' : 's'}
                  </span>
                </div>
              </div>

              {/* Filters Row */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center pt-2 border-t border-zinc-800/80">
                {/* Search Bar */}
                <div className="sm:col-span-6 relative">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={bidderSearch}
                    onChange={(e) => {
                      setBidderSearch(e.target.value);
                      setBidderPage(1);
                    }}
                    placeholder="Search members by name, email, or phone..."
                    className="w-full pl-9 pr-8 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-600"
                  />
                  {bidderSearch && (
                    <button
                      onClick={() => {
                        setBidderSearch('');
                        setBidderPage(1);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Role Filter Dropdown */}
                <div className="sm:col-span-3">
                  <select
                    value={bidderRoleFilter}
                    onChange={(e) => {
                      setBidderRoleFilter(e.target.value);
                      setBidderPage(1);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 font-semibold focus:outline-none focus:ring-2 focus:ring-red-600 cursor-pointer"
                  >
                    <option value="ALL">All Roles (Admin, Seller, Bidder)</option>
                    <option value="ADMIN">Role: ADMIN Only</option>
                    <option value="SELLER">Role: SELLER Only</option>
                    <option value="BIDDER">Role: BIDDER Only</option>
                  </select>
                </div>

                {/* Status Filter Dropdown */}
                <div className="sm:col-span-3">
                  <select
                    value={bidderStatusFilter}
                    onChange={(e) => {
                      setBidderStatusFilter(e.target.value);
                      setBidderPage(1);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 font-semibold focus:outline-none focus:ring-2 focus:ring-red-600 cursor-pointer"
                  >
                    <option value="ALL">All Account Statuses</option>
                    <option value="VERIFIED">Status: Verified Only</option>
                    <option value="BANNED">Status: Banned Only</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Bidders Table */}
            <div className="bg-[#151a1e] rounded-2xl border border-zinc-800 shadow-sm overflow-hidden">
              {loadingBidders ? (
                <div className="py-20 flex flex-col items-center justify-center space-y-3 text-zinc-400">
                  <RefreshCw className="w-8 h-8 animate-spin text-red-500" />
                  <span className="text-xs font-semibold">Querying member records from Firestore...</span>
                </div>
              ) : biddersList.length === 0 ? (
                /* Empty Search State Card */
                <div className="py-16 px-6 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center mx-auto text-zinc-500">
                    <Users className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-zinc-200">No member profiles match your search</h4>
                  <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                    Try adjusting your search terms or clearing your role and status filter criteria.
                  </p>
                  {(bidderSearch || bidderRoleFilter !== 'ALL' || bidderStatusFilter !== 'ALL') && (
                    <button
                      onClick={() => {
                        setBidderSearch('');
                        setBidderRoleFilter('ALL');
                        setBidderStatusFilter('ALL');
                        setBidderPage(1);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700"
                    >
                      Clear All Filters
                    </button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-zinc-800/80">
                  {biddersList.map((userItem) => {
                    const currentAdminId = authUser?.uid || authUserProfile?.uid;
                    const isSelf = Boolean(
                      (currentAdminId && currentAdminId === userItem.uid) ||
                      (authUser?.email && userItem.email && authUser.email.toLowerCase() === userItem.email.toLowerCase())
                    );
                    const isUserBanned = Boolean(userItem.isBanned || userItem.bannedFromBidding);
                    const isUserAdmin = userItem.role?.toUpperCase() === 'ADMIN';
                    const isUserSeller = userItem.role?.toUpperCase() === 'SELLER';
                    const currentRoleUpper: UserRole = isUserAdmin ? 'ADMIN' : isUserSeller ? 'SELLER' : 'BIDDER';

                    return (
                      <div
                        key={userItem.uid}
                        className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-zinc-900/40 transition-colors"
                      >
                        {/* Member Identity Details */}
                        <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                          <div className={`w-10 h-10 rounded-xl font-black flex items-center justify-center uppercase shrink-0 text-sm border ${
                            isUserBanned 
                              ? 'bg-red-950/80 text-red-400 border-red-800' 
                              : isUserAdmin
                              ? 'bg-red-900 text-white border-red-700'
                              : isUserSeller
                              ? 'bg-purple-950/80 text-purple-300 border-purple-800'
                              : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                          }`}>
                            {userItem.displayName ? userItem.displayName[0] : 'U'}
                          </div>

                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`font-bold text-sm ${isUserBanned ? 'line-through text-red-400' : 'text-zinc-100'}`}>
                                {userItem.displayName || 'Anonymous Member'}
                              </span>

                              {isSelf && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-blue-950 text-blue-300 border border-blue-800">
                                  You (Active Session)
                                </span>
                              )}

                              {isUserBanned && (
                                <span className="px-2 py-0.5 rounded bg-red-700 text-white font-black text-[10px] uppercase tracking-wider">
                                  BANNED
                                </span>
                              )}

                              {userItem.isEmailVerified ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                                  <CheckCircle className="w-3 h-3 text-emerald-400" />
                                  <span>Verified</span>
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                                  <span>Unverified</span>
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
                              <span className="font-mono text-[11px] text-zinc-300">{userItem.email}</span>
                              {userItem.phone && <span>Phone: <strong className="text-zinc-300">{userItem.phone}</strong></span>}
                              {userItem.registeredAt && (
                                <span>Joined: <strong className="text-zinc-400 font-mono text-[11px]">{formatDateTime(userItem.registeredAt)}</strong></span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Interactive Controls & 3-Way Role Selector */}
                        <div className="flex items-center gap-2.5 flex-wrap self-end md:self-center shrink-0">
                          {/* 3-Way Role Selector Dropdown (ADMIN <-> SELLER <-> BIDDER) */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold uppercase text-zinc-500">Role:</span>
                            <select
                              value={currentRoleUpper}
                              disabled={moderatingBidderId === userItem.uid || (isSelf && isUserAdmin)}
                              onChange={(e) => handleRoleChange(userItem, e.target.value as UserRole)}
                              title={isSelf && isUserAdmin ? 'Self-Demotion Guard: Cannot change own role' : 'Select user role'}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider border cursor-pointer ${
                                currentRoleUpper === 'ADMIN'
                                  ? 'bg-red-950 text-red-300 border-red-700'
                                  : currentRoleUpper === 'SELLER'
                                  ? 'bg-purple-950 text-purple-300 border-purple-700'
                                  : 'bg-zinc-900 text-zinc-300 border-zinc-700'
                              } disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none`}
                            >
                              <option value="ADMIN">ADMIN</option>
                              <option value="SELLER">SELLER</option>
                              <option value="BIDDER">BIDDER</option>
                            </select>
                          </div>

                          {/* Email Verified Toggle */}
                          <button
                            type="button"
                            disabled={moderatingBidderId === userItem.uid}
                            onClick={() => handleToggleVerified(userItem)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1 ${
                              userItem.isEmailVerified
                                ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border-zinc-700'
                                : 'bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border-emerald-700 font-bold'
                            } disabled:opacity-40`}
                          >
                            {userItem.isEmailVerified ? 'Mark Unverified' : 'Verify Email'}
                          </button>

                          {/* Ban / Unban Toggle */}
                          <button
                            type="button"
                            disabled={moderatingBidderId === userItem.uid || (isSelf && !isUserBanned)}
                            onClick={() => handleToggleBan(userItem)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                              isUserBanned
                                ? 'bg-zinc-800 hover:bg-zinc-700 text-white border-zinc-600'
                                : 'bg-red-950 hover:bg-red-900 text-red-300 border-red-800'
                            } disabled:opacity-40 disabled:cursor-not-allowed`}
                          >
                            {isUserBanned ? (
                              <>
                                <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Unban</span>
                              </>
                            ) : (
                              <>
                                <Ban className="w-3.5 h-3.5 text-red-400" />
                                <span>Ban</span>
                              </>
                            )}
                          </button>

                          {/* Delete User Action */}
                          <button
                            type="button"
                            disabled={moderatingBidderId === userItem.uid || isSelf}
                            onClick={() => setConfirmDeleteUser(userItem)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-950/60 border border-transparent hover:border-red-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                            title={isSelf ? 'Self-Deletion Guard' : 'Delete user record'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pagination Controls */}
              {biddersTotal > 0 && (
                <div className="p-4 bg-zinc-900/60 border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-400">
                  <div className="flex items-center gap-2">
                    <span>Showing</span>
                    <span className="font-bold text-white font-mono">
                      {Math.min((bidderPage - 1) * bidderPageSize + 1, biddersTotal)}–
                      {Math.min(bidderPage * bidderPageSize, biddersTotal)}
                    </span>
                    <span>of</span>
                    <span className="font-bold text-white font-mono">{biddersTotal}</span>
                    <span>members</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setBidderPage(prev => Math.max(1, prev - 1))}
                      disabled={bidderPage <= 1}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed border border-zinc-700 flex items-center gap-1 font-semibold"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>Previous</span>
                    </button>

                    <span className="px-3 py-1.5 rounded-lg bg-zinc-900 font-mono font-bold text-zinc-200 border border-zinc-800">
                      {bidderPage} / {biddersTotalPages}
                    </span>

                    <button
                      onClick={() => setBidderPage(prev => Math.min(biddersTotalPages, prev + 1))}
                      disabled={bidderPage >= biddersTotalPages}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed border border-zinc-700 flex items-center gap-1 font-semibold"
                    >
                      <span>Next</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: CONSIGNMENT APPLICATIONS PIPELINE */}
        {/* =================================================================== */}
        {activeTab === 'consignments' && (
          <div className="space-y-6">
            {/* Search & Filtering Toolbar */}
            <div className="bg-[#151a1e] rounded-2xl border border-zinc-800 p-5 space-y-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <FileText className="w-5 h-5 text-emerald-400" />
                    <span>Consignment Applications Pipeline</span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Review seller applications, inspect structured specs, and execute 1-click draft lot provisioning
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-zinc-400">Total:</span>
                  <span className="font-mono font-bold text-white bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700">
                    {consignmentsTotal} submission{consignmentsTotal === 1 ? '' : 's'}
                  </span>
                </div>
              </div>

              {/* Status Filter Tabs and Search */}
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-2 border-t border-zinc-800/80">
                {/* Search Bar */}
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={consignmentSearch}
                    onChange={(e) => {
                      setConsignmentSearch(e.target.value);
                      setConsignmentPage(1);
                    }}
                    placeholder="Search by make, model, VIN, or consignor email/name..."
                    className="w-full pl-9 pr-8 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                  {consignmentSearch && (
                    <button
                      onClick={() => {
                        setConsignmentSearch('');
                        setConsignmentPage(1);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Status Filter Tabs (ALL, PENDING, APPROVED, REJECTED) */}
                <div className="flex items-center gap-1.5 bg-zinc-900 p-1 rounded-xl border border-zinc-800 text-xs font-semibold overflow-x-auto">
                  {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => {
                        setConsignmentStatusFilter(st);
                        setConsignmentPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                        consignmentStatusFilter === st
                          ? 'bg-zinc-800 text-white shadow-xs font-bold border border-zinc-700'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Consignments Cards List */}
            {loadingConsignments ? (
              <div className="bg-[#151a1e] rounded-2xl border border-zinc-800 p-16 flex flex-col items-center justify-center space-y-3 text-zinc-400">
                <RefreshCw className="w-8 h-8 animate-spin text-emerald-400" />
                <span className="text-xs font-semibold">Loading consignment applications...</span>
              </div>
            ) : consignmentsList.length === 0 ? (
              <div className="bg-[#151a1e] rounded-2xl border border-zinc-800 p-16 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center mx-auto text-zinc-500">
                  <FileText className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-zinc-200">No consignment applications found</h4>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                  No submissions match your active filter and search terms.
                </p>
                {(consignmentSearch || consignmentStatusFilter !== 'ALL') && (
                  <button
                    onClick={() => {
                      setConsignmentSearch('');
                      setConsignmentStatusFilter('ALL');
                      setConsignmentPage(1);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700"
                  >
                    Clear Filter Criteria
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {consignmentsList.map((app) => {
                  const structuredLocation = [app.locationCity, app.locationProvince, app.locationCountry].filter(Boolean).join(', ') || app.location;
                  const isConverted = Boolean(app.convertedAuctionId || app.status === 'approved');
                  const convertedAuctionId = app.convertedAuctionId;

                  // Member Auto-Link Badge (ADMIN / BIDDER / GUEST)
                  const memberBadge = app.registeredUserRole 
                    ? app.registeredUserRole.toUpperCase() 
                    : app.isRegisteredUser 
                    ? 'BIDDER' 
                    : 'GUEST';

                  return (
                    <div
                      key={app.id}
                      className="bg-[#151a1e] rounded-2xl border border-zinc-800 p-5 sm:p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-5 hover:border-zinc-700 transition-all"
                    >
                      {/* Vehicle & Consignor Info */}
                      <div className="space-y-3 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-base sm:text-lg font-bold text-white tracking-tight">
                            {app.year} {app.make} {app.model}
                          </h4>

                          {/* 3-Tier Taxonomy Generation */}
                          {app.generation && (
                            <span className="px-2.5 py-0.5 rounded-lg bg-zinc-800 text-zinc-300 font-semibold text-xs border border-zinc-700 font-mono">
                              {app.generation}
                            </span>
                          )}

                          {/* Auto-link Member Badge */}
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                            memberBadge === 'ADMIN'
                              ? 'bg-red-950 text-red-300 border border-red-800'
                              : memberBadge === 'BIDDER'
                              ? 'bg-blue-950 text-blue-300 border border-blue-800'
                              : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                          }`}>
                            {memberBadge}
                          </span>

                          {/* Status Badge */}
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            app.status === 'approved'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : app.status === 'declined' || app.status === 'rejected'
                              ? 'bg-red-950 text-red-300 border border-red-800'
                              : 'bg-amber-950 text-amber-300 border border-amber-800'
                          }`}>
                            {app.status || 'PENDING'}
                          </span>
                        </div>

                        {/* Metadata Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-zinc-400">
                          <div className="space-y-0.5">
                            <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold block">Consignor</span>
                            <span className="font-bold text-zinc-200">{app.sellerName}</span>
                            <span className="block font-mono text-zinc-400 text-[11px] truncate">{app.sellerEmail}</span>
                            {app.sellerPhone && <span className="block text-zinc-400">{app.sellerPhone}</span>}
                          </div>

                          <div className="space-y-0.5">
                            <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold block">Vehicle Specs & VIN</span>
                            {app.vin ? (
                              <span className="font-mono text-zinc-300 font-bold block">VIN: {app.vin}</span>
                            ) : (
                              <span className="italic text-zinc-500 block">No VIN provided</span>
                            )}
                            {app.mileage && <span className="block">Odometer: {app.mileage}</span>}
                            {structuredLocation && (
                              <div className="flex items-center gap-1 text-zinc-300 mt-1">
                                <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                                <span>{structuredLocation}</span>
                              </div>
                            )}
                          </div>

                          <div className="space-y-0.5">
                            <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold block">Financial Reserve Target</span>
                            <div className="text-sm font-extrabold text-emerald-400 font-mono">
                              {app.reserveExpectation ? `${app.reserveExpectation}` : 'No Reserve / Unspecified'}
                            </div>
                            {app.submittedAt && (
                              <span className="text-[10px] text-zinc-500 block font-mono">
                                Submitted {formatDateTime(app.submittedAt)}
                              </span>
                            )}
                          </div>
                        </div>

                        {app.notes && (
                          <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 text-xs text-zinc-300 italic">
                            "{app.notes}"
                          </div>
                        )}
                      </div>

                      {/* Direct Conversion Action Buttons */}
                      <div className="flex items-center gap-2.5 md:flex-col md:items-end shrink-0 pt-3 md:pt-0 border-t md:border-t-0 border-zinc-800">
                        {!isConverted ? (
                          <button
                            type="button"
                            disabled={convertingId === app.id}
                            onClick={() => handleConvertConsignment(app)}
                            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-2 shadow-lg transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                          >
                            <Zap className="w-4 h-4 fill-current" />
                            <span>{convertingId === app.id ? 'Converting...' : '⚡ Convert to Draft Listing'}</span>
                          </button>
                        ) : (
                          <div className="space-y-2 text-right">
                            {convertedAuctionId ? (
                              <button
                                type="button"
                                onClick={() => onOpenListingEditor(convertedAuctionId)}
                                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-zinc-100 hover:bg-white text-zinc-950 flex items-center gap-1.5 shadow-md transition-all active:scale-95 cursor-pointer"
                              >
                                <span>Open in Listing Editor</span>
                                <span>→</span>
                              </button>
                            ) : (
                              <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                                <CheckCircle className="w-3.5 h-3.5" />
                                <span>Approved</span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination Controls */}
            {consignmentsTotal > 0 && (
              <div className="p-4 bg-[#151a1e] rounded-2xl border border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-400">
                <div className="flex items-center gap-2">
                  <span>Showing</span>
                  <span className="font-bold text-white font-mono">
                    {Math.min((consignmentPage - 1) * consignmentPageSize + 1, consignmentsTotal)}–
                    {Math.min(consignmentPage * consignmentPageSize, consignmentsTotal)}
                  </span>
                  <span>of</span>
                  <span className="font-bold text-white font-mono">{consignmentsTotal}</span>
                  <span>applications</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setConsignmentPage(prev => Math.max(1, prev - 1))}
                    disabled={consignmentPage <= 1}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed border border-zinc-700 flex items-center gap-1 font-semibold"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Previous</span>
                  </button>

                  <span className="px-3 py-1.5 rounded-lg bg-zinc-900 font-mono font-bold text-zinc-200 border border-zinc-800">
                    {consignmentPage} / {consignmentsTotalPages}
                  </span>

                  <button
                    onClick={() => setConsignmentPage(prev => Math.min(consignmentsTotalPages, prev + 1))}
                    disabled={consignmentPage >= consignmentsTotalPages}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed border border-zinc-700 flex items-center gap-1 font-semibold"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 3: WINNER & SETTLEMENT LEDGER */}
        {/* =================================================================== */}
        {activeTab === 'ledger' && (
          <div className="space-y-6">
            <div className="bg-[#151a1e] rounded-2xl border border-zinc-800 p-6 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-amber-500" />
                    <span>Winner & Settlement Ledger (CAD Resolution)</span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Auction transaction resolution table, high bidder contact details, and private closing checklists
                  </p>
                </div>

                {/* Lot Selection Dropdown */}
                {allAuctions.length > 1 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400 font-semibold">Select Lot:</span>
                    <select
                      value={selectedLedgerLotId}
                      onChange={(e) => setSelectedLedgerLotId(e.target.value)}
                      className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 font-bold focus:ring-2 focus:ring-red-600"
                    >
                      {allAuctions.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.title || a.id}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Transaction Resolution Highlight Card */}
              <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Target Auction Lot
                  </span>
                  <div className="text-base font-bold text-white">{activeLedgerAuction.title || 'Featured Lot'}</div>
                  <div className="text-xs text-zinc-400 font-mono">Lot ID: {activeLedgerAuction.id}</div>
                  {activeLedgerAuction.vin && (
                    <div className="text-xs text-zinc-400 font-mono">VIN: {activeLedgerAuction.vin}</div>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Highest / Winning Bid (CAD)
                  </span>
                  <div className="text-2xl font-black text-emerald-400 font-mono">
                    {formatCurrency(activeLedgerAuction.currentBid || activeLedgerAuction.startingBid || 0)} CAD
                  </div>
                  <div className="text-xs font-semibold">
                    {activeLedgerAuction.currentBid >= (activeLedgerAuction.reserveAmount || 0) ? (
                      <span className="text-emerald-400">✓ Reserve Met ({formatCurrency(activeLedgerAuction.reserveAmount || 0)} CAD)</span>
                    ) : (
                      <span className="text-amber-400">Reserve Not Met (Target: {formatCurrency(activeLedgerAuction.reserveAmount || 0)} CAD)</span>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    High Bidder / Purchaser Details
                  </span>
                  <div className="text-sm font-bold text-zinc-100">
                    {activeLedgerAuction.highBidderName || 'No Bids Recorded'}
                  </div>
                  {activeLedgerAuction.highBidderEmail && (
                    <div className="text-xs font-mono text-zinc-300 flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{activeLedgerAuction.highBidderEmail}</span>
                    </div>
                  )}
                  {activeLedgerAuction.sellerName && (
                    <div className="text-xs text-zinc-400 mt-1">
                      Consignor: <strong className="text-zinc-300">{activeLedgerAuction.sellerName}</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Full-Width All Auctions Ledger Table */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Full Auction Resolution Summary Table
                </h4>
                <div className="rounded-xl border border-zinc-800 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-900 text-zinc-400 uppercase text-[10px] font-extrabold tracking-wider border-b border-zinc-800">
                        <tr>
                          <th className="p-3">Vehicle Lot</th>
                          <th className="p-3">High Bidder</th>
                          <th className="p-3">Current / Final Bid</th>
                          <th className="p-3">Reserve Status</th>
                          <th className="p-3">Auction Status</th>
                          <th className="p-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/80 text-zinc-300">
                        {allAuctions.map((lot) => {
                          const hasReserve = (lot.reserveAmount || 0) > 0;
                          const isMet = (lot.currentBid || 0) >= (lot.reserveAmount || 0);

                          return (
                            <tr key={lot.id} className="hover:bg-zinc-900/50 transition-colors">
                              <td className="p-3">
                                <div className="font-bold text-white">{lot.title}</div>
                                <div className="font-mono text-[10px] text-zinc-500">{lot.vin || lot.id}</div>
                              </td>
                              <td className="p-3">
                                <div className="font-semibold text-zinc-200">{lot.highBidderName || 'None'}</div>
                                <div className="font-mono text-[10px] text-zinc-400">{lot.highBidderEmail || '—'}</div>
                              </td>
                              <td className="p-3 font-mono font-bold text-emerald-400">
                                {formatCurrency(lot.currentBid || lot.startingBid || 0)} CAD
                              </td>
                              <td className="p-3">
                                {!hasReserve ? (
                                  <span className="text-purple-400 font-semibold">No Reserve</span>
                                ) : isMet ? (
                                  <span className="text-emerald-400 font-semibold">Reserve Met</span>
                                ) : (
                                  <span className="text-amber-400 font-semibold">Reserve Not Met</span>
                                )}
                              </td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                  lot.status === 'active' || lot.status === 'sold'
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                    : 'bg-zinc-800 text-zinc-400'
                                }`}>
                                  {lot.status || 'draft'}
                                </span>
                              </td>
                              <td className="p-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => onOpenListingEditor(lot.id)}
                                  className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-bold border border-zinc-700 cursor-pointer"
                                >
                                  Open Editor →
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Offline Settlement Protocol Checklist */}
              <div className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-3">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Private Direct Settlement Standard Operating Procedure:</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-zinc-300">
                  <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-1">
                    <span className="font-bold text-emerald-400">1. Verification & Contact</span>
                    <p className="text-[11px] text-zinc-400">
                      Initiate direct communication between consignor and verified high bidder via phone/email.
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-1">
                    <span className="font-bold text-emerald-400">2. Wire Transfer (CAD)</span>
                    <p className="text-[11px] text-zinc-400">
                      Provide secure Canadian wire or draft escrow details. No Wailtail buyer commission fees applied.
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-1">
                    <span className="font-bold text-emerald-400">3. Bill of Sale & Logistics</span>
                    <p className="text-[11px] text-zinc-400">
                      Execute registration transfer, lien release, and coordinate vehicle carrier shipping.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 4: SITE BRANDING & GLOBAL SETTINGS */}
        {/* =================================================================== */}
        {activeTab === 'branding' && (
          <div className="space-y-6">
            <div className="bg-[#151a1e] rounded-2xl border border-zinc-800 p-6 shadow-sm space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Palette className="w-5 h-5 text-purple-400" />
                    <span>Site Branding & Global Defaults</span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Platform emblem, wordmark identity, header tagline, and Canadian CAD financial standards
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSaveGlobalSettings}
                  disabled={savingBranding}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-1.5 shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingBranding ? 'Saving...' : 'Save Global Settings'}</span>
                </button>
              </div>

              {/* Header Emblem Previews */}
              <div className="space-y-3">
                <label className="block font-bold text-zinc-200 text-xs uppercase tracking-wider">
                  Live Header Navbar Contrast Previews (40px Height Constraint)
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Dark Mode Preview */}
                  <div className="p-4 rounded-xl bg-[#121619] border border-zinc-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {siteLogo && siteLogo.trim() !== '' ? (
                        <img
                          src={siteLogo}
                          alt="Site Emblem"
                          className="h-10 max-h-10 w-auto object-contain"
                        />
                      ) : (
                        <WailtailLogo className="h-10" />
                      )}
                      <div className="border-l border-zinc-700 pl-3">
                        <div className="text-base font-black tracking-tight text-white uppercase font-sans">
                          {siteName || 'wailtail'}
                        </div>
                        <div className="text-[10px] text-zinc-400 font-semibold tracking-widest uppercase">
                          {siteTagline || 'Single-Car Auctions'}
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase">Dark Theme</span>
                  </div>

                  {/* Light Mode Preview */}
                  <div className="p-4 rounded-xl bg-[#f7f8fa] border border-zinc-300 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {siteLogo && siteLogo.trim() !== '' ? (
                        <img
                          src={siteLogo}
                          alt="Site Emblem"
                          className="h-10 max-h-10 w-auto object-contain"
                        />
                      ) : (
                        <WailtailLogo className="h-10" />
                      )}
                      <div className="border-l border-zinc-300 pl-3">
                        <div className="text-base font-black tracking-tight text-zinc-900 uppercase font-sans">
                          {siteName || 'wailtail'}
                        </div>
                        <div className="text-[10px] text-zinc-600 font-semibold tracking-widest uppercase">
                          {siteTagline || 'Single-Car Auctions'}
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase">Light Theme</span>
                  </div>
                </div>
              </div>

              {/* Logo Source Controls */}
              <div className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-4">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-zinc-200 text-xs uppercase tracking-wider">
                    Header Logo Source & Upload
                  </label>
                  {siteLogo && siteLogo.trim() !== '' && (
                    <button
                      type="button"
                      onClick={() => {
                        setSiteLogo('');
                        showToast('Reset to default vector Wailtail emblem. Click Save to persist.');
                      }}
                      className="text-xs text-red-400 hover:text-red-300 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset to Vector Emblem</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                  <div className="sm:col-span-8">
                    <input
                      type="text"
                      value={siteLogo}
                      onChange={(e) => setSiteLogo(e.target.value)}
                      placeholder="https://example.com/logo.png or uploaded image URL..."
                      className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div className="sm:col-span-4">
                    <input
                      type="file"
                      ref={logoInputRef}
                      onChange={handleLogoFileUpload}
                      accept="image/*"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      className="w-full py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs flex items-center justify-center gap-2 border border-zinc-700 cursor-pointer shadow-xs transition-all"
                    >
                      <Upload className="w-4 h-4 text-purple-400" />
                      <span>Upload Logo File</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Typography Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    Platform Brand Name
                  </label>
                  <input
                    type="text"
                    value={siteName}
                    onChange={(e) => setSiteName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    Site Subtitle Tagline
                  </label>
                  <input
                    type="text"
                    value={siteTagline}
                    onChange={(e) => setSiteTagline(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              {/* CAD Financial Standards Defaults */}
              <div className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
                  <DollarSign className="w-4 h-4" />
                  <span>Global Financial Defaults (CAD Standardization)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-xs text-zinc-400 font-semibold">
                      Default Starting Bid (CAD)
                    </label>
                    <input
                      type="number"
                      value={defaultStartingBid}
                      onChange={(e) => setDefaultStartingBid(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-700 font-mono font-bold text-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs text-zinc-400 font-semibold">
                      Default Minimum Increment (CAD)
                    </label>
                    <input
                      type="number"
                      value={defaultMinIncrement}
                      onChange={(e) => setDefaultMinIncrement(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-700 font-mono font-bold text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Purge Catalog Action */}
              <div className="pt-4 border-t border-zinc-800 flex items-center justify-between">
                <div>
                  <h5 className="text-xs font-bold text-red-400">Danger Zone: Database Reset</h5>
                  <p className="text-[11px] text-zinc-500">
                    Purge all auction documents and restore clean baseline state
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (confirm('Permanently purge all catalog listings, media configurations, and local cache? This cannot be undone.')) {
                      try {
                        await purgeAllListings();
                        showToast('All catalog listings and media data have been purged.');
                      } catch (err: any) {
                        showToast(`Purge failed: ${err.message}`, 'error');
                      }
                    }
                  }}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-zinc-900 hover:bg-red-950 text-zinc-400 hover:text-red-300 border border-zinc-800 hover:border-red-800 transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Purge All Catalog Listings</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL: NEW LISTING CREATION */}
      {showNewListingModal && (
        <div
          onClick={() => setShowNewListingModal(false)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#151a1e] rounded-2xl shadow-2xl border border-zinc-700 p-6 space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="p-3 rounded-xl bg-emerald-950 text-emerald-400 border border-emerald-800 flex-shrink-0">
                <Car className="w-6 h-6" />
              </div>
              <div className="space-y-1 flex-1">
                <h3 className="text-base font-bold text-white">Initialize New Vehicle Listing</h3>
                <p className="text-xs text-zinc-400">
                  Creates an auction lot document in Firestore and redirects to the full-width listing workspace.
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateNewListing} className="space-y-4 pt-1">
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1">
                  Vehicle Listing Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newListingTitle}
                  onChange={(e) => setNewListingTitle(e.target.value)}
                  placeholder="e.g. 1993 Porsche 911 RS America"
                  className="w-full p-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-sm text-white focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  autoFocus
                />
              </div>

              <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-400 space-y-1">
                <div className="flex justify-between">
                  <span>Starting Bid:</span>
                  <span className="font-bold text-white font-mono">$1,000 CAD</span>
                </div>
                <div className="flex justify-between">
                  <span>Minimum Increment:</span>
                  <span className="font-bold text-white font-mono">$250 CAD</span>
                </div>
                <div className="flex justify-between">
                  <span>Initial Status:</span>
                  <span className="font-bold text-amber-400">Upcoming / Draft</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowNewListingModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingListing || !newListingTitle.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {creatingListing ? 'Creating...' : 'Create Lot & Open Workspace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE USER CONFIRMATION */}
      {confirmDeleteUser && (
        <div
          onClick={() => setConfirmDeleteUser(null)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#151a1e] rounded-2xl shadow-2xl border border-red-800 p-6 space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="p-3 rounded-xl bg-red-950 text-red-400 border border-red-800 flex-shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="space-y-1 flex-1">
                <h3 className="text-base font-bold text-white">Permanently Delete User Account?</h3>
                <p className="text-xs text-zinc-300">
                  Are you sure you want to permanently delete account for{' '}
                  <strong className="text-white">{confirmDeleteUser.email || 'User'}</strong>?
                </p>
                <p className="text-[11px] text-zinc-400">
                  This removes user records and permissions across both users and bidders collections. This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setConfirmDeleteUser(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteUserSubmit}
                disabled={deletingUser}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {deletingUser ? 'Deleting...' : 'Yes, Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
