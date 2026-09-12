import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  Auction, 
  Bid, 
  UserProfile, 
  UserRole, 
  MediaConfiguration, 
  ConsignmentApplication,
  PlatformPromoSettings,
  PromoCardConfig,
  LotHeaderBannerConfig,
  PromoCtaAction,
  PromoAudience,
  PromoAccentColor
} from '../types';
import { 
  fetchPaginatedBidders, 
  fetchPaginatedConsignments,
  updateUserRole,
  setUserBannedStatus,
  setUserEmailVerified,
  deleteUserRecord,
  convertConsignmentToDraftListing,
  updateConsignmentStatus,
  deleteConsignmentApplication,
  batchDeleteConsignments,
  batchUpdateConsignmentStatus,
  batchDeleteAuctions,
  batchUpdateAuctionStatus,
  deleteListing,
  getConsignmentApplication,
  createNewListing,
  purgeAllListings,
  updateAuctionConfig,
  saveGlobalBranding,
  getStoredGlobalBranding,
  compressImageDataUrl,
  uploadImageToStorage,
  retractBid,
  MAIN_AUCTION_ID,
  subscribeToPromoSettings,
  subscribeToPromoAnalytics,
  savePromoSettings,
  DEFAULT_PROMO_SETTINGS
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
  ArrowRight,
  ExternalLink, 
  ShieldCheck, 
  CheckCircle, 
  AlertTriangle, 
  Ban, 
  UserCheck, 
  Trash2, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
  ChevronUp,
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
  X,
  Megaphone,
  MousePointerClick,
  Calendar,
  Image as ImageIcon
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

  // Active Management Tab: 'bidders' | 'consignments' | 'inventory' | 'ledger' | 'branding'
  const [activeTab, setActiveTab] = useState<'bidders' | 'consignments' | 'inventory' | 'ledger' | 'branding'>('bidders');

  // Multi-Select Engine Selection States
  const [selectedConsignmentIds, setSelectedConsignmentIds] = useState<string[]>([]);
  const [selectedAuctionIds, setSelectedAuctionIds] = useState<string[]>([]);

  // Notification Toast
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4500);
  };

  // -------------------------------------------------------------
  // BID MODERATION & RETRACTION STATE (OPTION B SOFT RETRACTION)
  // -------------------------------------------------------------
  const [allLiveBids, setAllLiveBids] = useState<Bid[]>(bids || []);
  const [expandedBidderId, setExpandedBidderId] = useState<string | null>(null);
  const [retractingBid, setRetractingBid] = useState<Bid | null>(null);
  const [retractionReason, setRetractionReason] = useState<string>('');
  const [retractionSubmitting, setRetractionSubmitting] = useState<boolean>(false);
  const [retractionError, setRetractionError] = useState<string | null>(null);

  // Sync real-time bids collection across all auctions
  useEffect(() => {
    try {
      const q = query(collection(db, 'bids'), orderBy('timestamp', 'desc'));
      const unsub = onSnapshot(q, (snap) => {
        const fetchedBids: Bid[] = snap.docs.map(d => ({
          id: d.id,
          ...d.data()
        } as Bid));
        setAllLiveBids(fetchedBids);
      }, (err) => {
        console.warn('AdminPortalPage: Live bids listener fallback to props.bids:', err);
        setAllLiveBids(bids || []);
      });
      return () => unsub();
    } catch {
      setAllLiveBids(bids || []);
    }
  }, [bids]);

  const getMemberBids = useCallback((userItem: UserProfile): Bid[] => {
    return allLiveBids
      .filter(b => {
        const matchUid = Boolean(b.bidderId && userItem.uid && b.bidderId === userItem.uid);
        const matchEmail = Boolean(
          b.bidderEmail && userItem.email &&
          b.bidderEmail.trim().toLowerCase() === userItem.email.trim().toLowerCase()
        );
        return matchUid || matchEmail;
      })
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [allLiveBids]);

  const toggleBidderLedger = (uid: string) => {
    setExpandedBidderId(prev => (prev === uid ? null : uid));
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

  const handleOpenRetractModal = (bid: Bid) => {
    setRetractingBid(bid);
    setRetractionReason('');
    setRetractionError(null);
  };

  const handleConfirmRetraction = async () => {
    if (!retractionReason.trim()) {
      setRetractionError('A valid reason for retraction is required.');
      return;
    }
    if (!retractingBid) return;

    setRetractionSubmitting(true);
    setRetractionError(null);

    const isOrphaned = !allAuctions.some(a => a.id === retractingBid.auctionId) && retractingBid.auctionId !== auction.id;

    try {
      const adminId = authUser?.uid || authUserProfile?.uid || 'admin';
      const activeAdminName = authUserProfile?.displayName?.trim() || authUser?.displayName?.trim();
      const activeAdminEmail = authUserProfile?.email?.trim() || authUser?.email?.trim();
      const adminDisplayName = (activeAdminName && activeAdminEmail && activeAdminName.toLowerCase() !== activeAdminEmail.toLowerCase())
        ? `${activeAdminName} (${activeAdminEmail})`
        : (activeAdminName || activeAdminEmail || 'Administrator');

      const targetAuctionId = retractingBid.auctionId || auction.id;
      await retractBid(targetAuctionId, retractingBid.id, retractionReason.trim(), adminId, adminDisplayName);

      // Optimistic update
      setAllLiveBids(prev => prev.map(b => {
        if (b.id === retractingBid.id) {
          return {
            ...b,
            status: 'retracted',
            retractedAt: Date.now(),
            retractionReason: retractionReason.trim(),
            retractedBy: adminId,
            retractedByName: adminDisplayName
          };
        }
        return b;
      }));

      if (isOrphaned) {
        showToast(`Orphaned bid of ${formatCurrency(retractingBid.amount)} CAD successfully retracted (parent lot was deleted).`, 'success');
      } else {
        showToast(`Bid of ${formatCurrency(retractingBid.amount)} CAD successfully retracted.`, 'success');
      }
      setRetractingBid(null);
      setRetractionReason('');
    } catch (err: any) {
      console.error('Error retracting bid:', err);
      setRetractionError(err.message || 'Failed to retract bid. Please try again.');
    } finally {
      setRetractionSubmitting(false);
    }
  };

  /**
   * UID Resolver Helper:
   * Resolves raw Firebase UIDs or admin identifiers into human-readable administrator
   * display names and email addresses using member registry state, active user profile,
   * or graceful truncation fallbacks.
   */
  const getAdminIdentifier = useCallback((uidOrName?: string | null): string => {
    if (!uidOrName || !uidOrName.trim()) {
      return 'Administrator';
    }
    const val = uidOrName.trim();

    // 1. Check if it matches the active logged-in admin user or profile
    if (
      (authUser?.uid && authUser.uid === val) ||
      (authUserProfile?.uid && authUserProfile.uid === val) ||
      (authUser?.email && authUser.email.toLowerCase() === val.toLowerCase()) ||
      (authUserProfile?.email && authUserProfile.email.toLowerCase() === val.toLowerCase())
    ) {
      const name = authUserProfile?.displayName?.trim() || authUser?.displayName?.trim();
      const email = authUserProfile?.email?.trim() || authUser?.email?.trim();
      if (name && email && name.toLowerCase() !== email.toLowerCase()) {
        return `${name} (${email})`;
      }
      return name || email || 'Administrator';
    }

    // 2. Check if a matching user profile exists in member registry state
    const matchedProfile = biddersList.find(
      u => (u.uid && u.uid === val) ||
           (u.email && u.email.toLowerCase() === val.toLowerCase()) ||
           (u.displayName && u.displayName.toLowerCase() === val.toLowerCase())
    );
    if (matchedProfile) {
      const name = matchedProfile.displayName?.trim();
      const email = matchedProfile.email?.trim();
      if (name && email && name.toLowerCase() !== email.toLowerCase()) {
        return `${name} (${email})`;
      }
      return name || email || 'Administrator';
    }

    // 3. Backward compatibility check against active bids stream
    const matchedBid = allLiveBids.find(
      b => (b.bidderId && b.bidderId === val) ||
           (b.bidderEmail && b.bidderEmail.toLowerCase() === val.toLowerCase()) ||
           (b.bidderName && b.bidderName.toLowerCase() === val.toLowerCase())
    );
    if (matchedBid) {
      const name = matchedBid.bidderName?.trim();
      const email = matchedBid.bidderEmail?.trim();
      if (name && email && name.toLowerCase() !== email.toLowerCase()) {
        return `${name} (${email})`;
      }
      if (name || email) return (name || email)!;
    }

    // 4. Check if the string matches a raw Firebase UID pattern (20-36 alphanumeric characters without spaces or @)
    const isRawUid = /^[a-zA-Z0-9_-]{20,36}$/.test(val) && !val.includes('@') && !val.includes(' ');
    if (isRawUid) {
      return `Admin (${val.slice(0, 6)}...${val.slice(-4)})`;
    }

    // 5. Default formatting: if already human-readable, preserve it
    if (val.toLowerCase() === 'admin') {
      return 'Administrator';
    }

    return val;
  }, [authUser, authUserProfile, biddersList, allLiveBids]);

  const renderBidItem = (bid: Bid, showLotInfo = true) => {
    const isRetracted = bid.status === 'retracted';
    const targetLot = allAuctions.find(a => a.id === bid.auctionId) || (bid.auctionId === auction.id ? auction : null);
    const isOrphaned = !targetLot;
    const lotTitle = targetLot?.title || (bid.auctionId ? `Lot: ${bid.auctionId} (Deleted)` : 'Vehicle Lot (Deleted)');

    // Resolve human-readable retraction moderator identity
    const isRetractedByNameRawUid = bid.retractedByName
      ? (/^[a-zA-Z0-9_-]{20,36}$/.test(bid.retractedByName.trim()) && !bid.retractedByName.includes('@') && !bid.retractedByName.includes(' '))
      : false;
    const retractionModerator = (bid.retractedByName && !isRetractedByNameRawUid)
      ? bid.retractedByName
      : getAdminIdentifier(bid.retractedByName || bid.retractedBy);

    return (
      <div
        key={bid.id}
        className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          isRetracted
            ? 'bg-amber-950/15 border-amber-900/40 text-zinc-400'
            : 'bg-zinc-900/90 border-zinc-800 hover:border-zinc-700 text-zinc-200'
        }`}
      >
        <div className="min-w-0 space-y-1 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {/* Bid Amount (strikethrough when retracted) */}
            <span
              className={`font-mono text-sm font-bold ${
                isRetracted
                  ? 'line-through text-zinc-500 decoration-amber-500/80 decoration-2'
                  : 'text-emerald-400 font-extrabold'
              }`}
            >
              {formatCurrency(bid.amount)} CAD
            </span>

            {/* Status / Retraction Badge with Hoverable Tooltip */}
            {isRetracted ? (
              <div className="relative group/tooltip inline-flex items-center">
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-950/90 text-amber-300 border border-amber-800 shadow-sm inline-flex items-center gap-1 cursor-help"
                  title={`Retracted: ${bid.retractionReason || 'No reason provided'}${retractionModerator ? ` by ${retractionModerator}` : ''}${bid.retractedAt ? ` on ${formatDateTime(bid.retractedAt)}` : ''}`}
                >
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                  <span>RETRACTED</span>
                </span>

                {/* Hoverable reason tooltip */}
                <div className="absolute left-0 bottom-full mb-2 hidden group-hover/tooltip:block z-50 w-72 p-3 rounded-xl bg-zinc-950 text-zinc-200 text-xs border border-amber-600/70 shadow-2xl pointer-events-none">
                  <div className="font-bold text-amber-300 text-[11px] mb-1 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    <span>Retraction Audit Reason:</span>
                  </div>
                  <p className="text-zinc-200 italic text-[11px] leading-relaxed bg-zinc-900/90 p-2 rounded-lg border border-zinc-800 break-words">
                    "{bid.retractionReason || 'Administrative retraction'}"
                  </p>
                  <div className="mt-2 pt-1.5 border-t border-zinc-800/80 flex flex-col gap-0.5 text-[10px] text-zinc-400 font-mono">
                    {bid.retractedAt && <span>Date: {formatDateTime(bid.retractedAt)}</span>}
                    {retractionModerator && <span>Retracted By: {retractionModerator}</span>}
                  </div>
                </div>
              </div>
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-950/70 text-emerald-300 border border-emerald-800">
                Active
              </span>
            )}

            {/* Orphaned Bid Badge when parent lot no longer exists */}
            {isOrphaned && (
              <span
                className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-950/90 text-amber-300 border border-amber-800 shadow-sm inline-flex items-center gap-1 cursor-help"
                title="Referenced auction lot was deleted from the system"
              >
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                <span>ORPHANED BID (LOT DELETED)</span>
              </span>
            )}

            {bid.antiSniped && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-red-950/80 text-red-300 border border-red-800">
                +2m Anti-Snipe
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
            {showLotInfo && (
              <span className="text-zinc-300 font-medium truncate max-w-xs" title={lotTitle}>
                {lotTitle}
              </span>
            )}
            <span>Placed: <strong className="text-zinc-400 font-mono text-[11px]">{formatDateTime(bid.timestamp)}</strong></span>
            {bid.bidderName && !showLotInfo && (
              <span>Bidder: <strong className="text-zinc-300">{bid.bidderName}</strong> ({bid.bidderEmail})</span>
            )}
          </div>
        </div>

        {/* High-visibility Retract Bid action trigger */}
        <div className="shrink-0 flex items-center gap-2">
          {!isRetracted ? (
            <button
              type="button"
              onClick={() => handleOpenRetractModal(bid)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500/10 hover:bg-amber-500/25 text-amber-400 hover:text-amber-300 border border-amber-500/40 hover:border-amber-500 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
              title="Administratively retract this bid (Option B soft retraction)"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>Retract Bid</span>
            </button>
          ) : (
            <span className="text-[11px] text-zinc-500 font-mono italic">
              Archived
            </span>
          )}
        </div>
      </div>
    );
  };

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
      await deleteUserRecord(targetId, currentAdminId);
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
  const [consignmentStatusFilter, setConsignmentStatusFilter] = useState<string>('pending');
  const [consignmentsList, setConsignmentsList] = useState<ConsignmentApplication[]>([]);
  const [consignmentsTotal, setConsignmentsTotal] = useState<number>(0);
  const [consignmentsTotalPages, setConsignmentsTotalPages] = useState<number>(1);
  const [loadingConsignments, setLoadingConsignments] = useState<boolean>(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  // Consignment Pipeline Confirmation Modals & Action States
  const [confirmApproveApp, setConfirmApproveApp] = useState<ConsignmentApplication | null>(null);
  const [confirmRejectApp, setConfirmRejectApp] = useState<ConsignmentApplication | null>(null);
  const [confirmReopenApp, setConfirmReopenApp] = useState<ConsignmentApplication | null>(null);
  const [confirmDeleteConsignment, setConfirmDeleteConsignment] = useState<ConsignmentApplication | null>(null);
  const [processingConsignmentAction, setProcessingConsignmentAction] = useState<boolean>(false);
  const [highlightedConsignmentId, setHighlightedConsignmentId] = useState<string | null>(null);
  const deepLinkProcessedRef = useRef<boolean>(false);

  // Helper to clear URL parameters after processing or dismissing action modals
  const clearUrlParams = useCallback(() => {
    if (typeof window !== 'undefined' && window.history && window.location) {
      const url = new URL(window.location.href);
      if (url.search) {
        url.search = '';
        window.history.replaceState({}, '', url.pathname + (url.hash || ''));
      }
    }
  }, []);

  // URL Parameter Handler for 1-click email triage deep links
  useEffect(() => {
    if (deepLinkProcessedRef.current) return;
    const searchParams = new URLSearchParams(window.location.search);
    const tabParam = searchParams.get('tab');
    const idParam = searchParams.get('id');
    const actionParam = searchParams.get('action');

    if (tabParam === 'consignments') {
      setActiveTab('consignments');

      if (idParam) {
        deepLinkProcessedRef.current = true;
        const targetId = idParam.trim();
        (async () => {
          try {
            const targetApp = await getConsignmentApplication(targetId);
            if (!targetApp || !targetApp.id) {
              showToast('Consignment application not found or already processed', 'error');
              clearUrlParams();
              return;
            }

            // Auto-filter and focus the target application record
            setConsignmentStatusFilter('ALL');
            setConsignmentSearch(targetId);
            setHighlightedConsignmentId(targetId);

            // Ensure the target application is included in current list
            setConsignmentsList((prev) => {
              if (prev.some((c) => c.id === targetApp.id)) return prev;
              return [targetApp, ...prev];
            });

            // Trigger corresponding confirmation modal
            if (actionParam === 'approve') {
              setConfirmApproveApp(targetApp);
            } else if (actionParam === 'reject') {
              setConfirmRejectApp(targetApp);
            }
          } catch (err) {
            showToast('Consignment application not found or already processed', 'error');
            clearUrlParams();
          }
        })();
      }
    }
  }, [clearUrlParams]);

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
      clearUrlParams();
    }
  };

  // Reject consignment application
  const handleRejectConsignment = async (app: ConsignmentApplication) => {
    if (!app.id) return;
    setProcessingConsignmentAction(true);
    try {
      await updateConsignmentStatus(app.id, 'rejected');
      setConsignmentsList(prev => prev.map(c => c.id === app.id ? { ...c, status: 'rejected' } : c));
      showToast(`Consignment application for ${app.year} ${app.make} ${app.model} has been rejected.`);
      if (consignmentStatusFilter.toLowerCase() === 'pending') {
        setConsignmentsList(prev => prev.filter(c => c.id !== app.id));
        setConsignmentsTotal(prev => Math.max(0, prev - 1));
      }
    } catch (err: any) {
      showToast(`Failed to reject consignment: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      setProcessingConsignmentAction(false);
      clearUrlParams();
    }
  };

  // Re-open consignment application
  const handleReopenConsignment = async (app: ConsignmentApplication) => {
    if (!app.id) return;
    setProcessingConsignmentAction(true);
    try {
      await updateConsignmentStatus(app.id, 'pending');
      setConsignmentsList(prev => prev.map(c => c.id === app.id ? { ...c, status: 'pending' } : c));
      showToast(`Consignment application for ${app.year} ${app.make} ${app.model} re-opened as pending.`);
      if (consignmentStatusFilter.toLowerCase() === 'rejected' || consignmentStatusFilter.toLowerCase() === 'declined') {
        setConsignmentsList(prev => prev.filter(c => c.id !== app.id));
        setConsignmentsTotal(prev => Math.max(0, prev - 1));
      }
    } catch (err: any) {
      showToast(`Failed to re-open consignment: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      setProcessingConsignmentAction(false);
      clearUrlParams();
    }
  };

  // Delete consignment record permanently
  const handleDeleteConsignment = async (app: ConsignmentApplication, cascade = false) => {
    if (!app.id) return;
    setProcessingConsignmentAction(true);
    try {
      await deleteConsignmentApplication(app.id, cascade);
      setConsignmentsList(prev => prev.filter(c => c.id !== app.id));
      setConsignmentsTotal(prev => Math.max(0, prev - 1));
      showToast(`Permanently deleted consignment record for ${app.year} ${app.make} ${app.model}${cascade ? ' and associated vehicle listing' : ''}.`);
    } catch (err: any) {
      showToast(`Failed to delete consignment: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      setProcessingConsignmentAction(false);
      clearUrlParams();
    }
  };

  // -------------------------------------------------------------
  // TAB 5: VEHICLE INVENTORY & LOTS STATE (PAGINATED & FILTERED)
  // -------------------------------------------------------------
  const [inventoryPage, setInventoryPage] = useState<number>(1);
  const [inventoryPageSize, setInventoryPageSize] = useState<number>(8);
  const [inventorySearch, setInventorySearch] = useState<string>('');
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState<'all' | 'draft' | 'preview' | 'upcoming' | 'live' | 'ended'>('all');

  // Inventory & Bulk Deletion Modals & Cascading State
  const [confirmDeleteLot, setConfirmDeleteLot] = useState<Auction | null>(null);
  const [cascadeDeleteConsignmentOnLot, setCascadeDeleteConsignmentOnLot] = useState<boolean>(true);
  const [cascadeDeleteAuctionOnConsignment, setCascadeDeleteAuctionOnConsignment] = useState<boolean>(true);
  const [confirmBulkDeleteConsignments, setConfirmBulkDeleteConsignments] = useState<boolean>(false);
  const [bulkCascadeDeleteAuction, setBulkCascadeDeleteAuction] = useState<boolean>(true);
  const [confirmBulkDeleteAuctions, setConfirmBulkDeleteAuctions] = useState<boolean>(false);
  const [bulkCascadeDeleteConsignment, setBulkCascadeDeleteConsignment] = useState<boolean>(true);

  // Reset selection arrays upon changing tabs, changing pagination pages, or executing search queries
  useEffect(() => {
    setSelectedConsignmentIds([]);
    setSelectedAuctionIds([]);
  }, [activeTab]);

  useEffect(() => {
    setSelectedConsignmentIds([]);
  }, [consignmentPage, consignmentSearch, consignmentStatusFilter]);

  useEffect(() => {
    setSelectedAuctionIds([]);
  }, [inventoryPage, inventorySearch, inventoryStatusFilter]);

  // Master Select All for Consignments
  const areAllCurrentConsignmentsSelected = useMemo(() => {
    if (consignmentsList.length === 0) return false;
    return consignmentsList.every(c => c.id && selectedConsignmentIds.includes(c.id));
  }, [consignmentsList, selectedConsignmentIds]);

  const handleToggleSelectAllConsignments = () => {
    const validPageIds = consignmentsList.map(c => c.id).filter(Boolean) as string[];
    if (validPageIds.length === 0) return;
    if (areAllCurrentConsignmentsSelected) {
      setSelectedConsignmentIds(prev => prev.filter(id => !validPageIds.includes(id)));
    } else {
      setSelectedConsignmentIds(prev => Array.from(new Set([...prev, ...validPageIds])));
    }
  };

  const handleToggleConsignmentSelection = (id: string) => {
    setSelectedConsignmentIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Inventory Filtering & Pagination
  const filteredInventory = useMemo(() => {
    return allAuctions.filter(lot => {
      if (inventoryStatusFilter !== 'all') {
        const s = (lot.status || 'draft').toLowerCase();
        if (inventoryStatusFilter === 'live') {
          if (s !== 'live' && s !== 'active') return false;
        } else if (inventoryStatusFilter === 'upcoming') {
          if (s !== 'upcoming') return false;
        } else if (inventoryStatusFilter === 'preview') {
          if (s !== 'preview') return false;
        } else if (inventoryStatusFilter === 'draft') {
          if (s !== 'draft') return false;
        } else if (inventoryStatusFilter === 'ended') {
          if (s !== 'ended' && s !== 'sold' && s !== 'reserve_not_met') return false;
        }
      }
      if (inventorySearch.trim()) {
        const q = inventorySearch.toLowerCase();
        const match =
          (lot.title || '').toLowerCase().includes(q) ||
          (lot.subtitle || '').toLowerCase().includes(q) ||
          (lot.vin || '').toLowerCase().includes(q) ||
          (lot.make || '').toLowerCase().includes(q) ||
          (lot.model || '').toLowerCase().includes(q) ||
          String(lot.year || '').toLowerCase().includes(q) ||
          (lot.id || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [allAuctions, inventoryStatusFilter, inventorySearch]);

  const inventoryTotal = filteredInventory.length;
  const inventoryTotalPages = Math.max(1, Math.ceil(inventoryTotal / inventoryPageSize));
  const paginatedInventory = useMemo(() => {
    const start = (inventoryPage - 1) * inventoryPageSize;
    return filteredInventory.slice(start, start + inventoryPageSize);
  }, [filteredInventory, inventoryPage, inventoryPageSize]);

  // Master Select All for Auctions
  const areAllCurrentAuctionsSelected = useMemo(() => {
    if (paginatedInventory.length === 0) return false;
    return paginatedInventory.every(lot => selectedAuctionIds.includes(lot.id));
  }, [paginatedInventory, selectedAuctionIds]);

  const handleToggleSelectAllAuctions = () => {
    const validPageIds = paginatedInventory.map(lot => lot.id);
    if (validPageIds.length === 0) return;
    if (areAllCurrentAuctionsSelected) {
      setSelectedAuctionIds(prev => prev.filter(id => !validPageIds.includes(id)));
    } else {
      setSelectedAuctionIds(prev => Array.from(new Set([...prev, ...validPageIds])));
    }
  };

  const handleToggleAuctionSelection = (id: string) => {
    setSelectedAuctionIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
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
  const storedBranding = getStoredGlobalBranding();
  const [siteLogo, setSiteLogo] = useState(mediaConfig.siteLogo || auction.siteLogo || storedBranding.siteLogo || '');
  const [siteName, setSiteName] = useState(mediaConfig.siteName || auction.siteName || storedBranding.siteName || 'wailtail');
  const [siteTagline, setSiteTagline] = useState(mediaConfig.siteTagline || auction.siteTagline || storedBranding.siteTagline || 'Single-Car Auctions');
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
      await saveGlobalBranding({
        siteLogo,
        siteName,
        siteTagline,
        defaultStartingBid: Number(defaultStartingBid),
        defaultMinIncrement: Number(defaultMinIncrement),
        currency: 'CAD'
      });

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
  // TAB 4 SUB-SECTION: PROMOTIONAL & LAUNCH CAMPAIGN STATE
  // -------------------------------------------------------------
  const [promoSettings, setPromoSettings] = useState<PlatformPromoSettings>(DEFAULT_PROMO_SETTINGS);
  const [savingPromos, setSavingPromos] = useState<boolean>(false);
  const [expandedCardIds, setExpandedCardIds] = useState<Record<string, boolean>>({});
  const [promoAnalytics, setPromoAnalytics] = useState<Record<string, number>>({});

  useEffect(() => {
    const unsub = subscribeToPromoSettings((settings) => {
      setPromoSettings(settings);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (activeTab !== 'branding') return;
    const unsub = subscribeToPromoAnalytics((analyticsMap) => {
      setPromoAnalytics(analyticsMap);
    });
    return () => unsub();
  }, [activeTab]);

  const handleSavePromoSettings = async () => {
    setSavingPromos(true);
    try {
      const mergedSettings: PlatformPromoSettings = {
        ...promoSettings,
        lotHeaderBanner: {
          ...promoSettings.lotHeaderBanner,
          clickCount: promoAnalytics['lot_header_banner'] ?? promoSettings.lotHeaderBanner?.clickCount ?? 0
        },
        cards: (promoSettings.cards || []).map((card: PromoCardConfig) => ({
          ...card,
          clickCount: promoAnalytics[card.id] ?? card.clickCount ?? 0
        }))
      };
      await savePromoSettings(mergedSettings);
      showToast('Promotional campaign settings updated and live across the platform!');
    } catch (err: any) {
      showToast(`Failed to save promotional settings: ${err.message || 'Error'}`, 'error');
    } finally {
      setSavingPromos(false);
    }
  };

  const handleAddPromoCard = () => {
    const newCard: PromoCardConfig = {
      id: `promo-${Date.now()}`,
      enabled: true,
      badgeText: 'LAUNCH SPECIAL',
      headline: 'Special Campaign Title',
      copy: 'Describe your launch offer, promotion, or member perk here.',
      ctaText: 'Learn More',
      ctaAction: 'consignment_modal',
      accentColor: 'blue',
      targetAudience: 'all',
      clickCount: 0
    };
    setPromoSettings((prev) => ({
      ...prev,
      cards: [newCard, ...(prev.cards || [])]
    }));
    setExpandedCardIds((prev) => ({ ...prev, [newCard.id]: true }));
  };

  const handleRemovePromoCard = (id: string) => {
    setPromoSettings((prev) => ({
      ...prev,
      cards: (prev.cards || []).filter((c) => c.id !== id)
    }));
  };

  const handleUpdateCard = (id: string, updates: Partial<PromoCardConfig>) => {
    setPromoSettings((prev) => ({
      ...prev,
      cards: (prev.cards || []).map((c) => (c.id === id ? { ...c, ...updates } : c))
    }));
  };

  const handleUpdateBanner = (updates: Partial<LotHeaderBannerConfig>) => {
    setPromoSettings((prev) => ({
      ...prev,
      lotHeaderBanner: {
        ...prev.lotHeaderBanner,
        ...updates
      }
    }));
  };

  const toggleCardExpanded = (id: string) => {
    setExpandedCardIds((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const toDateTimeLocalValue = (val?: string | number) => {
    if (!val) return '';
    const d = new Date(val);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const handlePromoImageUpload = async (cardId: string, file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image file (PNG, JPG, WebP, SVG).', 'error');
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const rawResult = reader.result as string;
          const compressed = await compressImageDataUrl(rawResult);
          const result = await uploadImageToStorage(auction.id || MAIN_AUCTION_ID, compressed, 'promotions');
          handleUpdateCard(cardId, { imageUrl: result });
          showToast('Promotional asset uploaded! Click "Save Promotional Campaign" to persist.');
        } catch (err: any) {
          showToast('Image upload failed: ' + (err.message || 'Unknown error'), 'error');
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      showToast('Image read failed: ' + (err.message || 'Unknown error'), 'error');
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
              <span>Member Directory</span>
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
              onClick={() => setActiveTab('inventory')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'inventory'
                  ? 'bg-red-700 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/70'
              }`}
            >
              <Car className="w-4 h-4" />
              <span>Vehicle Inventory &amp; Lots</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                activeTab === 'inventory' ? 'bg-red-950 text-red-200' : 'bg-zinc-800 text-zinc-400'
              }`}>
                {allAuctions.length}
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
                    <span>Member Directory Management</span>
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
                    const userBids = getMemberBids(userItem);
                    const isExpanded = expandedBidderId === userItem.uid;

                    return (
                      <div key={userItem.uid} className="transition-colors">
                        <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-zinc-900/40 transition-colors">
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

                          {/* Expandable Active Bids Ledger Toggle */}
                          <button
                            type="button"
                            onClick={() => toggleBidderLedger(userItem.uid)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                              isExpanded
                                ? 'bg-zinc-800 text-white border-zinc-600 shadow-sm'
                                : userBids.length > 0
                                ? 'bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border-amber-800/80'
                                : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border-zinc-700'
                            }`}
                            title="View and moderate bids placed by this member"
                          >
                            <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                            <span>Bids ({userBids.length})</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5 text-zinc-400" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
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

                      {/* Member Active Bids Ledger (Expandable) */}
                      {isExpanded && (
                        <div className="px-5 py-4 bg-black/40 border-t border-zinc-800/80 space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <DollarSign className="w-4 h-4 text-amber-400" />
                              <h5 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                                Member Bids Ledger: <span className="text-white normal-case">{userItem.displayName || userItem.email}</span>
                              </h5>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] font-mono">
                              <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800">
                                {userBids.filter(b => b.status !== 'retracted').length} Active
                              </span>
                              <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800">
                                {userBids.filter(b => b.status === 'retracted').length} Retracted
                              </span>
                            </div>
                          </div>

                          {userBids.length === 0 ? (
                            <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/60 text-center text-xs text-zinc-500">
                              No bids placed by this member across any auctions.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {userBids.map(bid => renderBidItem(bid, true))}
                            </div>
                          )}
                        </div>
                      )}
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

                {/* Master Select All and Status Filter Tabs */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 rounded-xl border border-zinc-800 text-xs text-zinc-300">
                    <input
                      type="checkbox"
                      id="select-all-consignments-checkbox"
                      checked={areAllCurrentConsignmentsSelected}
                      onChange={handleToggleSelectAllConsignments}
                      className="rounded border-zinc-700 text-red-600 focus:ring-red-600 cursor-pointer"
                    />
                    <label htmlFor="select-all-consignments-checkbox" className="cursor-pointer select-none text-[11px] font-semibold">
                      Select Page {selectedConsignmentIds.length > 0 && `(${selectedConsignmentIds.length})`}
                    </label>
                  </div>

                  {/* Status Filter Tabs (ALL, PENDING, APPROVED, REJECTED) */}
                  <div className="flex items-center gap-1.5 bg-zinc-900 p-1 rounded-xl border border-zinc-800 text-xs font-semibold overflow-x-auto">
                    {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => {
                          setConsignmentStatusFilter(st.toLowerCase());
                          setConsignmentPage(1);
                        }}
                        className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                          consignmentStatusFilter.toLowerCase() === st.toLowerCase()
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
                {(consignmentSearch || consignmentStatusFilter.toLowerCase() !== 'all') && (
                  <button
                    onClick={() => {
                      setConsignmentSearch('');
                      setConsignmentStatusFilter('pending');
                      setConsignmentPage(1);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 cursor-pointer"
                  >
                    Clear Filter Criteria
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {consignmentsList.map((app) => {
                  const structuredLocation = [app.locationCity, app.locationProvince, app.locationCountry].filter(Boolean).join(', ') || app.location;
                  const appStatus = (app.status || 'pending').toLowerCase();
                  const isApproved = appStatus === 'approved' || Boolean(app.convertedAuctionId);
                  const isRejected = appStatus === 'rejected' || appStatus === 'declined';
                  const convertedAuctionId = app.convertedAuctionId;

                  // Member Auto-Link Badge (ADMIN / BIDDER / GUEST)
                  const memberBadge = app.registeredUserRole 
                    ? app.registeredUserRole.toUpperCase() 
                    : app.isRegisteredUser 
                    ? 'BIDDER' 
                    : 'GUEST';

                  const isConsignmentSelected = Boolean(app.id && selectedConsignmentIds.includes(app.id));

                  return (
                    <div
                      key={app.id}
                      id={`consignment-${app.id}`}
                      className={`bg-[#151a1e] rounded-2xl border p-5 sm:p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-5 transition-all ${
                        highlightedConsignmentId === app.id
                          ? 'border-emerald-500/80 ring-2 ring-emerald-500/30'
                          : isConsignmentSelected
                          ? 'border-red-600/80 bg-red-950/10'
                          : 'border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      {/* Checkbox & Vehicle Info */}
                      <div className="flex items-start gap-3.5 flex-1 min-w-0">
                        {app.id && (
                          <input
                            type="checkbox"
                            checked={isConsignmentSelected}
                            onChange={() => handleToggleConsignmentSelection(app.id!)}
                            className="mt-1 rounded border-zinc-700 text-red-600 focus:ring-red-600 cursor-pointer w-4 h-4 flex-shrink-0"
                            aria-label={`Select consignment for ${app.year} ${app.make} ${app.model}`}
                          />
                        )}
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
                            isApproved
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : isRejected
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
                    </div>

                      {/* Contextual Action Buttons */}
                      <div className="flex flex-wrap items-center gap-2.5 md:flex-col md:items-end shrink-0 pt-3 md:pt-0 border-t md:border-t-0 border-zinc-800">
                        {isApproved ? (
                          <div className="flex items-center gap-2">
                            {convertedAuctionId ? (
                              <button
                                type="button"
                                onClick={() => onOpenListingEditor(convertedAuctionId)}
                                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
                              >
                                <span>Open in Listing Editor</span>
                                <span>→</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmApproveApp(app)}
                                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
                              >
                                <span>Convert to Draft</span>
                                <span>→</span>
                              </button>
                            )}
                            <button
                              type="button"
                              title="Delete Record"
                              onClick={() => setConfirmDeleteConsignment(app)}
                              className="p-2 rounded-xl bg-zinc-800/80 hover:bg-rose-950/60 text-zinc-400 hover:text-rose-400 border border-zinc-700 hover:border-rose-800 transition-all active:scale-95 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ) : isRejected ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setConfirmReopenApp(app)}
                              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Re-Open Application</span>
                            </button>
                            <button
                              type="button"
                              title="Delete Record"
                              onClick={() => setConfirmDeleteConsignment(app)}
                              className="p-2 rounded-xl bg-zinc-800/80 hover:bg-rose-950/60 text-zinc-400 hover:text-rose-400 border border-zinc-700 hover:border-rose-800 transition-all active:scale-95 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          /* PENDING */
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setConfirmApproveApp(app)}
                              disabled={convertingId === app.id}
                              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                            >
                              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span>Approve &amp; Convert</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmRejectApp(app)}
                              className="px-3.5 py-2 rounded-xl text-xs font-bold border border-rose-500/60 hover:border-rose-500 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span>Reject Application</span>
                            </button>
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
        {/* TAB 5: VEHICLE INVENTORY & LOTS */}
        {/* =================================================================== */}
        {activeTab === 'inventory' && (
          <div className="space-y-6">
            <div className="bg-[#151a1e] rounded-2xl border border-zinc-800 p-5 sm:p-6 shadow-sm space-y-4">
              {/* Header & New Lot Trigger */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Car className="w-5 h-5 text-red-500" />
                    <span>Vehicle Inventory &amp; Lots</span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Manage active catalog lots, edit vehicle specifications, toggle status lifecycles, and perform bulk operations.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowNewListingModal(true)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-2 shadow-md transition-all active:scale-95 cursor-pointer self-start sm:self-auto"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ New Vehicle Lot</span>
                </button>
              </div>

              {/* Status Filter Tabs and Search */}
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-3 border-t border-zinc-800/80">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Master Select All Checkbox */}
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 rounded-xl border border-zinc-800 text-xs text-zinc-300">
                    <input
                      type="checkbox"
                      id="select-all-inventory-checkbox"
                      checked={areAllCurrentAuctionsSelected}
                      onChange={handleToggleSelectAllAuctions}
                      className="rounded border-zinc-700 text-red-600 focus:ring-red-600 cursor-pointer"
                    />
                    <label htmlFor="select-all-inventory-checkbox" className="cursor-pointer select-none text-[11px] font-semibold">
                      Select Page {selectedAuctionIds.length > 0 && `(${selectedAuctionIds.length})`}
                    </label>
                  </div>

                  {/* Status Filters */}
                  <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-xl border border-zinc-800 text-xs font-semibold overflow-x-auto">
                    {(['all', 'draft', 'preview', 'upcoming', 'live', 'ended'] as const).map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => {
                          setInventoryStatusFilter(filter);
                          setInventoryPage(1);
                        }}
                        className={`px-3 py-1.5 rounded-lg capitalize transition-all cursor-pointer whitespace-nowrap ${
                          inventoryStatusFilter === filter
                            ? 'bg-zinc-800 text-white font-bold shadow-xs border border-zinc-700'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {filter === 'all' ? `All (${allAuctions.length})` : filter}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Search Bar */}
                <div className="relative min-w-[260px]">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search by make, model, VIN, title..."
                    value={inventorySearch}
                    onChange={(e) => {
                      setInventorySearch(e.target.value);
                      setInventoryPage(1);
                    }}
                    className="w-full pl-9 pr-8 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-600"
                  />
                  {inventorySearch && (
                    <button
                      onClick={() => {
                        setInventorySearch('');
                        setInventoryPage(1);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Inventory Lots Table */}
            <div className="bg-[#151a1e] rounded-2xl border border-zinc-800 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-400 uppercase tracking-wider font-semibold text-[10px]">
                      <th className="p-4 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={areAllCurrentAuctionsSelected}
                          onChange={handleToggleSelectAllAuctions}
                          className="rounded border-zinc-700 text-red-600 focus:ring-red-600 cursor-pointer"
                        />
                      </th>
                      <th className="p-4">Vehicle Lot</th>
                      <th className="p-4">Specifications</th>
                      <th className="p-4">Current High Bid</th>
                      <th className="p-4">Reserve Met</th>
                      <th className="p-4">Status Badge</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/80 text-zinc-300">
                    {paginatedInventory.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-12 text-center text-zinc-500">
                          <Car className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                          <p className="font-semibold text-zinc-300">No vehicle lots found</p>
                          <p className="text-xs mt-1">No catalog entries match your active status or search query.</p>
                        </td>
                      </tr>
                    ) : (
                      paginatedInventory.map((lot) => {
                        const isSelected = selectedAuctionIds.includes(lot.id);
                        const heroImg = lot.leadHeroImage || lot.heroImages?.[0];
                        const highBid = lot.currentBid || lot.startingBid || 0;
                        const hasReserve = (lot.reserveAmount || 0) > 0;
                        const lotStatus = lot.status || 'draft';

                        return (
                          <tr
                            key={lot.id}
                            className={`hover:bg-zinc-800/40 transition-colors ${
                              isSelected ? 'bg-red-950/20' : ''
                            }`}
                          >
                            <td className="p-4 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleAuctionSelection(lot.id)}
                                className="rounded border-zinc-700 text-red-600 focus:ring-red-600 cursor-pointer"
                              />
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-3 min-w-[200px]">
                                {heroImg ? (
                                  <img
                                    src={heroImg}
                                    alt={lot.title}
                                    className="w-14 h-10 object-cover rounded-lg border border-zinc-700 flex-shrink-0 bg-zinc-900"
                                  />
                                ) : (
                                  <div className="w-14 h-10 rounded-lg border border-zinc-800 bg-zinc-900 flex items-center justify-center text-zinc-600 flex-shrink-0">
                                    <Car className="w-5 h-5" />
                                  </div>
                                )}
                                <div className="space-y-0.5">
                                  <button
                                    type="button"
                                    onClick={() => onOpenListingEditor(lot.id)}
                                    className="font-bold text-white block hover:text-red-400 transition-colors text-left cursor-pointer"
                                  >
                                    {lot.title}
                                  </button>
                                  <span className="font-mono text-[10px] text-zinc-500 block truncate max-w-[180px]">
                                    {lot.id}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="space-y-0.5">
                                <span className="text-zinc-200 font-medium block">
                                  {lot.year || '—'} {lot.make || ''} {lot.model || ''}
                                </span>
                                <span className="font-mono text-[10px] text-zinc-400 block truncate max-w-[160px]">
                                  VIN: {lot.vin || '—'}
                                </span>
                              </div>
                            </td>
                            <td className="p-4">
                              <span className="font-mono font-bold text-emerald-400 text-sm block">
                                {formatCurrency(highBid)} CAD
                              </span>
                              {lot.bidCount !== undefined && (
                                <span className="text-[10px] text-zinc-500 block">
                                  {lot.bidCount} bid{lot.bidCount === 1 ? '' : 's'}
                                </span>
                              )}
                            </td>
                            <td className="p-4">
                              {hasReserve ? (
                                lot.isReserveMet ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-950 text-emerald-300 border border-emerald-800">
                                    Reserve Met
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-950 text-amber-300 border border-amber-800">
                                    Reserve Not Met
                                  </span>
                                )
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-zinc-800 text-zinc-400 border border-zinc-700">
                                  No Reserve
                                </span>
                              )}
                            </td>
                            <td className="p-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider ${
                                (lotStatus === 'live' || lotStatus === 'active')
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  : lotStatus === 'upcoming'
                                  ? 'bg-blue-950 text-blue-300 border border-blue-800'
                                  : lotStatus === 'preview'
                                  ? 'bg-purple-950 text-purple-300 border border-purple-800'
                                  : (lotStatus === 'ended' || lotStatus === 'sold' || lotStatus === 'reserve_not_met')
                                  ? 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                                  : 'bg-amber-950 text-amber-300 border border-amber-800'
                              }`}>
                                {lotStatus}
                              </span>
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {/* Open in Listing Editor */}
                                <button
                                  type="button"
                                  onClick={() => onOpenListingEditor(lot.id)}
                                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap active:scale-95"
                                  title={`Open in Listing Editor (/dashboard/listings/${lot.id}/edit)`}
                                >
                                  <span>Open in Listing Editor</span>
                                  <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
                                </button>

                                {/* Status Dropdown */}
                                <select
                                  value={lotStatus}
                                  onChange={async (e) => {
                                    const nextSt = e.target.value as Auction['status'];
                                    try {
                                      await batchUpdateAuctionStatus([lot.id], nextSt);
                                      showToast(`Successfully updated status for 1 vehicle lot to ${nextSt.toUpperCase()}.`);
                                    } catch (err: any) {
                                      showToast(`Failed to update status: ${err.message}`, 'error');
                                    }
                                  }}
                                  className="px-2 py-1.5 rounded-lg text-xs font-semibold bg-zinc-900 border border-zinc-700 text-zinc-200 cursor-pointer focus:ring-1 focus:ring-red-500"
                                >
                                  <option value="draft">Draft</option>
                                  <option value="preview">Preview</option>
                                  <option value="upcoming">Upcoming</option>
                                  <option value="live">Live</option>
                                  <option value="ended">Ended</option>
                                </select>

                                {/* Delete Lot */}
                                <button
                                  type="button"
                                  title="Delete Lot"
                                  onClick={() => {
                                    setConfirmDeleteLot(lot);
                                    setCascadeDeleteConsignmentOnLot(true);
                                  }}
                                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-rose-950/60 text-zinc-400 hover:text-rose-400 border border-zinc-700 hover:border-rose-800 transition-all cursor-pointer active:scale-95"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {inventoryTotal > 0 && (
                <div className="p-4 bg-[#151a1e] border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-400">
                  <div className="flex items-center gap-2">
                    <span>Showing</span>
                    <span className="font-bold text-white font-mono">
                      {Math.min((inventoryPage - 1) * inventoryPageSize + 1, inventoryTotal)}–
                      {Math.min(inventoryPage * inventoryPageSize, inventoryTotal)}
                    </span>
                    <span>of</span>
                    <span className="font-bold text-white font-mono">{inventoryTotal}</span>
                    <span>lots</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setInventoryPage(prev => Math.max(1, prev - 1))}
                      disabled={inventoryPage <= 1}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed border border-zinc-700 flex items-center gap-1 font-semibold cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>Previous</span>
                    </button>

                    <span className="px-3 py-1.5 rounded-lg bg-zinc-900 font-mono font-bold text-zinc-200 border border-zinc-800">
                      {inventoryPage} / {inventoryTotalPages}
                    </span>

                    <button
                      onClick={() => setInventoryPage(prev => Math.min(inventoryTotalPages, prev + 1))}
                      disabled={inventoryPage >= inventoryTotalPages}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed border border-zinc-700 flex items-center gap-1 font-semibold cursor-pointer"
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

              {/* Auction Live Bids & Moderation Audit Stream */}
              {(() => {
                const ledgerAuctionBids = allLiveBids
                  .filter(b => b.auctionId === activeLedgerAuction.id)
                  .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                const activeCount = ledgerAuctionBids.filter(b => b.status !== 'retracted').length;
                const retractedCount = ledgerAuctionBids.filter(b => b.status === 'retracted').length;

                return (
                  <div className="space-y-3 pt-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
                          <Zap className="w-4 h-4 text-amber-400" />
                          <span>Live Bids & Audit Stream — {activeLedgerAuction.title || activeLedgerAuction.id}</span>
                        </h4>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          Option B soft retraction audit trail. Moderate and retract fraudulent or errant bids atomically.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-xs font-mono">
                        <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                          {activeCount} Active Bid{activeCount === 1 ? '' : 's'}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800">
                          {retractedCount} Retracted
                        </span>
                      </div>
                    </div>

                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-2 max-h-96 overflow-y-auto">
                      {ledgerAuctionBids.length === 0 ? (
                        <div className="py-8 text-center text-xs text-zinc-500">
                          No bids placed for this vehicle lot yet.
                        </div>
                      ) : (
                        ledgerAuctionBids.map(bid => renderBidItem(bid, false))
                      )}
                    </div>
                  </div>
                );
              })()}

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

              {/* Header Emblem Preview */}
              <div className="space-y-3">
                <label className="block font-bold text-zinc-200 text-xs uppercase tracking-wider">
                  LIVE DARK HEADER NAVBAR PREVIEW (40PX HEIGHT CONSTRAINT)
                </label>
                <div className="w-full px-4 rounded-xl bg-slate-900 border border-slate-800 h-10 flex items-center justify-between shadow-inner">
                  <div className="flex items-center gap-3 h-full">
                    {siteLogo && siteLogo.trim() !== '' ? (
                      <img
                        src={siteLogo}
                        alt={siteName || "Site Logo"}
                        className="max-h-8 w-auto object-contain flex-shrink-0"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <WailtailLogo theme="dark" className="max-h-8 w-auto object-contain flex-shrink-0" />
                    )}
                    <div className="flex flex-col justify-center min-w-0 border-l border-slate-800 pl-3">
                      <span className="font-black italic tracking-tight text-base sm:text-lg leading-none text-white font-sans whitespace-nowrap uppercase">
                        {siteName || 'wailtail'}
                      </span>
                      <span className="text-[8px] sm:text-[9px] uppercase tracking-[0.2em] font-semibold text-zinc-400 mt-0.5 whitespace-nowrap">
                        {siteTagline || 'Single-Car Auctions'}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider hidden sm:inline">
                    Live Header Preview
                  </span>
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

            {/* Promotional & Launch Campaign Manager */}
            <div className="bg-[#151a1e] rounded-2xl border border-zinc-800 p-6 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-zinc-800 gap-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Megaphone className="w-5 h-5 text-amber-400" />
                    <span>Promotional & Launch Campaign Manager</span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Launch campaign cards, catalog grid injection, lot banners, audience filtering, and click analytics
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSavePromoSettings}
                    disabled={savingPromos}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1.5 shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>{savingPromos ? 'Saving Campaign...' : 'Save Campaign Settings'}</span>
                  </button>
                </div>
              </div>

              {/* Master Platform Promotional Toggle */}
              <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Promotional Subsystem Master Switch</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                        promoSettings.enabled
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                      }`}
                    >
                      {promoSettings.enabled ? 'ACTIVE' : 'DISABLED'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Controls all client-facing catalog injection cards and direct-lot promotional banners globally.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!promoSettings.enabled}
                    onChange={(e) =>
                      setPromoSettings((prev) => ({
                        ...prev,
                        enabled: e.target.checked
                      }))
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {/* Lot View Header Banner Configuration */}
              <div className="p-5 rounded-xl bg-[#121619] border border-zinc-800 space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <div>
                      <h4 className="text-sm font-bold text-white">Direct-Lot Header Banner</h4>
                      <p className="text-[11px] text-zinc-400">
                        Sticky launch announcement banner pinned to top of active vehicle auction lots
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-700 text-xs font-mono text-zinc-300">
                      <MousePointerClick className="w-3.5 h-3.5 text-amber-400" />
                      <span>{(promoAnalytics['lot_header_banner'] ?? promoSettings.lotHeaderBanner?.clickCount) || 0} clicks</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!promoSettings.lotHeaderBanner?.enabled}
                        onChange={(e) => handleUpdateBanner({ enabled: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-zinc-400">Badge Text (Optional)</label>
                    <input
                      type="text"
                      value={promoSettings.lotHeaderBanner?.badgeText || ''}
                      onChange={(e) => handleUpdateBanner({ badgeText: e.target.value })}
                      placeholder="e.g. LAUNCH SPECIAL"
                      className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-zinc-400">Target Audience</label>
                    <select
                      value={promoSettings.lotHeaderBanner?.targetAudience || 'all'}
                      onChange={(e) => handleUpdateBanner({ targetAudience: e.target.value as PromoAudience })}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-white"
                    >
                      <option value="all">All Visitors (Guests & Registered)</option>
                      <option value="guests_only">Guests Only (Unauthenticated)</option>
                      <option value="authenticated_only">Registered Members Only</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-zinc-400">Banner Announcement Copy</label>
                  <input
                    type="text"
                    value={promoSettings.lotHeaderBanner?.text || ''}
                    onChange={(e) => handleUpdateBanner({ text: e.target.value })}
                    placeholder="e.g. Zero buyer premiums & $0 seller fees for our inaugural catalog launch."
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-white"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-zinc-400">CTA Button Text</label>
                    <input
                      type="text"
                      value={promoSettings.lotHeaderBanner?.ctaText || ''}
                      onChange={(e) => handleUpdateBanner({ ctaText: e.target.value })}
                      placeholder="e.g. Consign Vehicle"
                      className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-zinc-400">CTA Action Route</label>
                    <select
                      value={promoSettings.lotHeaderBanner?.ctaAction || 'consignment_modal'}
                      onChange={(e) => handleUpdateBanner({ ctaAction: e.target.value as PromoCtaAction })}
                      className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-white"
                    >
                      <option value="consignment_modal">Consignment Modal</option>
                      <option value="auth_modal">Authentication / Login Modal</option>
                      <option value="contact_modal">Seller Contact Modal</option>
                      <option value="external_url">External Web Link</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-zinc-400">External URL (if selected)</label>
                    <input
                      type="text"
                      disabled={promoSettings.lotHeaderBanner?.ctaAction !== 'external_url'}
                      value={promoSettings.lotHeaderBanner?.ctaUrl || ''}
                      onChange={(e) => handleUpdateBanner({ ctaUrl: e.target.value })}
                      placeholder="https://..."
                      className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-white disabled:opacity-40"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Start Date / Window (Optional)</span>
                    </label>
                    <input
                      type="datetime-local"
                      value={toDateTimeLocalValue(promoSettings.lotHeaderBanner?.startDate)}
                      onChange={(e) =>
                        handleUpdateBanner({
                          startDate: e.target.value ? new Date(e.target.value).toISOString() : undefined
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-white font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Expiration Date (Optional)</span>
                    </label>
                    <input
                      type="datetime-local"
                      value={toDateTimeLocalValue(promoSettings.lotHeaderBanner?.expiresAt)}
                      onChange={(e) =>
                        handleUpdateBanner({
                          expiresAt: e.target.value ? new Date(e.target.value).toISOString() : undefined
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-white font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Expandable Promo Card Manager */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Tag className="w-4 h-4 text-emerald-400" />
                      <span>Catalog Grid Promotional Cards</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-300">
                        {promoSettings.cards?.length || 0}
                      </span>
                    </h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Dynamically injected into empty vehicle slots when catalog has ≤ 2 active lots. Dismissible by clients.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddPromoCard}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-700 hover:bg-emerald-600 text-white flex items-center gap-1 shadow transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Promotional Card</span>
                  </button>
                </div>

                {(!promoSettings.cards || promoSettings.cards.length === 0) && (
                  <div className="text-center py-8 rounded-xl border border-dashed border-zinc-800 text-zinc-500 text-xs">
                    No promotional cards configured. Click "Add Promotional Card" above to create one.
                  </div>
                )}

                <div className="space-y-3">
                  {(promoSettings.cards || []).map((card, idx) => {
                    const isExpanded = !!expandedCardIds[card.id];
                    const accentStyles = {
                      amber: 'border-amber-500/40 bg-amber-950/20 text-amber-400',
                      emerald: 'border-emerald-500/40 bg-emerald-950/20 text-emerald-400',
                      purple: 'border-purple-500/40 bg-purple-950/20 text-purple-400',
                      blue: 'border-blue-500/40 bg-blue-950/20 text-blue-400'
                    }[card.accentColor || 'amber'];

                    return (
                      <div
                        key={card.id || `card-${idx}`}
                        className={`rounded-xl border transition-all ${
                          isExpanded ? 'border-zinc-700 bg-zinc-900/90' : 'border-zinc-800 bg-[#121619] hover:border-zinc-700'
                        }`}
                      >
                        {/* Header Bar */}
                        <div className="p-4 flex items-center justify-between gap-3">
                          <div
                            onClick={() => toggleCardExpanded(card.id)}
                            className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer select-none"
                          >
                            <span
                              className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                                card.accentColor === 'emerald'
                                  ? 'bg-emerald-500'
                                  : card.accentColor === 'purple'
                                  ? 'bg-purple-500'
                                  : card.accentColor === 'blue'
                                  ? 'bg-blue-500'
                                  : 'bg-amber-500'
                              }`}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs text-white truncate">
                                  {card.headline || 'Untitled Promotional Card'}
                                </span>
                                {card.badgeText && (
                                  <span className={`px-2 py-0.2 text-[9px] font-black uppercase rounded border ${accentStyles}`}>
                                    {card.badgeText}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                                {card.copy || 'No description provided'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                            {/* Click Counter */}
                            <div className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800/80 border border-zinc-700/60 text-[11px] font-mono text-zinc-300">
                              <MousePointerClick className="w-3 h-3 text-amber-400" />
                              <span>{(promoAnalytics[card.id] ?? card.clickCount) || 0}</span>
                            </div>

                            {/* Card Enabled Toggle */}
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!card.enabled}
                                onChange={(e) => handleUpdateCard(card.id, { enabled: e.target.checked })}
                                className="sr-only peer"
                              />
                              <div className="w-8 h-4 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-600"></div>
                            </label>

                            {/* Expand / Collapse */}
                            <button
                              type="button"
                              onClick={() => toggleCardExpanded(card.id)}
                              className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
                              title={isExpanded ? 'Collapse' : 'Expand'}
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>

                            {/* Delete Button */}
                            <button
                              type="button"
                              onClick={() => handleRemovePromoCard(card.id)}
                              className="p-1.5 text-zinc-500 hover:text-red-400 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
                              title="Delete Card"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Expanded Edit Form */}
                        {isExpanded && (
                          <div className="p-4 border-t border-zinc-800/80 bg-zinc-950/40 space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                              <div className="space-y-1">
                                <label className="block text-xs font-semibold text-zinc-400">Accent Color</label>
                                <select
                                  value={card.accentColor || 'amber'}
                                  onChange={(e) =>
                                    handleUpdateCard(card.id, { accentColor: e.target.value as PromoAccentColor })
                                  }
                                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-white"
                                >
                                  <option value="amber">Amber Gold</option>
                                  <option value="emerald">Emerald Green</option>
                                  <option value="purple">Purple Indigo</option>
                                  <option value="blue">Electric Blue</option>
                                </select>
                              </div>
                              <div className="space-y-1">
                                <label className="block text-xs font-semibold text-zinc-400">Badge Text</label>
                                <input
                                  type="text"
                                  value={card.badgeText || ''}
                                  onChange={(e) => handleUpdateCard(card.id, { badgeText: e.target.value })}
                                  placeholder="e.g. FOUNDERS OFFER"
                                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-white"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-xs font-semibold text-zinc-400">Target Audience</label>
                                <select
                                  value={card.targetAudience || 'all'}
                                  onChange={(e) =>
                                    handleUpdateCard(card.id, { targetAudience: e.target.value as PromoAudience })
                                  }
                                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-white"
                                >
                                  <option value="all">All Visitors</option>
                                  <option value="guests_only">Guests Only (Unauthenticated)</option>
                                  <option value="authenticated_only">Registered Members Only</option>
                                </select>
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="block text-xs font-semibold text-zinc-400">Headline</label>
                              <input
                                type="text"
                                value={card.headline || ''}
                                onChange={(e) => handleUpdateCard(card.id, { headline: e.target.value })}
                                placeholder="e.g. $0 Seller Fees & 0% Buyer Premium"
                                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-white"
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="block text-xs font-semibold text-zinc-400">Card Narrative / Copy</label>
                              <textarea
                                rows={2}
                                value={card.copy || ''}
                                onChange={(e) => handleUpdateCard(card.id, { copy: e.target.value })}
                                placeholder="Detailed campaign explanation or instructions..."
                                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-white resize-y"
                              />
                            </div>

                            {/* Promotional Card Image Asset */}
                            <div className="space-y-2 pt-2 border-t border-zinc-800/80">
                              <label className="block text-xs font-semibold text-zinc-400 flex items-center justify-between">
                                <span className="flex items-center gap-1.5">
                                  <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
                                  <span>Card Visual Asset (Optional Image)</span>
                                </span>
                                {card.imageUrl && (
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateCard(card.id, { imageUrl: '' })}
                                    className="text-[11px] text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer font-medium"
                                  >
                                    <X className="w-3 h-3" />
                                    <span>Remove Image</span>
                                  </button>
                                )}
                              </label>

                              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                                <div className="sm:col-span-8">
                                  <input
                                    type="text"
                                    value={card.imageUrl || ''}
                                    onChange={(e) => handleUpdateCard(card.id, { imageUrl: e.target.value })}
                                    placeholder="https://... or upload image asset"
                                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-white font-mono placeholder:font-sans"
                                  />
                                </div>
                                <div className="sm:col-span-4">
                                  <input
                                    type="file"
                                    id={`promo-image-file-${card.id}`}
                                    accept="image/*"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) handlePromoImageUpload(card.id, file);
                                    }}
                                    className="hidden"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => document.getElementById(`promo-image-file-${card.id}`)?.click()}
                                    className="w-full py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs flex items-center justify-center gap-2 border border-zinc-700 cursor-pointer shadow-xs transition-all"
                                  >
                                    <Upload className="w-3.5 h-3.5 text-purple-400" />
                                    <span>Upload Image</span>
                                  </button>
                                </div>
                              </div>

                              {/* Inline Thumbnail Preview */}
                              {card.imageUrl && (
                                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-700/80">
                                  <div className="w-20 h-14 rounded-lg overflow-hidden bg-black/60 border border-zinc-700 shrink-0 relative flex items-center justify-center">
                                    <img
                                      src={card.imageUrl}
                                      alt={card.imageAlt || card.headline || 'Promo visual asset preview'}
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        (e.target as HTMLElement).style.display = 'none';
                                      }}
                                    />
                                    <ImageIcon className="w-5 h-5 text-zinc-600 absolute pointer-events-none -z-10" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[11px] font-mono text-zinc-200 truncate">{card.imageUrl}</p>
                                    <p className="text-[10px] text-zinc-400 mt-0.5">Asset populated on catalog promo card</p>
                                  </div>
                                </div>
                              )}

                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-zinc-400">Image Alt Text (Optional)</label>
                                <input
                                  type="text"
                                  value={card.imageAlt || ''}
                                  onChange={(e) => handleUpdateCard(card.id, { imageAlt: e.target.value })}
                                  placeholder="e.g. Vintage 911 banner photo"
                                  className="w-full px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700/80 text-xs text-zinc-300"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                              <div className="space-y-1">
                                <label className="block text-xs font-semibold text-zinc-400">CTA Button Text</label>
                                <input
                                  type="text"
                                  value={card.ctaText || ''}
                                  onChange={(e) => handleUpdateCard(card.id, { ctaText: e.target.value })}
                                  placeholder="e.g. Consign Vehicle"
                                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-white"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-xs font-semibold text-zinc-400">CTA Action Route</label>
                                <select
                                  value={card.ctaAction || 'consignment_modal'}
                                  onChange={(e) =>
                                    handleUpdateCard(card.id, { ctaAction: e.target.value as PromoCtaAction })
                                  }
                                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-white"
                                >
                                  <option value="consignment_modal">Consignment Modal</option>
                                  <option value="auth_modal">Authentication / Login Modal</option>
                                  <option value="contact_modal">Seller Contact Modal</option>
                                  <option value="external_url">External Web Link</option>
                                </select>
                              </div>
                              <div className="space-y-1">
                                <label className="block text-xs font-semibold text-zinc-400">External URL (if selected)</label>
                                <input
                                  type="text"
                                  disabled={card.ctaAction !== 'external_url'}
                                  value={card.ctaUrl || ''}
                                  onChange={(e) => handleUpdateCard(card.id, { ctaUrl: e.target.value })}
                                  placeholder="https://..."
                                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-white disabled:opacity-40"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                              <div className="space-y-1">
                                <label className="block text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
                                  <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                                  <span>Start Date / Window (Optional)</span>
                                </label>
                                <input
                                  type="datetime-local"
                                  value={toDateTimeLocalValue(card.startDate)}
                                  onChange={(e) =>
                                    handleUpdateCard(card.id, {
                                      startDate: e.target.value ? new Date(e.target.value).toISOString() : undefined
                                    })
                                  }
                                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-white font-mono"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
                                  <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                                  <span>Expiration Date (Optional)</span>
                                </label>
                                <input
                                  type="datetime-local"
                                  value={toDateTimeLocalValue(card.expiresAt)}
                                  onChange={(e) =>
                                    handleUpdateCard(card.id, {
                                      expiresAt: e.target.value ? new Date(e.target.value).toISOString() : undefined
                                    })
                                  }
                                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-white font-mono"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bottom Quick Save Bar */}
              <div className="pt-4 border-t border-zinc-800 flex justify-end">
                <button
                  type="button"
                  onClick={handleSavePromoSettings}
                  disabled={savingPromos}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-2 shadow-lg transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingPromos ? 'Saving Campaign Settings...' : 'Save Campaign Settings'}</span>
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

      {/* MODAL: APPROVE & CONVERT CONSIGNMENT CONFIRMATION */}
      {confirmApproveApp && (
        <div
          onClick={() => { setConfirmApproveApp(null); clearUrlParams(); }}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#151a1e] rounded-2xl shadow-2xl border border-emerald-800 p-6 space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="p-3 rounded-xl bg-emerald-950 text-emerald-400 border border-emerald-800 flex-shrink-0">
                <CheckCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1 flex-1">
                <h3 className="text-base font-bold text-white">Approve &amp; Convert Consignment?</h3>
                <p className="text-xs text-zinc-300">
                  Ready to approve <strong className="text-white">{confirmApproveApp.year} {confirmApproveApp.make} {confirmApproveApp.model}</strong> submitted by <span className="text-zinc-200 font-semibold">{confirmApproveApp.sellerName}</span> ({confirmApproveApp.sellerEmail})?
                </p>
                <p className="text-[11px] text-zinc-400">
                  This converts the submission directly into a pre-populated vehicle listing draft and promotes the consignor to seller role.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => { setConfirmApproveApp(null); clearUrlParams(); }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = confirmApproveApp;
                  setConfirmApproveApp(null);
                  await handleConvertConsignment(target);
                }}
                disabled={convertingId === confirmApproveApp.id}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>{convertingId === confirmApproveApp.id ? 'Converting...' : 'Approve & Create Draft'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REJECT CONSIGNMENT CONFIRMATION */}
      {confirmRejectApp && (
        <div
          onClick={() => { setConfirmRejectApp(null); clearUrlParams(); }}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#151a1e] rounded-2xl shadow-2xl border border-rose-800 p-6 space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="p-3 rounded-xl bg-rose-950 text-rose-400 border border-rose-800 flex-shrink-0">
                <Ban className="w-6 h-6" />
              </div>
              <div className="space-y-1 flex-1">
                <h3 className="text-base font-bold text-white">Reject Consignment Application?</h3>
                <p className="text-xs text-zinc-300">
                  Are you sure you want to reject the application for <strong className="text-white">{confirmRejectApp.year} {confirmRejectApp.make} {confirmRejectApp.model}</strong> from <span className="text-zinc-200 font-semibold">{confirmRejectApp.sellerName}</span>?
                </p>
                <p className="text-[11px] text-zinc-400">
                  The application status will be marked as rejected. It remains accessible in the consignment pipeline and can be re-opened at any time.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => { setConfirmRejectApp(null); clearUrlParams(); }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = confirmRejectApp;
                  setConfirmRejectApp(null);
                  await handleRejectConsignment(target);
                }}
                disabled={processingConsignmentAction}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
                <span>{processingConsignmentAction ? 'Rejecting...' : 'Reject Application'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RE-OPEN CONSIGNMENT CONFIRMATION */}
      {confirmReopenApp && (
        <div
          onClick={() => { setConfirmReopenApp(null); clearUrlParams(); }}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#151a1e] rounded-2xl shadow-2xl border border-amber-800 p-6 space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="p-3 rounded-xl bg-amber-950 text-amber-400 border border-amber-800 flex-shrink-0">
                <RotateCcw className="w-6 h-6" />
              </div>
              <div className="space-y-1 flex-1">
                <h3 className="text-base font-bold text-white">Re-Open Consignment Application?</h3>
                <p className="text-xs text-zinc-300">
                  Restore <strong className="text-white">{confirmReopenApp.year} {confirmReopenApp.make} {confirmReopenApp.model}</strong> back to pending triage status?
                </p>
                <p className="text-[11px] text-zinc-400">
                  This returns the consignment back to the active pending review pipeline.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => { setConfirmReopenApp(null); clearUrlParams(); }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = confirmReopenApp;
                  setConfirmReopenApp(null);
                  await handleReopenConsignment(target);
                }}
                disabled={processingConsignmentAction}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{processingConsignmentAction ? 'Re-Opening...' : 'Re-Open as Pending'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DELETE CONSIGNMENT RECORD CONFIRMATION */}
      {confirmDeleteConsignment && (
        <div
          onClick={() => { setConfirmDeleteConsignment(null); clearUrlParams(); }}
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
                <h3 className="text-base font-bold text-white">Permanently Delete Consignment Record?</h3>
                <p className="text-xs text-zinc-300">
                  Are you sure you want to permanently delete submission for{' '}
                  <strong className="text-white">{confirmDeleteConsignment.year} {confirmDeleteConsignment.make} {confirmDeleteConsignment.model}</strong> ({confirmDeleteConsignment.sellerName})?
                </p>
                <p className="text-[11px] text-zinc-400">
                  This document will be permanently deleted from consignment_applications in Firestore. This action cannot be reversed.
                </p>
              </div>
            </div>

            {/* Cascading Deletion Checkbox for Approved Consignment */}
            {Boolean(confirmDeleteConsignment.convertedAuctionId || confirmDeleteConsignment.status === 'approved') && (
              <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center gap-3">
                <input
                  type="checkbox"
                  id="cascade-delete-auction-on-consignment"
                  checked={cascadeDeleteAuctionOnConsignment}
                  onChange={(e) => setCascadeDeleteAuctionOnConsignment(e.target.checked)}
                  className="rounded border-zinc-700 text-red-600 focus:ring-red-600 cursor-pointer"
                />
                <label htmlFor="cascade-delete-auction-on-consignment" className="text-xs text-zinc-300 cursor-pointer select-none">
                  Also delete associated vehicle listing from auctions catalog?
                </label>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => { setConfirmDeleteConsignment(null); clearUrlParams(); }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = confirmDeleteConsignment;
                  setConfirmDeleteConsignment(null);
                  await handleDeleteConsignment(target, cascadeDeleteAuctionOnConsignment);
                }}
                disabled={processingConsignmentAction}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>{processingConsignmentAction ? 'Deleting...' : 'Yes, Delete Record'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DELETE VEHICLE LOT CONFIRMATION */}
      {confirmDeleteLot && (
        <div
          onClick={() => setConfirmDeleteLot(null)}
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
                <h3 className="text-base font-bold text-white">Permanently Delete Vehicle Lot?</h3>
                <p className="text-xs text-zinc-300">
                  Are you sure you want to permanently delete listing <strong className="text-white">{confirmDeleteLot.title}</strong> (ID: <span className="font-mono text-zinc-400">{confirmDeleteLot.id}</span>)?
                </p>
                <p className="text-[11px] text-zinc-400">
                  This document and its media configurations will be permanently deleted from Firestore.
                </p>
              </div>
            </div>

            {/* Cascading Deletion Checkbox for Linked Consignment */}
            <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center gap-3">
              <input
                type="checkbox"
                id="cascade-delete-consignment-on-lot"
                checked={cascadeDeleteConsignmentOnLot}
                onChange={(e) => setCascadeDeleteConsignmentOnLot(e.target.checked)}
                className="rounded border-zinc-700 text-red-600 focus:ring-red-600 cursor-pointer"
              />
              <label htmlFor="cascade-delete-consignment-on-lot" className="text-xs text-zinc-300 cursor-pointer select-none">
                Also delete associated vehicle listing from auctions catalog?
              </label>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setConfirmDeleteLot(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = confirmDeleteLot;
                  setConfirmDeleteLot(null);
                  try {
                    await deleteListing(target.id, cascadeDeleteConsignmentOnLot);
                    showToast(`Successfully deleted vehicle lot "${target.title}" and purged all associated bid records.`);
                  } catch (err: any) {
                    showToast(`Failed to delete lot: ${err.message || 'Error'}`, 'error');
                  }
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Yes, Delete Lot</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: BULK DELETE CONSIGNMENTS CONFIRMATION */}
      {confirmBulkDeleteConsignments && (
        <div
          onClick={() => setConfirmBulkDeleteConsignments(false)}
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
                <h3 className="text-base font-bold text-white">
                  Delete {selectedConsignmentIds.length} Consignment{selectedConsignmentIds.length > 1 ? 's' : ''}?
                </h3>
                <p className="text-xs text-zinc-300">
                  Are you sure you want to permanently delete {selectedConsignmentIds.length} selected consignment application record{selectedConsignmentIds.length > 1 ? 's' : ''}?
                </p>
                <p className="text-[11px] text-zinc-400">
                  This action commits a Firestore atomic batch deletion and cannot be reversed.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center gap-3">
              <input
                type="checkbox"
                id="bulk-cascade-delete-auction-checkbox"
                checked={bulkCascadeDeleteAuction}
                onChange={(e) => setBulkCascadeDeleteAuction(e.target.checked)}
                className="rounded border-zinc-700 text-red-600 focus:ring-red-600 cursor-pointer"
              />
              <label htmlFor="bulk-cascade-delete-auction-checkbox" className="text-xs text-zinc-300 cursor-pointer select-none">
                Also delete associated vehicle listing from auctions catalog?
              </label>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setConfirmBulkDeleteConsignments(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setConfirmBulkDeleteConsignments(false);
                  const count = selectedConsignmentIds.length;
                  try {
                    await batchDeleteConsignments(selectedConsignmentIds, bulkCascadeDeleteAuction);
                    setSelectedConsignmentIds([]);
                    showToast(`Successfully deleted ${count} consignment application${count > 1 ? 's' : ''}.`);
                    loadConsignments();
                  } catch (err: any) {
                    showToast(`Batch deletion failed: ${err.message || 'Error'}`, 'error');
                  }
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete {selectedConsignmentIds.length} Consignments</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: BULK DELETE AUCTIONS CONFIRMATION */}
      {confirmBulkDeleteAuctions && (
        <div
          onClick={() => setConfirmBulkDeleteAuctions(false)}
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
                <h3 className="text-base font-bold text-white">
                  Delete {selectedAuctionIds.length} Vehicle Lot{selectedAuctionIds.length > 1 ? 's' : ''}?
                </h3>
                <p className="text-xs text-zinc-300">
                  Are you sure you want to permanently delete {selectedAuctionIds.length} selected vehicle lot{selectedAuctionIds.length > 1 ? 's' : ''}?
                </p>
                <p className="text-[11px] text-zinc-400">
                  Target auctions and their media configuration documents will be deleted atomically.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center gap-3">
              <input
                type="checkbox"
                id="bulk-cascade-delete-consignment-checkbox"
                checked={bulkCascadeDeleteConsignment}
                onChange={(e) => setBulkCascadeDeleteConsignment(e.target.checked)}
                className="rounded border-zinc-700 text-red-600 focus:ring-red-600 cursor-pointer"
              />
              <label htmlFor="bulk-cascade-delete-consignment-checkbox" className="text-xs text-zinc-300 cursor-pointer select-none">
                Also delete associated vehicle consignment applications?
              </label>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setConfirmBulkDeleteAuctions(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setConfirmBulkDeleteAuctions(false);
                  const count = selectedAuctionIds.length;
                  try {
                    await batchDeleteAuctions(selectedAuctionIds, bulkCascadeDeleteConsignment);
                    setSelectedAuctionIds([]);
                    showToast(`Successfully deleted ${count} vehicle lot${count > 1 ? 's' : ''} and purged all associated bid records.`);
                  } catch (err: any) {
                    showToast(`Batch lot deletion failed: ${err.message || 'Error'}`, 'error');
                  }
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete {selectedAuctionIds.length} Lots</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING BULK ACTION TOOLBAR */}
      {((activeTab === 'consignments' && selectedConsignmentIds.length > 0) ||
        (activeTab === 'inventory' && selectedAuctionIds.length > 0)) && (
        <aside
          aria-label="Bulk action toolbar"
          className="fixed bottom-6 inset-x-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-40 bg-[#151a1e]/95 backdrop-blur-md border border-zinc-700/80 shadow-2xl rounded-2xl px-5 py-3 flex flex-wrap items-center justify-between sm:justify-center gap-3 animate-in slide-in-from-bottom-5"
        >
          {/* Selection Counter */}
          <div className="flex items-center gap-2 pr-3 border-r border-zinc-700 text-xs font-semibold text-zinc-200">
            <span className="px-2 py-0.5 rounded-full bg-red-950 text-red-300 font-mono font-bold text-[11px] border border-red-800">
              {activeTab === 'consignments' ? selectedConsignmentIds.length : selectedAuctionIds.length}
            </span>
            <span>
              {activeTab === 'consignments'
                ? `${selectedConsignmentIds.length} item${selectedConsignmentIds.length > 1 ? 's' : ''} selected`
                : `${selectedAuctionIds.length} lot${selectedAuctionIds.length > 1 ? 's' : ''} selected`}
            </span>
          </div>

          {/* Consignment Bulk Actions */}
          {activeTab === 'consignments' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={selectedConsignmentIds.length === 0}
                onClick={async () => {
                  const count = selectedConsignmentIds.length;
                  try {
                    await batchUpdateConsignmentStatus(selectedConsignmentIds, 'approved');
                    showToast(`Successfully updated status for ${count} consignment applications.`);
                    setSelectedConsignmentIds([]);
                    loadConsignments();
                  } catch (err: any) {
                    showToast(`Batch approval failed: ${err.message || 'Error'}`, 'error');
                  }
                }}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-sm transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Approve Selected</span>
              </button>

              <button
                type="button"
                disabled={selectedConsignmentIds.length === 0}
                onClick={async () => {
                  const count = selectedConsignmentIds.length;
                  try {
                    await batchUpdateConsignmentStatus(selectedConsignmentIds, 'rejected');
                    showToast(`Successfully updated status for ${count} consignment applications.`);
                    setSelectedConsignmentIds([]);
                    loadConsignments();
                  } catch (err: any) {
                    showToast(`Batch rejection failed: ${err.message || 'Error'}`, 'error');
                  }
                }}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold border border-rose-500/60 hover:border-rose-500 text-rose-400 hover:bg-rose-500/10 flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
              >
                <X className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Reject Selected</span>
              </button>

              <button
                type="button"
                disabled={selectedConsignmentIds.length === 0}
                onClick={() => setConfirmBulkDeleteConsignments(true)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-red-700/80 hover:bg-red-700 text-white flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Selected</span>
              </button>
            </div>
          )}

          {/* Vehicle Inventory Lots Bulk Actions */}
          {activeTab === 'inventory' && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-zinc-400 hidden md:inline">Set Status:</span>
                {(['draft', 'upcoming', 'live', 'ended'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    disabled={selectedAuctionIds.length === 0}
                    onClick={async () => {
                      const count = selectedAuctionIds.length;
                      try {
                        await batchUpdateAuctionStatus(selectedAuctionIds, st);
                        showToast(`Successfully updated status for ${count} vehicle lot${count > 1 ? 's' : ''}.`);
                        setSelectedAuctionIds([]);
                      } catch (err: any) {
                        showToast(`Batch status update failed: ${err.message || 'Error'}`, 'error');
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 disabled:opacity-40 cursor-pointer transition-all active:scale-95"
                  >
                    {st}
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={selectedAuctionIds.length === 0}
                onClick={() => setConfirmBulkDeleteAuctions(true)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-red-700/80 hover:bg-red-700 text-white flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Selected</span>
              </button>
            </div>
          )}

          {/* Clear Selection Button */}
          <button
            type="button"
            onClick={() => {
              setSelectedConsignmentIds([]);
              setSelectedAuctionIds([]);
            }}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        </aside>
      )}

      {/* MODAL: RETRACT BID MODERATION (OPTION B SOFT RETRACTION) */}
      {retractingBid && (() => {
        const isLotMissing = !allAuctions.some(a => a.id === retractingBid.auctionId) && retractingBid.auctionId !== auction.id;
        return (
        <div
          onClick={() => {
            if (!retractionSubmitting) {
              setRetractingBid(null);
              setRetractionReason('');
              setRetractionError(null);
            }
          }}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 animate-in fade-in backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-[#151a1e] rounded-2xl shadow-2xl border border-amber-600/60 p-6 space-y-5"
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-800">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                    <RotateCcw className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-bold text-white">Retract Bid — Audit Log Moderation</h3>
                </div>
                <p className="text-xs text-zinc-400">
                  {isLotMissing
                    ? 'Orphaned Bid Retraction (Parent lot was deleted)'
                    : 'Option B Administrative Soft Retraction (preserves audit record)'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!retractionSubmitting) {
                    setRetractingBid(null);
                    setRetractionReason('');
                    setRetractionError(null);
                  }
                }}
                disabled={retractionSubmitting}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-40 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Target Bid Telemetry Summary */}
            <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Bid Amount:</span>
                <span className="font-mono text-base font-black text-amber-400">
                  {formatCurrency(retractingBid.amount)} CAD
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Bidder:</span>
                <span className="font-semibold text-zinc-200">
                  {retractingBid.bidderName || 'Anonymous'} ({retractingBid.bidderEmail || '—'})
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Placed Timestamp:</span>
                <span className="font-mono text-zinc-400">
                  {formatDateTime(retractingBid.timestamp)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Target Lot:</span>
                <div className="flex items-center gap-2">
                  {isLotMissing ? (
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-950/90 text-amber-300 border border-amber-800 shadow-sm inline-flex items-center gap-1"
                      title="Referenced auction lot was deleted"
                    >
                      <AlertTriangle className="w-3 h-3 text-amber-400" />
                      <span>ORPHANED BID (LOT DELETED)</span>
                    </span>
                  ) : (
                    <span className="font-mono text-zinc-400 truncate max-w-[200px]">
                      {retractingBid.auctionId}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Audit Trail Guarantee Notice / Orphaned Bid Notice */}
            {isLotMissing ? (
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-600/70 flex items-start gap-2.5 text-xs text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <strong className="font-bold">Notice:</strong> Parent lot was deleted. Retracting will mark/purge this orphaned bid without updating lot telemetry.
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/50 flex items-start gap-2.5 text-xs text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <strong className="font-bold">Audit Trail Guarantee:</strong> This bid record will NOT be deleted. It will be marked with status <span className="font-mono uppercase font-bold text-amber-200">"retracted"</span> and stamped with your admin ID and timestamp. Auction high bid and count will be atomically recalculated.
                </div>
              </div>
            )}

            {/* Reason for Retraction (Required) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center justify-between">
                <span>Reason for Retraction <span className="text-red-400">*</span></span>
                <span className="text-[11px] font-normal text-zinc-500">Required for audit trail</span>
              </label>
              <textarea
                value={retractionReason}
                onChange={(e) => {
                  setRetractionReason(e.target.value);
                  if (retractionError) setRetractionError(null);
                }}
                disabled={retractionSubmitting}
                placeholder="e.g. Errant typo bid ($50,000 instead of $5,000), bidder payment failure, mutual agreement with seller..."
                rows={3}
                className="w-full p-3 rounded-xl bg-black border border-zinc-700 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              {retractionError && (
                <p className="text-xs font-semibold text-red-400 flex items-center gap-1 mt-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{retractionError}</span>
                </p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setRetractingBid(null);
                  setRetractionReason('');
                  setRetractionError(null);
                }}
                disabled={retractionSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmRetraction}
                disabled={retractionSubmitting || !retractionReason.trim()}
                className="px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {retractionSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Retracting...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Confirm Retraction</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
};
