import React, { useState, useEffect, useRef } from 'react';
import { Auction, Bid, UserProfile, MediaConfiguration, GalleryImage, ShowcaseSection, VideoChapter, ConsignmentApplication } from '../types';
import { 
  updateAuctionConfig, 
  subscribeToAllBidders, 
  setAuctionEndingSoon,
  clearAllBidsAndReset,
  banOrRemoveBidder,
  unbanBidder,
  createNewListing,
  deleteListing,
  duplicateListing,
  subscribeToAllAuctions,
  purgeAllListings,
  subscribeToConsignments,
  approveConsignmentAndPromoteSeller,
  compressImageDataUrl,
  uploadImageToStorage,
  MAIN_AUCTION_ID
} from '../services/auctionService';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import { fetchYouTubeMetadata } from '../utils/youtubeMetadata';
import { WailtailLogo } from './WailtailLogo';
import { 
  X, 
  Settings, 
  Calendar, 
  DollarSign, 
  Users, 
  ShieldCheck, 
  Flame, 
  Trophy, 
  Mail, 
  Phone, 
  CheckCircle, 
  AlertTriangle, 
  History, 
  Save, 
  Clock, 
  Image as ImageIcon, 
  Video, 
  Upload, 
  Plus, 
  Trash2, 
  FileText, 
  Eye, 
  RotateCcw, 
  BookOpen, 
  FolderOpen, 
  UploadCloud, 
  Check, 
  Search, 
  Sparkles, 
  Layers, 
  Sliders, 
  Car, 
  ChevronRight, 
  ChevronLeft,
  ChevronDown,
  FilePlus,
  Ban,
  UserX,
  ExternalLink, 
  Info, 
  ArrowUp, 
  ArrowDown, 
  Play, 
  Film,
  Palette,
  RefreshCw,
  DownloadCloud,
  Copy
} from 'lucide-react';

interface AdminPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  auction: Auction;
  bids: Bid[];
  mediaConfig: MediaConfiguration;
  onUpdateMediaConfig: (newConfig: MediaConfiguration) => Promise<void> | void;
  onOpenWorkspace?: () => void;
  allAuctions?: Auction[];
  onSelectAuction?: (auctionId: string) => void;
}

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  isOpen,
  onClose,
  auction,
  bids,
  mediaConfig,
  onUpdateMediaConfig,
  onOpenWorkspace,
  allAuctions,
  onSelectAuction
}) => {
  // Decoupled Admin Operational Mode (Inventory, Live Bids, Bidders, Winner Settlement, Global Branding, Editor)
  const [mainView, setMainView] = useState<'inventory' | 'bids' | 'bidders' | 'winner' | 'branding' | 'editor' | 'consignments'>('inventory');
  const [bidders, setBidders] = useState<UserProfile[]>([]);
  const [consignments, setConsignments] = useState<ConsignmentApplication[]>([]);
  
  // Inventory Management State
  const [inventory, setInventory] = useState<Auction[]>(allAuctions || [auction]);
  const [inventorySearch, setInventorySearch] = useState<string>('');
  const [inventoryFilter, setInventoryFilter] = useState<'all' | 'live' | 'upcoming' | 'ended'>('all');
  const [confirmDeleteLot, setConfirmDeleteLot] = useState<Auction | null>(null);
  const [deletingListing, setDeletingListing] = useState<boolean>(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [showNewListingModal, setShowNewListingModal] = useState<boolean>(false);
  const [newListingTitle, setNewListingTitle] = useState<string>('');
  const [creatingListing, setCreatingListing] = useState<boolean>(false);

  useEffect(() => {
    setInventory(allAuctions || []);
  }, [allAuctions]);

  useEffect(() => {
    const unsub = subscribeToAllAuctions((list) => {
      setInventory(list || []);
    });
    return () => unsub();
  }, []);
  
  // Section Scroll Anchor Tracker
  const [activeSectionAnchor, setActiveSectionAnchor] = useState('sec-specs');

  // Auction parameters state
  const [reserveAmount, setReserveAmount] = useState(auction.reserveAmount);
  const [minimumIncrement, setMinimumIncrement] = useState(auction.minimumIncrement);
  const [startingBid, setStartingBid] = useState(auction.startingBid);
  const [status, setStatus] = useState(auction.status);

  // Vehicle info state & spec badges
  const [title, setTitle] = useState(auction.title);
  const [subtitle, setSubtitle] = useState(auction.subtitle);
  const [headline, setHeadline] = useState(auction.headline || auction.title);
  const [make, setMake] = useState(auction.make || 'Porsche');
  const [model, setModel] = useState(auction.model || '911 Turbo-Look');
  const [year, setYear] = useState<string | number>(auction.year || '1978');
  const [vin, setVin] = useState(auction.vin);
  const [mileage, setMileage] = useState(auction.mileage);
  const [location, setLocation] = useState(auction.location);
  const [sellerName, setSellerName] = useState(auction.sellerName);
  const [engine, setEngine] = useState(auction.engine || '3.0L Flat-Six CIS');
  const [drivetrain, setDrivetrain] = useState(auction.drivetrain || '5-Speed 915 Manual');
  const [exteriorColor, setExteriorColor] = useState(auction.exteriorColor || 'Guards Red / Whale Tail');
  const [interior, setInterior] = useState(
    auction.interior || 
    mediaConfig.overviewSpecs?.find(s => s.label.toLowerCase().includes('interior'))?.value || 
    'Black Leather / Houndstooth'
  );
  const [titleStatus, setTitleStatus] = useState(auction.titleStatus || 'Clean Registration');
  const [distanceUnit, setDistanceUnit] = useState<'km' | 'mi'>(auction.distanceUnit || 'km');
  const [highlightsBadge, setHighlightsBadge] = useState(auction.highlightsBadge || mediaConfig.highlightsBadge || '1978 911');

  // Helper to recognize standard core vehicle specs synchronized with Section 1
  const isPrimarySpecLabel = (label: string) => {
    const norm = label.trim().toLowerCase();
    return [
      'vin',
      'odometer',
      'mileage',
      'engine',
      'transmission',
      'gearbox',
      'drivetrain',
      'exterior',
      'exterior color',
      'exterior finish',
      'interior',
      'interior color',
      'interior / cabin',
      'title',
      'title status',
      'title & registration status',
      'location',
      'seller',
      'seller name'
    ].includes(norm);
  };

  // Additional custom specs (appended below Section 1 core specs)
  const [customSpecs, setCustomSpecs] = useState<{ label: string; value: string }[]>(() => {
    if (mediaConfig.overviewSpecs && mediaConfig.overviewSpecs.length > 0) {
      return mediaConfig.overviewSpecs.filter(s => !isPrimarySpecLabel(s.label));
    }
    return [];
  });
  const [newOverviewSpecLabel, setNewOverviewSpecLabel] = useState('');
  const [newOverviewSpecValue, setNewOverviewSpecValue] = useState('');

  // Auto-calculated Section 1 primary specifications (mirrored live)
  const primarySpecs = [
    { label: 'VIN', value: vin || '' },
    { 
      label: 'Odometer', 
      value: mileage 
        ? (mileage.includes('km') || mileage.includes('mi') 
            ? mileage 
            : `${mileage} ${distanceUnit === 'mi' ? 'Miles' : 'km'}`)
        : '' 
    },
    { label: 'Engine', value: engine || '' },
    { label: 'Transmission', value: drivetrain || '' },
    { label: 'Exterior Color', value: exteriorColor || '' },
    { label: 'Interior', value: interior || '' },
    { label: 'Title Status', value: titleStatus || '' },
    { label: 'Location', value: location || '' }
  ];

  // Unified full specifications list for public highlights card and Firestore
  const compiledOverviewSpecs = [
    ...primarySpecs.filter(s => s.value.trim() !== ''),
    ...customSpecs.filter(s => s.label.trim() !== '' && s.value.trim() !== '')
  ];

  // Default Video Chapters
  const defaultVideoChapters: VideoChapter[] = [
    {
      id: "vid-1",
      title: "1. Cold Start & 3.0L CIS Idle",
      description: "Cold engine start showing immediate oil pressure rise, smooth CIS idle warm-up, and Dansk exhaust note.",
      videoUrl: "https://www.youtube.com/watch?v=v9qF5yQfW9g",
      duration: "03:45"
    },
    {
      id: "vid-2",
      title: "2. In-Cabin Driving & 915 Shifts",
      description: "Spirited road run demonstrating crisp 1st-through-5th gear shifts, Bilstein damping, and brake firmness.",
      videoUrl: "https://www.youtube.com/watch?v=eXb28X4vFv4",
      duration: "06:12"
    },
    {
      id: "vid-3",
      title: "3. 360° Exterior Walkaround & Gaps",
      description: "Detailed 360-degree exterior walkaround highlighting Whale Tail aerodynamics, paint depth, and panel gaps.",
      videoUrl: "https://www.youtube.com/watch?v=7VvQO2s9K30",
      duration: "04:30"
    },
    {
      id: "vid-4",
      title: "4. Underside & Chassis Lift Inspection",
      description: "Underbody hoist inspection displaying rust-free floor pans, SSI heat exchangers, and leak-free transaxle case.",
      videoUrl: "https://www.youtube.com/watch?v=8A8c_N7jMvY",
      duration: "05:18"
    },
    {
      id: "vid-5",
      title: "5. Acceleration Acoustics & Flybys",
      description: "External drive-by acoustic capture illustrating the mechanical rasp of the air-cooled flat-six under full throttle.",
      videoUrl: "https://www.youtube.com/watch?v=yq4J1vV8v3E",
      duration: "02:50"
    },
    {
      id: "vid-6",
      title: "6. Cabin Switchgear & Sunroof Demo",
      description: "Full demonstration of electric sunroof, VDO gauges, PCCM audio, power windows, and heating controls.",
      videoUrl: "https://www.youtube.com/watch?v=kYjXk8P3i4c",
      duration: "03:15"
    }
  ];

  // Overview & Narrative state
  const [overviewHeading, setOverviewHeading] = useState(mediaConfig.overviewHeading || 'Listing Overview');
  const [overviewParagraphsText, setOverviewParagraphsText] = useState(
    (mediaConfig.overviewParagraphs || []).join('\n\n')
  );
  const [overviewImage, setOverviewImage] = useState<{ url: string; caption?: string; alt?: string }>(
    mediaConfig.overviewImage || { url: '', caption: '', alt: '' }
  );

  // Video title & chapters state
  const [youtubeUrl, setYoutubeUrl] = useState(mediaConfig.youtubePlaylistUrl || 'https://www.youtube.com/playlist?list=PLpQd3UjF6vS1');
  const [videoTitle, setVideoTitle] = useState(mediaConfig.videoTitle || 'Cold Start, Driving Footage & Walkaround');
  const [videoSubtitle, setVideoSubtitle] = useState(mediaConfig.videoSubtitle || 'Complete high-definition video playlist showcasing the air-cooled flat-six acoustics, 915 gearbox operation, and exterior walkaround.');
  const [videoChapters, setVideoChapters] = useState<VideoChapter[]>(
    (mediaConfig.videoChapters && mediaConfig.videoChapters.length > 0) ? mediaConfig.videoChapters : defaultVideoChapters
  );

  // Showcase chapters state
  const [showcaseSections, setShowcaseSections] = useState<ShowcaseSection[]>(mediaConfig.inlineShowcase || []);

  // Media state
  const [heroImages, setHeroImages] = useState<string[]>(mediaConfig.heroImages || []);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>(mediaConfig.fullGallery || []);
  
  // Image picker modal state
  const [pickerTarget, setPickerTarget] = useState<{
    type: 'overview' | 'showcase' | 'hero' | 'gallery';
    showcaseIndex?: number;
  } | null>(null);
  const [pickerSearchTerm, setPickerSearchTerm] = useState('');
  const [pickerFilterCategory, setPickerFilterCategory] = useState<string>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadTarget, setActiveUploadTarget] = useState<{
    type: 'overview' | 'showcase' | 'hero' | 'gallery';
    showcaseIndex?: number;
    category?: GalleryImage['category'];
  } | null>(null);

  // Site Branding & Custom Logo State
  const [siteLogo, setSiteLogo] = useState(mediaConfig.siteLogo || auction.siteLogo || '');
  const [siteName, setSiteName] = useState(mediaConfig.siteName || auction.siteName || 'wailtail');
  const [siteTagline, setSiteTagline] = useState(mediaConfig.siteTagline || auction.siteTagline || 'Single-Car Auctions');

  // YouTube Metadata Fetch state
  const [fetchingMetadataIdx, setFetchingMetadataIdx] = useState<number | null>(null);
  const [metadataFetchSuccess, setMetadataFetchSuccess] = useState<string | null>(null);

  // New image input helper states
  const [newHeroUrl, setNewHeroUrl] = useState('');
  const [newGalleryUrl, setNewGalleryUrl] = useState('');
  const [newGalleryTitle, setNewGalleryTitle] = useState('');
  const [newGalleryCategory, setNewGalleryCategory] = useState<GalleryImage['category']>('exterior');

  // Manual Hero URL Adder
  const handleAddHeroImage = () => {
    const trimmed = newHeroUrl.trim();
    if (!trimmed) {
      setMessage({ type: 'error', text: 'Please enter an image URL before clicking + Add.' });
      return;
    }
    setHeroImages(prev => [...prev, trimmed]);
    setNewHeroUrl('');
    setMessage({ type: 'success', text: 'Added photo to top Hero Carousel!' });
    setTimeout(() => setMessage(null), 3000);
  };

  // Hero Carousel Drag-and-Drop & Positional Controls
  const handleMoveHero = (index: number, direction: 'left' | 'right') => {
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= heroImages.length) return;
    const copy = [...heroImages];
    const [item] = copy.splice(index, 1);
    copy.splice(targetIndex, 0, item);
    setHeroImages(copy);
  };

  const handleHeroDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleHeroDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const sourceIndexStr = e.dataTransfer.getData('text/plain');
    if (!sourceIndexStr) return;
    const sourceIndex = parseInt(sourceIndexStr, 10);
    if (isNaN(sourceIndex) || sourceIndex === targetIndex) return;
    const copy = [...heroImages];
    const [item] = copy.splice(sourceIndex, 1);
    copy.splice(targetIndex, 0, item);
    setHeroImages(copy);
  };

  // Standardized + New Listing creation handler
  const handleCreateNewListingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = newListingTitle.trim();
    if (!cleanTitle) return;

    setCreatingListing(true);
    try {
      const newLot = await createNewListing(cleanTitle);
      // Optimistic state hydration for 0-lot baseline
      setInventory(prev => [...prev, newLot]);
      setMessage({
        type: 'success',
        text: `Created new vehicle lot: "${newLot.title}". Initialized with clean specs and Canadian CAD financials.`
      });
      setShowNewListingModal(false);
      setNewListingTitle('');
      if (onSelectAuction) {
        onSelectAuction(newLot.id);
      }
      setTimeout(() => setMessage(null), 5000);
    } catch (err: any) {
      console.error('Error creating listing:', err);
      setMessage({ type: 'error', text: `Failed to create listing: ${err.message || 'Unknown error'}` });
    } finally {
      setCreatingListing(false);
    }
  };

  // Duplicate Listing handler
  const handleDuplicate = async (lotId: string) => {
    setDuplicatingId(lotId);
    try {
      const duplicated = await duplicateListing(lotId);
      setMessage({
        type: 'success',
        text: `Listing duplicated successfully as draft: "${duplicated.title}"`
      });
      setTimeout(() => setMessage(null), 5000);
    } catch (err: any) {
      console.error('Error duplicating listing:', err);
      setMessage({ type: 'error', text: `Failed to duplicate listing: ${err.message || 'Unknown error'}` });
    } finally {
      setDuplicatingId(null);
    }
  };

  // Delete Listing handler
  const handleDeleteListingSubmit = async () => {
    if (!confirmDeleteLot) return;
    setDeletingListing(true);
    try {
      await deleteListing(confirmDeleteLot.id);
      setMessage({
        type: 'success',
        text: `Vehicle lot "${confirmDeleteLot.title}" has been permanently removed.`
      });
      setConfirmDeleteLot(null);
      setTimeout(() => setMessage(null), 5000);
    } catch (err: any) {
      console.error('Error deleting listing:', err);
      setMessage({ type: 'error', text: `Failed to delete listing: ${err.message || 'Unknown error'}` });
    } finally {
      setDeletingListing(false);
    }
  };

  // Manual Gallery Item Adder
  const handleAddGalleryImage = () => {
    const trimmedUrl = newGalleryUrl.trim();
    if (!trimmedUrl) {
      setMessage({ type: 'error', text: 'Please enter a photo URL before clicking + Add.' });
      return;
    }
    const newImg: GalleryImage = {
      id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      url: trimmedUrl,
      title: newGalleryTitle.trim() || 'Porsche 911 Detail',
      caption: newGalleryTitle.trim(),
      category: newGalleryCategory
    };
    setGalleryImages(prev => [...prev, newImg]);
    setNewGalleryUrl('');
    setNewGalleryTitle('');
    setMessage({ type: 'success', text: `Added photo to ${newGalleryCategory.toUpperCase()} gallery!` });
    setTimeout(() => setMessage(null), 3000);
  };

  // Inline Category Updater for Existing Gallery Photos
  const handleUpdateGalleryCategory = (index: number, newCategory: GalleryImage['category']) => {
    setGalleryImages(prev => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], category: newCategory };
      }
      return updated;
    });
    setMessage({ type: 'success', text: `Updated photo category to ${newCategory.toUpperCase()}` });
    setTimeout(() => setMessage(null), 2500);
  };

  // Format for datetime-local
  const formatForInput = (timestamp: number) => {
    const d = new Date(timestamp);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };

  const [startTimeInput, setStartTimeInput] = useState(formatForInput(auction.startTime));
  const [endTimeInput, setEndTimeInput] = useState(formatForInput(auction.endTime));
  const [saving, setSaving] = useState(false);
  const [clearingBids, setClearingBids] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Sync state if auction or media changes
  useEffect(() => {
    setReserveAmount(auction.reserveAmount);
    setMinimumIncrement(auction.minimumIncrement);
    setStartingBid(auction.startingBid);
    setStatus(auction.status);
    setTitle(auction.title);
    setSubtitle(auction.subtitle);
    setHeadline(auction.headline || auction.title);
    setMake(auction.make || 'Porsche');
    setModel(auction.model || '911 Turbo-Look');
    setYear(auction.year || '1978');
    setVin(auction.vin);
    setMileage(auction.mileage);
    setLocation(auction.location);
    setSellerName(auction.sellerName);
    setEngine(auction.engine || '3.0L Flat-Six CIS');
    setDrivetrain(auction.drivetrain || '5-Speed 915 Manual');
    setExteriorColor(auction.exteriorColor || 'Guards Red / Whale Tail');
    if (auction.interior) setInterior(auction.interior);
    setTitleStatus(auction.titleStatus || 'Clean Registration');
    setStartTimeInput(formatForInput(auction.startTime));
    setEndTimeInput(formatForInput(auction.endTime));
    if (auction.siteLogo) setSiteLogo(auction.siteLogo);
    if (auction.siteName) setSiteName(auction.siteName);
    if (auction.siteTagline) setSiteTagline(auction.siteTagline);
  }, [auction]);

  useEffect(() => {
    setYoutubeUrl(mediaConfig.youtubePlaylistUrl || '');
    setHeroImages(mediaConfig.heroImages || []);
    setGalleryImages(mediaConfig.fullGallery || []);
    setOverviewHeading(mediaConfig.overviewHeading || 'Listing Overview');
    setOverviewParagraphsText((mediaConfig.overviewParagraphs || []).join('\n\n'));
    setOverviewImage(mediaConfig.overviewImage || { url: '', caption: '', alt: '' });
    if (mediaConfig.overviewSpecs && mediaConfig.overviewSpecs.length > 0) {
      setCustomSpecs(mediaConfig.overviewSpecs.filter(s => !isPrimarySpecLabel(s.label)));
      if (!auction.interior) {
        const intSpec = mediaConfig.overviewSpecs.find(s => s.label.toLowerCase().includes('interior'));
        if (intSpec) setInterior(intSpec.value);
      }
    }
    setVideoTitle(mediaConfig.videoTitle || 'Cold Start, Driving Footage & Walkaround');
    setVideoSubtitle(mediaConfig.videoSubtitle || 'Complete high-definition video playlist showcasing the air-cooled flat-six acoustics, 915 gearbox operation, and exterior walkaround.');
    if (mediaConfig.videoChapters && mediaConfig.videoChapters.length > 0) {
      setVideoChapters(mediaConfig.videoChapters);
    }
    setShowcaseSections(mediaConfig.inlineShowcase || []);
    if (mediaConfig.siteLogo !== undefined) setSiteLogo(mediaConfig.siteLogo);
    if (mediaConfig.siteName) setSiteName(mediaConfig.siteName);
    if (mediaConfig.siteTagline) setSiteTagline(mediaConfig.siteTagline);
  }, [mediaConfig]);

  // Subscribe to all registered bidders
  useEffect(() => {
    if (!isOpen) return;
    const unsub = subscribeToAllBidders((data) => {
      setBidders(data);
    });
    return () => unsub();
  }, [isOpen]);

  // Subscribe to consignment applications
  useEffect(() => {
    if (!isOpen) return;
    const unsub = subscribeToConsignments((data) => {
      setConsignments(data);
    });
    return () => unsub();
  }, [isOpen]);

  // Dynamic YouTube Metadata Auto-Fetch Handler
  const handleFetchChapterMetadata = async (index: number) => {
    const targetChapter = videoChapters[index];
    if (!targetChapter || !targetChapter.videoUrl || !targetChapter.videoUrl.trim()) {
      setMessage({
        type: 'error',
        text: 'Please paste a valid YouTube video URL or 11-character video ID first.'
      });
      return;
    }

    setFetchingMetadataIdx(index);
    try {
      const meta = await fetchYouTubeMetadata(targetChapter.videoUrl);
      // Deep clone array of objects to guarantee isolation across video items
      const copy = videoChapters.map(c => ({ ...c }));
      
      // Auto-populate title if empty or placeholder
      if (
        !copy[index].title || 
        copy[index].title.trim() === '' || 
        copy[index].title.includes('New Driving Video') ||
        copy[index].title.includes(`Video #${index + 1}`)
      ) {
        copy[index].title = `${index + 1}. ${meta.title}`;
      } else {
        copy[index].title = `${index + 1}. ${meta.title}`;
      }

      // Auto-populate thumbnail URL
      if (meta.thumbnailUrl) {
        copy[index].thumbnailUrl = meta.thumbnailUrl;
      }

      // Auto-populate parsed duration strictly isolated
      if (meta.duration && (meta.isExactDuration || !copy[index].duration || copy[index].duration === '00:00' || copy[index].duration === '')) {
        copy[index].duration = meta.duration;
      }

      // Auto-populate description
      if (meta.description) {
        copy[index].description = meta.description;
      }

      setVideoChapters(copy);
      setMetadataFetchSuccess(`Successfully fetched: "${meta.title}" (${copy[index].duration || 'HD'})`);
      setTimeout(() => setMetadataFetchSuccess(null), 4500);
    } catch (err: any) {
      console.error('Error fetching YouTube metadata:', err);
      setMessage({
        type: 'error',
        text: err.message || 'Failed to auto-fetch metadata from YouTube.'
      });
    } finally {
      setFetchingMetadataIdx(null);
    }
  };

  // Bulk Auto-Fetch all chapter metadata strictly isolated per index
  const handleFetchAllChapters = async () => {
    const chaptersWithUrls = videoChapters.map((c, i) => ({ ...c, originalIndex: i })).filter(c => c.videoUrl && c.videoUrl.trim());
    if (chaptersWithUrls.length === 0) {
      setMessage({ type: 'error', text: 'No video URLs entered to fetch metadata for.' });
      return;
    }

    setFetchingMetadataIdx(-1);
    let successCount = 0;
    // Deep clone array of chapter objects
    const copy = videoChapters.map(c => ({ ...c }));

    for (const item of chaptersWithUrls) {
      try {
        const meta = await fetchYouTubeMetadata(item.videoUrl);
        const idx = item.originalIndex;
        if (meta.title) {
          copy[idx].title = `${idx + 1}. ${meta.title}`;
        }
        if (meta.thumbnailUrl) {
          copy[idx].thumbnailUrl = meta.thumbnailUrl;
        }
        if (meta.duration && (meta.isExactDuration || !copy[idx].duration || copy[idx].duration === '00:00' || copy[idx].duration === '')) {
          copy[idx].duration = meta.duration;
        }
        if (meta.description) {
          copy[idx].description = meta.description;
        }
        successCount++;
      } catch (err) {
        console.warn(`Could not fetch metadata for video #${item.originalIndex + 1}:`, err);
      }
    }

    setVideoChapters(copy);
    setFetchingMetadataIdx(null);
    setMetadataFetchSuccess(`Auto-fetched metadata for ${successCount} of ${chaptersWithUrls.length} videos!`);
    setTimeout(() => setMetadataFetchSuccess(null), 5000);
  };

  // Direct Logo File Upload Handler
  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Please select a valid image file (PNG, SVG, JPG, WebP).' });
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const rawResult = reader.result as string;
      const compressed = await compressImageDataUrl(rawResult);
      const result = await uploadImageToStorage(auction.id, compressed, 'branding');
      setSiteLogo(result);
      setMessage({
        type: 'success',
        text: 'Custom logo loaded! Click "Save All Changes" below to persist.'
      });
      setTimeout(() => setMessage(null), 4000);
    };
    reader.readAsDataURL(file);
  };

  if (!isOpen) return null;

  // UNIFIED MASTER SAVE: Saves all vehicle specs, listing narrative, media config, and auction rules atomically
  const handleSaveAll = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const targetAuctionId = auction.id?.trim() || MAIN_AUCTION_ID;
      const startMs = new Date(startTimeInput).getTime() || auction.startTime;
      const endMs = new Date(endTimeInput).getTime() || auction.endTime;
      const isReserveMet = auction.currentBid >= Number(reserveAmount);

      // 1. Update Auction Parameters in Firestore
      await updateAuctionConfig(targetAuctionId, {
        title,
        subtitle,
        headline,
        siteLogo,
        siteName,
        siteTagline,
        highlightsBadge,
        distanceUnit,
        make,
        model,
        year,
        vin,
        mileage,
        location,
        sellerName,
        engine,
        drivetrain,
        exteriorColor,
        interior,
        titleStatus,
        currency: 'CAD',
        reserveAmount: Number(reserveAmount),
        minimumIncrement: Number(minimumIncrement),
        startingBid: Number(startingBid),
        status,
        startTime: startMs,
        endTime: endMs,
        isReserveMet
      });

      // 2. Prepare Media Configuration
      const paragraphs = overviewParagraphsText
        .split('\n\n')
        .map(p => p.trim())
        .filter(Boolean);

      const updatedMedia: MediaConfiguration = {
        ...mediaConfig,
        siteLogo,
        siteName,
        siteTagline,
        highlightsBadge,
        distanceUnit,
        vehicleName: title,
        overviewHeading,
        overviewParagraphs: paragraphs,
        overviewImage: overviewImage.url ? overviewImage : undefined,
        overviewSpecs: compiledOverviewSpecs,
        videoTitle,
        videoSubtitle,
        videoChapters,
        inlineShowcase: showcaseSections,
        youtubePlaylistUrl: youtubeUrl,
        heroImages,
        fullGallery: galleryImages
      };

      // 3. Save Media Configuration to Firestore & local state
      await onUpdateMediaConfig(updatedMedia);

      setMessage({
        type: 'success',
        text: 'All listing specifications, narrative chapters, photos, and CAD auction parameters saved successfully!'
      });
      setTimeout(() => setMessage(null), 5000);
    } catch (err: any) {
      console.error('Error saving listing:', err);
      setMessage({
        type: 'error',
        text: err.message || 'Failed to save changes. Your changes are retained in the editor.'
      });
    } finally {
      setSaving(false);
    }
  };

  // Local File Upload Handler
  const triggerFileUpload = (target: {
    type: 'overview' | 'showcase' | 'hero' | 'gallery';
    showcaseIndex?: number;
    category?: GalleryImage['category'];
  }) => {
    setActiveUploadTarget(target);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0 || !activeUploadTarget) return;

    const files: File[] = Array.from(fileList);
    const validFiles: File[] = [];
    const oversizedFiles: string[] = [];

    for (const f of files) {
      if (f.size > 12 * 1024 * 1024) {
        oversizedFiles.push(f.name);
      } else {
        validFiles.push(f);
      }
    }

    if (oversizedFiles.length > 0) {
      setMessage({
        type: 'error',
        text: `${oversizedFiles.length} file(s) exceeded 12MB limit: ${oversizedFiles.slice(0, 2).join(', ')}...`
      });
      if (validFiles.length === 0) return;
    }

    // Read all valid files concurrently in batch
    try {
      const readResults = await Promise.all(
        validFiles.map(file => {
          return new Promise<{ dataUrl: string; name: string; cleanedName: string }>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (event) => {
              const rawDataUrl = event.target?.result as string;
              if (rawDataUrl) {
                const compressed = await compressImageDataUrl(rawDataUrl);
                const dataUrl = await uploadImageToStorage(auction.id, compressed, activeUploadTarget?.type || 'gallery');
                const cleanedName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
                resolve({ dataUrl, name: file.name, cleanedName });
              } else {
                reject(new Error('Failed to read image data'));
              }
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          });
        })
      );

      if (readResults.length === 0) return;

      if (activeUploadTarget.type === 'overview') {
        const first = readResults[0];
        setOverviewImage({
          url: first.dataUrl,
          caption: first.cleanedName,
          alt: first.cleanedName
        });
      } else if (activeUploadTarget.type === 'showcase' && activeUploadTarget.showcaseIndex !== undefined) {
        const idx = activeUploadTarget.showcaseIndex;
        const newSecs = [...showcaseSections];
        const prevImages = newSecs[idx].images || [];
        const newImgs = readResults.map(r => ({
          url: r.dataUrl,
          caption: r.cleanedName,
          alt: newSecs[idx].title
        }));
        newSecs[idx] = {
          ...newSecs[idx],
          images: [...prevImages, ...newImgs]
        };
        setShowcaseSections(newSecs);
      } else if (activeUploadTarget.type === 'hero') {
        const urls = readResults.map(r => r.dataUrl);
        setHeroImages(prev => [...prev, ...urls]);
      } else if (activeUploadTarget.type === 'gallery') {
        const cat = activeUploadTarget.category || newGalleryCategory || 'exterior';
        const newItems: GalleryImage[] = readResults.map((r, i) => {
          const isPdf = r.name.toLowerCase().endsWith('.pdf') || r.dataUrl.startsWith('data:application/pdf');
          return {
            id: `img-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 4)}`,
            url: r.dataUrl,
            title: r.cleanedName || (isPdf ? 'Vehicle Inspection Report' : 'Vehicle Photo'),
            caption: isPdf ? 'Inspection Report / Document' : r.cleanedName,
            category: isPdf ? 'documentation' : cat,
            isPdf
          };
        });
        setGalleryImages(prev => [...prev, ...newItems]);
      }

      setMessage({
        type: 'success',
        text: `Successfully uploaded ${readResults.length} photo(s)! Click "Save All Changes" to persist.`
      });
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      console.error('Batch file read error:', err);
      setMessage({ type: 'error', text: 'Error processing some uploaded files. Please try again.' });
    }
  };

  // Select Photo from Existing Gallery
  const handleSelectFromGallery = (selectedUrl: string) => {
    if (!pickerTarget) return;

    const matchedGalleryItem = galleryImages.find(img => img.url === selectedUrl);
    const caption = matchedGalleryItem?.caption || matchedGalleryItem?.title || '';

    if (pickerTarget.type === 'overview') {
      setOverviewImage({
        url: selectedUrl,
        caption: caption || overviewImage.caption,
        alt: matchedGalleryItem?.title || 'Listing Overview'
      });
    } else if (pickerTarget.type === 'showcase' && pickerTarget.showcaseIndex !== undefined) {
      const idx = pickerTarget.showcaseIndex;
      const newSecs = [...showcaseSections];
      const prevImages = newSecs[idx].images || [];
      newSecs[idx] = {
        ...newSecs[idx],
        images: [
          {
            url: selectedUrl,
            caption: caption || prevImages[0]?.caption || newSecs[idx].title,
            alt: matchedGalleryItem?.title || newSecs[idx].title
          },
          ...prevImages.slice(1)
        ]
      };
      setShowcaseSections(newSecs);
    } else if (pickerTarget.type === 'hero') {
      setHeroImages(prev => [...prev, selectedUrl]);
    } else if (pickerTarget.type === 'gallery') {
      const newImg: GalleryImage = {
        id: `img-${Date.now()}`,
        url: selectedUrl,
        title: caption || 'Porsche 911 Detail',
        caption: caption,
        category: 'exterior'
      };
      setGalleryImages(prev => [...prev, newImg]);
    }
    setPickerTarget(null);
  };

  // Reorder Custom Spec Items Helper
  const handleMoveCustomSpec = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= customSpecs.length) return;
    const copy = [...customSpecs];
    const [item] = copy.splice(index, 1);
    copy.splice(targetIndex, 0, item);
    setCustomSpecs(copy);
  };

  // Reorder Video Chapters Helper
  const handleMoveVideoChapter = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= videoChapters.length) return;
    const copy = [...videoChapters];
    const [item] = copy.splice(index, 1);
    copy.splice(targetIndex, 0, item);
    setVideoChapters(copy);
  };

  // Scroll to section in unified form
  const scrollToAnchor = (id: string) => {
    setActiveSectionAnchor(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Clear all bids helper
  const handleClearAllBids = async () => {
    setClearingBids(true);
    try {
      await clearAllBidsAndReset(auction.id, startingBid);
      setShowClearConfirm(false);
      setMessage({ type: 'success', text: 'All bids have been cleared and auction reset to starting bid ($CAD)!' });
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to clear bids.' });
    } finally {
      setClearingBids(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      {/* Hidden File Input for Image Uploads with Multi-File (Batch) Support */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelected}
        accept="image/png, image/jpeg, image/webp, image/gif, application/pdf"
        multiple
        className="hidden"
      />

      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-6xl max-h-[94vh] bg-[#f8f9fa] rounded-2xl shadow-2xl border border-zinc-300 flex flex-col overflow-hidden text-zinc-900"
      >
        {/* Modal Top Header Bar */}
        <div className="bg-[#121619] text-white px-6 py-4 flex items-center justify-between border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-700 flex items-center justify-center font-bold text-white shadow-inner">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
                  Owner & Listing Control Center
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-950 text-red-300 border border-red-800">
                  Admin (CAD)
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Unified Bring-a-Trailer style listing editor, CAD financials, and bidder controls
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowNewListingModal(true)}
              className="px-3 py-2 rounded-lg font-bold text-xs bg-emerald-950/90 hover:bg-emerald-900 text-emerald-300 hover:text-white border border-emerald-800/80 flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
              title="Create a new vehicle listing lot"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">+ New Listing</span>
              <span className="sm:hidden">+ New</span>
            </button>

            <button
              onClick={handleSaveAll}
              disabled={saving}
              className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-md transition-all ${
                saving 
                  ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed' 
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white hover:scale-105 active:scale-95 cursor-pointer'
              }`}
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save All Changes'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Global Feedback Banner */}
        {message && (
          <div className={`px-6 py-2.5 text-xs font-semibold flex items-center justify-between border-b ${
            message.type === 'success' 
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
              : 'bg-red-50 text-red-800 border-red-200'
          }`}>
            <div className="flex items-center gap-2">
              {message.type === 'success' ? (
                <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
              )}
              <span>{message.text}</span>
            </div>
            <button 
              onClick={() => setMessage(null)}
              className="text-zinc-400 hover:text-zinc-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* View Switcher Tabs */}
        <div className="bg-white border-b border-zinc-200 px-6 py-2 flex items-center justify-between flex-shrink-0 gap-3">
          <div className="flex items-center gap-2 overflow-x-auto">
            <button
              onClick={() => setMainView('inventory')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                mainView === 'inventory'
                  ? 'bg-zinc-900 text-white shadow-sm'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              <Car className="w-4 h-4 text-emerald-500" />
              <span>All Vehicle Listings ({inventory.length})</span>
            </button>

            <button
              onClick={() => setMainView('bids')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                mainView === 'bids'
                  ? 'bg-zinc-900 text-white shadow-sm'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              <History className="w-4 h-4" />
              <span>Live Bids Log ({bids.length})</span>
            </button>

            <button
              onClick={() => setMainView('bidders')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                mainView === 'bidders'
                  ? 'bg-zinc-900 text-white shadow-sm'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Bidder Registry ({bidders.length})</span>
            </button>

            <button
              onClick={() => setMainView('winner')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                mainView === 'winner'
                  ? 'bg-zinc-900 text-white shadow-sm'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              <Trophy className="w-4 h-4" />
              <span>Winner & Settlement</span>
            </button>

            <button
              onClick={() => setMainView('consignments')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                mainView === 'consignments'
                  ? 'bg-zinc-900 text-white shadow-sm'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              <FileText className="w-4 h-4 text-emerald-400" />
              <span>Consignment Requests ({consignments.length})</span>
            </button>

            <button
              onClick={() => setMainView('branding')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                mainView === 'branding'
                  ? 'bg-zinc-900 text-white shadow-sm'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              <Palette className="w-4 h-4 text-purple-400" />
              <span>Site Branding & Global Settings</span>
            </button>
          </div>

          {onOpenWorkspace && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenWorkspace();
              }}
              className="px-3.5 py-2 rounded-lg text-xs font-bold bg-red-700 hover:bg-red-600 text-white flex items-center gap-1.5 transition-all shadow-sm cursor-pointer whitespace-nowrap flex-shrink-0"
              title="Open Full-Page Vehicle Listing Editor with Split-Screen Live Preview"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open Listing Editor →</span>
            </button>
          )}
        </div>

        {/* Sub-Header Anchor Navigation (Editor Mode Only) */}
        {mainView === 'editor' && (
          <div className="bg-zinc-100/90 border-b border-zinc-200 px-6 py-2 flex items-center gap-2 overflow-x-auto text-[11px] font-semibold text-zinc-600 flex-shrink-0">
            <span className="text-zinc-400 uppercase tracking-wider text-[10px] font-bold mr-1">Quick Jump:</span>
            <button 
              type="button"
              onClick={() => scrollToAnchor('sec-specs')}
              className="px-2.5 py-1 rounded bg-white hover:bg-zinc-200 text-zinc-800 border border-zinc-200 flex items-center gap-1"
            >
              <Car className="w-3 h-3 text-red-700" />
              <span>1. Vehicle Specs</span>
            </button>
            <button 
              type="button"
              onClick={() => scrollToAnchor('sec-narrative')}
              className="px-2.5 py-1 rounded bg-white hover:bg-zinc-200 text-zinc-800 border border-zinc-200 flex items-center gap-1"
            >
              <FileText className="w-3 h-3 text-red-700" />
              <span>2. Narrative</span>
            </button>
            <button 
              type="button"
              onClick={() => scrollToAnchor('sec-highlights')}
              className="px-2.5 py-1 rounded bg-white hover:bg-zinc-200 text-zinc-800 border border-zinc-200 flex items-center gap-1"
            >
              <Sliders className="w-3 h-3 text-red-700" />
              <span>3. Specs Table ({compiledOverviewSpecs.length})</span>
            </button>
            <button 
              type="button"
              onClick={() => scrollToAnchor('sec-showcase')}
              className="px-2.5 py-1 rounded bg-white hover:bg-zinc-200 text-zinc-800 border border-zinc-200 flex items-center gap-1"
            >
              <BookOpen className="w-3 h-3 text-red-700" />
              <span>4. Showcase ({showcaseSections.length})</span>
            </button>
            <button 
              type="button"
              onClick={() => scrollToAnchor('sec-gallery')}
              className="px-2.5 py-1 rounded bg-white hover:bg-zinc-200 text-zinc-800 border border-zinc-200 flex items-center gap-1"
            >
              <ImageIcon className="w-3 h-3 text-red-700" />
              <span>5. Media & Gallery</span>
            </button>
            <button 
              type="button"
              onClick={() => scrollToAnchor('sec-videos')}
              className="px-2.5 py-1 rounded bg-white hover:bg-zinc-200 text-zinc-800 border border-zinc-200 flex items-center gap-1"
            >
              <Video className="w-3 h-3 text-red-700" />
              <span>6. Videos & Chapters ({videoChapters.length})</span>
            </button>
            <button 
              type="button"
              onClick={() => scrollToAnchor('sec-financials')}
              className="px-2.5 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 font-bold flex items-center gap-1"
            >
              <DollarSign className="w-3 h-3 text-emerald-700" />
              <span>7. Dates & Financials (CAD)</span>
            </button>
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* VIEW 0: ALL VEHICLE LISTINGS & INVENTORY MANAGEMENT */}
          {mainView === 'inventory' && (
            <div className="space-y-6 max-w-5xl mx-auto pb-12">
              {/* Header Card & Quick Actions */}
              <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200">
                  <div>
                    <div className="flex items-center gap-2">
                      <Car className="w-5 h-5 text-emerald-600" />
                      <h3 className="text-base sm:text-lg font-bold text-zinc-900">
                        Vehicle Inventory Management
                      </h3>
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        {inventory.length} Total Lot{inventory.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">
                      Manage all vehicle auction lots, configure status lifecycles, duplicate drafts, or edit specifications.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowNewListingModal(true)}
                    className="px-4 py-2 rounded-lg font-bold text-xs bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-sm transition-all cursor-pointer self-start sm:self-auto active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ New Vehicle Listing</span>
                  </button>
                </div>

                {/* Metrics Summary Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Total Catalog</span>
                    <span className="text-xl font-black text-zinc-900 font-mono">{inventory.length}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200">
                    <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Live Auctions</span>
                    <span className="text-xl font-black text-emerald-800 font-mono">
                      {inventory.filter(l => l.status === 'live').length}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200">
                    <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block">Upcoming Lots</span>
                    <span className="text-xl font-black text-blue-800 font-mono">
                      {inventory.filter(l => l.status === 'upcoming' || !l.status).length}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-zinc-100 border border-zinc-200">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Completed Lots</span>
                    <span className="text-xl font-black text-zinc-700 font-mono">
                      {inventory.filter(l => l.status === 'ended').length}
                    </span>
                  </div>
                </div>

                {/* Search and Lifecycle Filter Controls */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search lots by title, VIN, make, or model..."
                      value={inventorySearch}
                      onChange={(e) => setInventorySearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-300 text-xs text-zinc-800 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto bg-zinc-100 p-1 rounded-lg border border-zinc-200 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setInventoryFilter('all')}
                      className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                        inventoryFilter === 'all'
                          ? 'bg-white text-zinc-900 shadow-xs font-bold'
                          : 'text-zinc-600 hover:text-zinc-900'
                      }`}
                    >
                      All ({inventory.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setInventoryFilter('live')}
                      className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                        inventoryFilter === 'live'
                          ? 'bg-white text-emerald-800 shadow-xs font-bold'
                          : 'text-zinc-600 hover:text-zinc-900'
                      }`}
                    >
                      Live ({inventory.filter(i => i.status === 'live').length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setInventoryFilter('upcoming')}
                      className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                        inventoryFilter === 'upcoming'
                          ? 'bg-white text-blue-800 shadow-xs font-bold'
                          : 'text-zinc-600 hover:text-zinc-900'
                      }`}
                    >
                      Upcoming ({inventory.filter(i => i.status === 'upcoming' || !i.status).length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setInventoryFilter('ended')}
                      className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                        inventoryFilter === 'ended'
                          ? 'bg-white text-zinc-800 shadow-xs font-bold'
                          : 'text-zinc-600 hover:text-zinc-900'
                      }`}
                    >
                      Ended ({inventory.filter(i => i.status === 'ended').length})
                    </button>
                  </div>
                </div>
              </div>

              {/* Inventory Cards List */}
              <div className="space-y-3">
                {inventory
                  .filter(lot => {
                    if (inventoryFilter === 'live' && lot.status !== 'live') return false;
                    if (inventoryFilter === 'upcoming' && (lot.status && lot.status !== 'upcoming')) return false;
                    if (inventoryFilter === 'ended' && lot.status !== 'ended') return false;
                    if (inventorySearch.trim()) {
                      const q = inventorySearch.toLowerCase();
                      const match =
                        (lot.title || '').toLowerCase().includes(q) ||
                        (lot.vin || '').toLowerCase().includes(q) ||
                        (lot.make || '').toLowerCase().includes(q) ||
                        (lot.model || '').toLowerCase().includes(q) ||
                        (lot.id || '').toLowerCase().includes(q);
                      if (!match) return false;
                    }
                    return true;
                  })
                  .map((lot) => {
                    const isCurrentlyActive = lot.id === auction.id;
                    const statusText = lot.status || 'upcoming';
                    const hasReserve = (lot.reserveAmount || 0) > 0;
                    const isReserveMet = lot.isReserveMet || (lot.currentBid || 0) >= (lot.reserveAmount || 0);

                    return (
                      <div
                        key={lot.id}
                        className={`bg-white rounded-xl border p-5 transition-all shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                          isCurrentlyActive 
                            ? 'border-emerald-500 ring-2 ring-emerald-500/20' 
                            : 'border-zinc-200 hover:border-zinc-300'
                        }`}
                      >
                        {/* Vehicle Summary */}
                        <div className="flex items-start gap-4 min-w-0 flex-1">
                          <div className="w-12 h-12 rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center flex-shrink-0 text-zinc-600">
                            <Car className="w-6 h-6 text-zinc-700" />
                          </div>

                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-sm font-bold text-zinc-900 truncate">
                                {lot.title || 'Untitled Vehicle Lot'}
                              </h4>
                              {isCurrentlyActive && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-900 text-white">
                                  Currently Selected
                                </span>
                              )}
                              {/* Lifecycle Status Badge */}
                              {statusText === 'live' ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  Live Auction
                                </span>
                              ) : statusText === 'ended' ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-zinc-200 text-zinc-700 border border-zinc-300">
                                  Ended
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-300">
                                  Upcoming
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
                              <span>Lot: <strong className="font-mono text-zinc-700">{lot.id}</strong></span>
                              {lot.vin && <span>VIN: <strong className="font-mono text-zinc-700">{lot.vin}</strong></span>}
                              {lot.year && lot.make && lot.model && (
                                <span>{lot.year} {lot.make} {lot.model}</span>
                              )}
                              {lot.location && <span>{lot.location}</span>}
                            </div>
                          </div>
                        </div>

                        {/* Financial Snapshot */}
                        <div className="flex items-center gap-6 self-stretch md:self-auto justify-between md:justify-end border-t md:border-t-0 pt-3 md:pt-0 border-zinc-100">
                          <div className="text-left md:text-right space-y-0.5">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                              {statusText === 'live' ? 'Current Bid' : 'Starting Bid'}
                            </span>
                            <span className="text-base font-extrabold font-mono text-zinc-900 block">
                              {formatCurrency(lot.currentBid || lot.startingBid || 1000)} CAD
                            </span>
                            <span className={`text-[10px] font-bold block ${
                              !hasReserve
                                ? 'text-purple-600'
                                : isReserveMet
                                  ? 'text-emerald-600'
                                  : 'text-amber-600'
                            }`}>
                              {!hasReserve ? 'No Reserve' : isReserveMet ? '✓ Reserve Met' : 'Reserve Not Met'}
                            </span>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                if (onSelectAuction) onSelectAuction(lot.id);
                                if (onOpenWorkspace) {
                                  onClose();
                                  onOpenWorkspace();
                                }
                              }}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-zinc-900 hover:bg-zinc-800 text-white flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                              title="Edit listing details in full-page workspace"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDuplicate(lot.id)}
                              disabled={duplicatingId === lot.id}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-300 flex items-center gap-1 transition-all cursor-pointer"
                              title="Duplicate as new draft listing"
                            >
                              <Copy className="w-3.5 h-3.5 text-blue-600" />
                              <span className="hidden sm:inline">{duplicatingId === lot.id ? '...' : 'Duplicate'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setConfirmDeleteLot(lot)}
                              className="p-1.5 rounded-lg text-xs font-semibold text-zinc-400 hover:text-red-700 hover:bg-red-50 border border-transparent hover:border-red-200 transition-all cursor-pointer"
                              title="Delete vehicle listing lot"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                if (onSelectAuction) onSelectAuction(lot.id);
                                onClose();
                              }}
                              className="p-1.5 rounded-lg text-xs font-semibold text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 border border-zinc-200 transition-all cursor-pointer"
                              title="Set as active public view"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* VIEW 1: UNIFIED LISTING & MEDIA EDITOR */}
          {mainView === 'editor' && (
            <div className="space-y-8 max-w-5xl mx-auto pb-12">
              {/* 1. Primary Vehicle Identity & Badges */}
              <section id="sec-specs" className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
                  <div className="flex items-center gap-2">
                    <Car className="w-5 h-5 text-red-700" />
                    <h3 className="text-base font-bold text-zinc-900">1. Vehicle Identity & Header Specs</h3>
                  </div>
                  <span className="text-xs text-zinc-500">Live auction headline, VIN, and registration</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                  <div className="sm:col-span-2 md:col-span-3">
                    <label className="block font-bold text-zinc-800 uppercase tracking-wider mb-1">
                      Main Listing Title
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full p-2.5 rounded-lg border border-zinc-300 font-serif font-bold text-base text-zinc-900 focus:ring-2 focus:ring-red-600 focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2 md:col-span-3">
                    <label className="block font-bold text-zinc-800 uppercase tracking-wider mb-1">
                      Subtitle / One-Line Teaser
                    </label>
                    <input
                      type="text"
                      value={subtitle}
                      onChange={(e) => setSubtitle(e.target.value)}
                      className="w-full p-2 rounded-lg border border-zinc-300 text-zinc-800 focus:ring-2 focus:ring-red-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-zinc-700 mb-1">Year</label>
                    <input
                      type="text"
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      className="w-full p-2 rounded-lg border border-zinc-300 text-zinc-900"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-zinc-700 mb-1">Make</label>
                    <input
                      type="text"
                      value={make}
                      onChange={(e) => setMake(e.target.value)}
                      className="w-full p-2 rounded-lg border border-zinc-300 text-zinc-900"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-zinc-700 mb-1">Model & Spec</label>
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="w-full p-2 rounded-lg border border-zinc-300 text-zinc-900"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-zinc-700 mb-1">VIN</label>
                    <input
                      type="text"
                      value={vin}
                      onChange={(e) => setVin(e.target.value)}
                      className="w-full p-2 rounded-lg border border-zinc-300 font-mono text-zinc-900"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block font-bold text-zinc-700">Odometer / Mileage</label>
                      <div className="flex items-center gap-1 bg-zinc-100 p-0.5 rounded-md border border-zinc-200">
                        <button
                          type="button"
                          onClick={() => setDistanceUnit('km')}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-all ${
                            distanceUnit === 'km' ? 'bg-zinc-900 text-white shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
                          }`}
                        >
                          km (CAD)
                        </button>
                        <button
                          type="button"
                          onClick={() => setDistanceUnit('mi')}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-all ${
                            distanceUnit === 'mi' ? 'bg-zinc-900 text-white shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
                          }`}
                        >
                          mi
                        </button>
                      </div>
                    </div>
                    <input
                      type="text"
                      value={mileage}
                      onChange={(e) => setMileage(e.target.value)}
                      placeholder="e.g. 126,200"
                      className="w-full p-2 rounded-lg border border-zinc-300 font-mono text-zinc-900"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-zinc-700 mb-1">
                      Vehicle Highlights Badge
                    </label>
                    <input
                      type="text"
                      value={highlightsBadge}
                      onChange={(e) => setHighlightsBadge(e.target.value)}
                      placeholder="e.g. 1978 911"
                      className="w-full p-2 rounded-lg border border-red-200 font-mono text-xs font-bold text-red-700 bg-red-50/50"
                    />
                    <span className="text-[10px] text-zinc-400 mt-0.5 block">
                      Top-right badge on the Vehicle Highlights card
                    </span>
                  </div>

                  <div>
                    <label className="block font-bold text-zinc-700 mb-1">Location</label>
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="w-full p-2 rounded-lg border border-zinc-300 text-zinc-900"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-zinc-700 mb-1">Engine Specification</label>
                    <input
                      type="text"
                      value={engine}
                      onChange={(e) => setEngine(e.target.value)}
                      className="w-full p-2 rounded-lg border border-zinc-300 text-zinc-900"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-zinc-700 mb-1">Drivetrain / Gearbox</label>
                    <input
                      type="text"
                      value={drivetrain}
                      onChange={(e) => setDrivetrain(e.target.value)}
                      className="w-full p-2 rounded-lg border border-zinc-300 text-zinc-900"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-zinc-700 mb-1">Exterior Finish</label>
                    <input
                      type="text"
                      value={exteriorColor}
                      onChange={(e) => setExteriorColor(e.target.value)}
                      className="w-full p-2 rounded-lg border border-zinc-300 text-zinc-900"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-zinc-700 mb-1">Interior / Cabin</label>
                    <input
                      type="text"
                      value={interior}
                      onChange={(e) => setInterior(e.target.value)}
                      placeholder="e.g. Black Leather / Houndstooth"
                      className="w-full p-2 rounded-lg border border-zinc-300 text-zinc-900"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-zinc-700 mb-1">Title & Registration Status</label>
                    <input
                      type="text"
                      value={titleStatus}
                      onChange={(e) => setTitleStatus(e.target.value)}
                      className="w-full p-2 rounded-lg border border-zinc-300 text-zinc-900"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-zinc-700 mb-1">Seller Name / Handle</label>
                    <input
                      type="text"
                      value={sellerName}
                      onChange={(e) => setSellerName(e.target.value)}
                      className="w-full p-2 rounded-lg border border-zinc-300 text-zinc-900"
                    />
                  </div>
                </div>
              </section>

              {/* 2. Listing Overview & Historical Narrative */}
              <section id="sec-narrative" className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-red-700" />
                    <h3 className="text-base font-bold text-zinc-900">2. Listing Overview & Narrative Text</h3>
                  </div>
                  <span className="text-xs text-zinc-500">Rendered in the main Vehicle Overview story card</span>
                </div>

                <div className="space-y-4 text-xs">
                  <div>
                    <label className="block font-bold text-zinc-800 uppercase tracking-wider mb-1">
                      Overview Section Heading
                    </label>
                    <input
                      type="text"
                      value={overviewHeading}
                      onChange={(e) => setOverviewHeading(e.target.value)}
                      className="w-full p-2 rounded-lg border border-zinc-300 font-bold text-zinc-900"
                    />
                  </div>

                  {/* Overview Photo Attachment with Picker + Local Upload */}
                  <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-zinc-800 uppercase tracking-wider">
                        Overview Primary Image
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPickerTarget({ type: 'overview' })}
                          className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-black text-white font-bold flex items-center gap-1.5 transition-all text-xs"
                        >
                          <FolderOpen className="w-3.5 h-3.5 text-zinc-300" />
                          <span>Choose from Gallery</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => triggerFileUpload({ type: 'overview' })}
                          className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white font-bold flex items-center gap-1.5 transition-all text-xs"
                        >
                          <UploadCloud className="w-3.5 h-3.5" />
                          <span>Upload Local Photo</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
                      <div className="sm:col-span-3 space-y-2">
                        <input
                          type="url"
                          placeholder="Image URL (https://... or uploaded data)"
                          value={overviewImage.url}
                          onChange={(e) => setOverviewImage({ ...overviewImage, url: e.target.value })}
                          className="w-full p-2 rounded-lg border border-zinc-300 font-mono text-xs"
                        />
                        <input
                          type="text"
                          placeholder="Image Caption / Description"
                          value={overviewImage.caption || ''}
                          onChange={(e) => setOverviewImage({ ...overviewImage, caption: e.target.value })}
                          className="w-full p-2 rounded-lg border border-zinc-300 text-zinc-700 text-xs"
                        />
                      </div>

                      <div className="h-24 rounded-lg bg-zinc-200 border border-zinc-300 flex items-center justify-center overflow-hidden">
                        {overviewImage.url ? (
                          <img
                            src={overviewImage.url}
                            alt="Overview Preview"
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <span className="text-xs text-zinc-400">No Image</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-zinc-800 uppercase tracking-wider mb-1">
                      Full Listing Narrative (Leave blank line between paragraphs)
                    </label>
                    <textarea
                      rows={6}
                      value={overviewParagraphsText}
                      onChange={(e) => setOverviewParagraphsText(e.target.value)}
                      className="w-full p-3 rounded-lg border border-zinc-300 text-zinc-900 leading-relaxed focus:ring-2 focus:ring-red-600 focus:outline-none"
                    />
                  </div>
                </div>
              </section>

              {/* 3. Technical Specifications Table (Single-Source Mirror from Section 1 + Custom Rows) */}
              <section id="sec-highlights" className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-200 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-red-700" />
                    <h3 className="text-base font-bold text-zinc-900">3. Technical Specifications Table</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">Rendered in the right sidebar "Vehicle Highlights" card</span>
                    {customSpecs.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setCustomSpecs([])}
                        className="px-2.5 py-1 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-semibold flex items-center gap-1 border border-zinc-300 transition-colors"
                        title="Clear custom specifications"
                      >
                        <RotateCcw className="w-3 h-3 text-zinc-500" />
                        <span>Clear Custom Specs</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Informational Sync Banner */}
                <div className="p-3 bg-red-50/60 border border-red-200/80 rounded-xl text-xs flex items-start gap-2.5 text-zinc-700">
                  <Sparkles className="w-4 h-4 text-red-700 flex-shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="font-bold text-zinc-900">Single-Source Spec Synchronization:</span>
                    <p className="text-zinc-600 leading-relaxed">
                      The 8 core vehicle specifications below are automatically synchronized directly from <strong>Section 1 (Vehicle Identity & Header Specs)</strong>. You never need to type them twice. You can append additional custom specifications (e.g., Compression, Wheels, Exhaust) below.
                    </p>
                  </div>
                </div>

                {/* 3.1 Primary Specs Auto-Synced from Section 1 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-zinc-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                      <span>Core Vehicle Identity</span>
                      <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-bold">
                        ⚡ Synced from Section 1
                      </span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => scrollToAnchor('sec-specs')}
                      className="text-[11px] text-red-700 hover:text-red-800 font-semibold hover:underline cursor-pointer"
                    >
                      Edit Core Specs in Sec 1 ↑
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                    {primarySpecs.map((spec, pIdx) => (
                      <div
                        key={pIdx}
                        className="p-2.5 bg-zinc-50/90 border border-zinc-200/80 rounded-lg flex flex-col justify-between space-y-1 hover:border-zinc-300 transition-colors"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-zinc-500">{spec.label}</span>
                          <span className="text-[9px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60">
                            Live
                          </span>
                        </div>
                        <div className="font-bold text-xs text-zinc-900 line-clamp-2">
                          {spec.value || <span className="italic text-zinc-400 font-normal">Not specified</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3.2 Additional Custom Specifications */}
                <div className="space-y-3 pt-3 border-t border-zinc-200">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-zinc-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                      <span>Additional Custom Specifications</span>
                      <span className="px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-700 text-[10px] font-bold">
                        {customSpecs.length} Custom Row{customSpecs.length === 1 ? '' : 's'}
                      </span>
                    </h4>
                    <span className="text-[11px] text-zinc-500">
                      Appended below core specs in right sidebar
                    </span>
                  </div>

                  {customSpecs.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {customSpecs.map((spec, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 p-2 bg-zinc-50 border border-zinc-200 rounded-lg hover:border-zinc-300 transition-colors">
                          <div className="flex flex-col gap-0.5">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => handleMoveCustomSpec(idx, 'up')}
                              className={`p-0.5 rounded text-zinc-400 hover:text-zinc-800 ${idx === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
                              title="Move Up"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === customSpecs.length - 1}
                              onClick={() => handleMoveCustomSpec(idx, 'down')}
                              className={`p-0.5 rounded text-zinc-400 hover:text-zinc-800 ${idx === customSpecs.length - 1 ? 'opacity-30 cursor-not-allowed' : ''}`}
                              title="Move Down"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </div>

                          <input
                            type="text"
                            value={spec.label}
                            onChange={(e) => {
                              const copy = [...customSpecs];
                              copy[idx].label = e.target.value;
                              setCustomSpecs(copy);
                            }}
                            className="w-1/3 p-1.5 font-bold text-zinc-700 border border-zinc-300 rounded bg-white"
                            placeholder="Label (e.g. Compression)"
                          />
                          <input
                            type="text"
                            value={spec.value}
                            onChange={(e) => {
                              const copy = [...customSpecs];
                              copy[idx].value = e.target.value;
                              setCustomSpecs(copy);
                            }}
                            className="flex-1 p-1.5 font-medium text-zinc-900 border border-zinc-300 rounded bg-white"
                            placeholder="Value"
                          />
                          <button
                            type="button"
                            onClick={() => setCustomSpecs(customSpecs.filter((_, i) => i !== idx))}
                            className="p-1.5 text-zinc-400 hover:text-red-700 transition-colors cursor-pointer"
                            title="Remove Spec"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 bg-zinc-50 border border-dashed border-zinc-200 rounded-lg text-center text-xs text-zinc-400">
                      No additional custom specs added yet. Use the fields below to add custom technical specs (e.g., Compression, Differential, Wheels & Tires).
                    </div>
                  )}

                  {/* Add New Custom Specification Row */}
                  <div className="flex items-center gap-2 p-3 bg-zinc-100 rounded-xl border border-dashed border-zinc-300">
                    <input
                      type="text"
                      placeholder="Custom spec label (e.g. Compression, Exhaust)"
                      value={newOverviewSpecLabel}
                      onChange={(e) => setNewOverviewSpecLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newOverviewSpecLabel.trim() && newOverviewSpecValue.trim()) {
                          e.preventDefault();
                          setCustomSpecs(prev => [...prev, { label: newOverviewSpecLabel.trim(), value: newOverviewSpecValue.trim() }]);
                          setNewOverviewSpecLabel('');
                          setNewOverviewSpecValue('');
                        }
                      }}
                      className="w-1/3 p-2 rounded-lg border border-zinc-300 bg-white text-xs text-zinc-900"
                    />
                    <input
                      type="text"
                      placeholder="Spec value (e.g. 145-150 psi across all 6 cylinders)"
                      value={newOverviewSpecValue}
                      onChange={(e) => setNewOverviewSpecValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newOverviewSpecLabel.trim() && newOverviewSpecValue.trim()) {
                          e.preventDefault();
                          setCustomSpecs(prev => [...prev, { label: newOverviewSpecLabel.trim(), value: newOverviewSpecValue.trim() }]);
                          setNewOverviewSpecLabel('');
                          setNewOverviewSpecValue('');
                        }
                      }}
                      className="flex-1 p-2 rounded-lg border border-zinc-300 bg-white text-xs text-zinc-900"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (newOverviewSpecLabel.trim() && newOverviewSpecValue.trim()) {
                          setCustomSpecs(prev => [...prev, { label: newOverviewSpecLabel.trim(), value: newOverviewSpecValue.trim() }]);
                          setNewOverviewSpecLabel('');
                          setNewOverviewSpecValue('');
                        }
                      }}
                      className="px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-black text-white font-bold flex items-center gap-1 shadow-sm text-xs cursor-pointer active:scale-95 transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      <span>+ Add Spec</span>
                    </button>
                  </div>
                </div>
              </section>

              {/* 4. Showcase Chapters (01-04) */}
              <section id="sec-showcase" className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-red-700" />
                    <h3 className="text-base font-bold text-zinc-900">4. Showcase Chapters (01-04 Deep-Dive)</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const newChapter: ShowcaseSection = {
                        id: `chapter-${Date.now()}`,
                        title: `Chapter 0${showcaseSections.length + 1}: Custom Section`,
                        tagline: 'Key highlights and historical documentation.',
                        paragraphs: ['Detailed paragraph describing this section of the vehicle.'],
                        images: [
                          {
                            url: heroImages[0] || '',
                            caption: 'Chapter illustration',
                            alt: 'Showcase Image'
                          }
                        ]
                      };
                      setShowcaseSections([...showcaseSections, newChapter]);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-black text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add New Chapter</span>
                  </button>
                </div>

                <div className="space-y-6">
                  {showcaseSections.map((chapter, cIdx) => (
                    <div key={chapter.id || cIdx} className="p-5 rounded-xl border border-zinc-200 bg-zinc-50/70 space-y-4 text-xs">
                      <div className="flex items-center justify-between border-b border-zinc-200 pb-2.5">
                        <span className="font-bold text-red-700 uppercase tracking-widest text-[11px]">
                          Chapter 0{cIdx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowcaseSections(showcaseSections.filter((_, i) => i !== cIdx))}
                          className="text-xs text-red-600 hover:text-red-800 flex items-center gap-1 font-semibold"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove Chapter</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block font-bold text-zinc-800 mb-1">Chapter Title</label>
                          <input
                            type="text"
                            value={chapter.title}
                            onChange={(e) => {
                              const copy = [...showcaseSections];
                              copy[cIdx].title = e.target.value;
                              setShowcaseSections(copy);
                            }}
                            className="w-full p-2 rounded-lg border border-zinc-300 font-bold text-zinc-900 bg-white"
                          />
                        </div>

                        <div>
                          <label className="block font-bold text-zinc-800 mb-1">Tagline / Subheading</label>
                          <input
                            type="text"
                            value={chapter.tagline}
                            onChange={(e) => {
                              const copy = [...showcaseSections];
                              copy[cIdx].tagline = e.target.value;
                              setShowcaseSections(copy);
                            }}
                            className="w-full p-2 rounded-lg border border-zinc-300 text-zinc-800 bg-white"
                          />
                        </div>
                      </div>

                      {/* Chapter Photo Attachment with Picker + Upload */}
                      <div className="p-3.5 bg-white rounded-lg border border-zinc-200 space-y-2.5">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span className="font-bold text-zinc-700">Chapter Target Photograph</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setPickerTarget({ type: 'showcase', showcaseIndex: cIdx })}
                              className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-black text-white text-[11px] font-bold flex items-center gap-1"
                            >
                              <FolderOpen className="w-3 h-3 text-zinc-300" />
                              <span>Select from Gallery</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => triggerFileUpload({ type: 'showcase', showcaseIndex: cIdx })}
                              className="px-2.5 py-1 rounded bg-red-700 hover:bg-red-800 text-white text-[11px] font-bold flex items-center gap-1"
                            >
                              <UploadCloud className="w-3 h-3" />
                              <span>Upload Photo</span>
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
                          <div className="sm:col-span-3 space-y-2">
                            <input
                              type="url"
                              value={chapter.images?.[0]?.url || ''}
                              onChange={(e) => {
                                const copy = [...showcaseSections];
                                const currentImgs = copy[cIdx].images || [];
                                copy[cIdx].images = [
                                  {
                                    url: e.target.value,
                                    caption: currentImgs[0]?.caption || copy[cIdx].title,
                                    alt: copy[cIdx].title
                                  },
                                  ...currentImgs.slice(1)
                                ];
                                setShowcaseSections(copy);
                              }}
                              placeholder="Image URL or local upload data"
                              className="w-full p-1.5 rounded border border-zinc-300 font-mono text-[11px]"
                            />
                            <input
                              type="text"
                              value={chapter.images?.[0]?.caption || ''}
                              onChange={(e) => {
                                const copy = [...showcaseSections];
                                const currentImgs = copy[cIdx].images || [];
                                if (currentImgs.length > 0) {
                                  copy[cIdx].images = [
                                    {
                                      ...currentImgs[0],
                                      caption: e.target.value
                                    },
                                    ...currentImgs.slice(1)
                                  ];
                                  setShowcaseSections(copy);
                                }
                              }}
                              placeholder="Photo caption text"
                              className="w-full p-1.5 rounded border border-zinc-300 text-zinc-700 text-[11px]"
                            />
                          </div>

                          <div className="h-20 rounded bg-zinc-100 border border-zinc-300 flex items-center justify-center overflow-hidden">
                            {chapter.images?.[0]?.url ? (
                              <img
                                src={chapter.images[0].url}
                                alt={chapter.title}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <span className="text-[10px] text-zinc-400">No Image</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Chapter Paragraphs */}
                      <div>
                        <label className="block font-bold text-zinc-800 mb-1">
                          Chapter Narrative Paragraphs (Separate with double line breaks)
                        </label>
                        <textarea
                          rows={3}
                          value={(chapter.paragraphs || []).join('\n\n')}
                          onChange={(e) => {
                            const copy = [...showcaseSections];
                            copy[cIdx].paragraphs = e.target.value.split('\n\n').filter(Boolean);
                            setShowcaseSections(copy);
                          }}
                          className="w-full p-2.5 rounded-lg border border-zinc-300 text-zinc-900 bg-white"
                        />
                      </div>

                      {/* Chapter Key Specifications & Highlights (Red Checkmark Bullets) */}
                      <div className="p-3.5 bg-white rounded-lg border border-zinc-200 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <label className="block font-bold text-zinc-800">
                            Key Specifications & Highlights (Checkmark Bullets)
                          </label>
                          <span className="text-[11px] text-zinc-500">
                            Enter one bullet point per line
                          </span>
                        </div>
                        <textarea
                          rows={3}
                          value={(chapter.bulletPoints || []).join('\n')}
                          onChange={(e) => {
                            const copy = [...showcaseSections];
                            copy[cIdx].bulletPoints = e.target.value.split('\n').map(s => s.trim()).filter(Boolean);
                            setShowcaseSections(copy);
                          }}
                          placeholder="e.g. Guards Red exterior finish with satin black accents&#10;Factory-style steel Turbo flare conversion&#10;Original Whale Tail rear spoiler with rubber lip"
                          className="w-full p-2.5 rounded-lg border border-zinc-300 text-zinc-900 bg-white text-xs font-mono"
                        />
                      </div>

                      {/* Bottom Chapter Spec Cards (Key-Value Attribute Cards) */}
                      <div className="p-3.5 bg-white rounded-lg border border-zinc-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="block font-bold text-zinc-800">
                            Bottom Attribute Spec Cards ({chapter.specs?.length || 0})
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const copy = [...showcaseSections];
                              const currentSpecs = copy[cIdx].specs || [];
                              copy[cIdx].specs = [...currentSpecs, { label: 'Attribute', value: 'Value' }];
                              setShowcaseSections(copy);
                            }}
                            className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-black text-white text-[11px] font-bold flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3 text-zinc-300" />
                            <span>+ Add Spec Card</span>
                          </button>
                        </div>

                        {(!chapter.specs || chapter.specs.length === 0) ? (
                          <div className="p-3 bg-zinc-50 rounded border border-dashed border-zinc-300 text-center text-zinc-500 text-[11px]">
                            No attribute spec cards configured for this chapter. Click "+ Add Spec Card" to add cards (e.g. Body Style, Color, Aero, Wheels).
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                            {chapter.specs.map((sp, spIdx) => (
                              <div key={spIdx} className="p-2.5 bg-zinc-50 rounded-lg border border-zinc-200 space-y-1.5 relative group">
                                <div className="flex items-center justify-between">
                                  <label className="text-[10px] font-bold text-zinc-500 uppercase">Card #{spIdx + 1}</label>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const copy = [...showcaseSections];
                                      copy[cIdx].specs = (copy[cIdx].specs || []).filter((_, i) => i !== spIdx);
                                      setShowcaseSections(copy);
                                    }}
                                    className="text-red-500 hover:text-red-700 p-0.5"
                                    title="Delete spec card"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                                <input
                                  type="text"
                                  value={sp.label}
                                  onChange={(e) => {
                                    const copy = [...showcaseSections];
                                    const specs = [...(copy[cIdx].specs || [])];
                                    specs[spIdx] = { ...specs[spIdx], label: e.target.value };
                                    copy[cIdx].specs = specs;
                                    setShowcaseSections(copy);
                                  }}
                                  placeholder="Label (e.g. Body Style)"
                                  className="w-full p-1.5 rounded border border-zinc-300 text-zinc-800 text-[11px] font-bold bg-white"
                                />
                                <input
                                  type="text"
                                  value={sp.value}
                                  onChange={(e) => {
                                    const copy = [...showcaseSections];
                                    const specs = [...(copy[cIdx].specs || [])];
                                    specs[spIdx] = { ...specs[spIdx], value: e.target.value };
                                    copy[cIdx].specs = specs;
                                    setShowcaseSections(copy);
                                  }}
                                  placeholder="Value (e.g. 2-Door Coupe)"
                                  className="w-full p-1.5 rounded border border-zinc-300 text-zinc-900 text-[11px] bg-white"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* 5. Hero Carousel & Full Photo Gallery (Streamlined Controls & Batch Upload) */}
              <section id="sec-gallery" className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm space-y-6">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-red-700" />
                    <h3 className="text-base font-bold text-zinc-900">5. Hero Carousel & Full Photo Gallery</h3>
                  </div>
                  <span className="text-xs text-zinc-500">
                    {heroImages.length} Hero Images • {galleryImages.length} Full Gallery Photos
                  </span>
                </div>

                {/* Hero Carousel Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-zinc-800 uppercase tracking-wider">
                        Top Hero Carousel Images (High Definition 1600px+)
                      </h4>
                      <p className="text-[11px] text-zinc-500">
                        Featured in the top full-width banner carousel on the public listing.
                      </p>
                    </div>
                    {/* Consolidate Top Controls into Two Clear, Distinct Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => triggerFileUpload({ type: 'hero' })}
                        className="px-3.5 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                        title="Select one or multiple photos from your device to add to Hero"
                      >
                        <UploadCloud className="w-3.5 h-3.5" />
                        <span>Upload Hero Photos</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPickerTarget({ type: 'hero' })}
                        className="px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-black text-white text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                        title="Pick photos from existing uploaded gallery"
                      >
                        <FolderOpen className="w-3.5 h-3.5 text-zinc-300" />
                        <span>Pick from Existing Gallery</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {heroImages.map((heroUrl, hIdx) => (
                      <div
                        key={hIdx}
                        draggable
                        onDragStart={(e) => handleHeroDragStart(e, hIdx)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleHeroDrop(e, hIdx)}
                        className="group relative rounded-lg overflow-hidden border border-zinc-300 bg-zinc-100 aspect-4/3 shadow-xs cursor-grab active:cursor-grabbing hover:border-red-500 transition-all"
                      >
                        {heroUrl && heroUrl.trim() !== '' ? (
                          <img
                            src={heroUrl}
                            alt={`Hero ${hIdx + 1}`}
                            className="w-full h-full object-cover pointer-events-none"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-400 text-[10px]">
                            No Image
                          </div>
                        )}
                        
                        {/* Always visible position badge */}
                        <div className="absolute top-1 left-1 z-10 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-xs text-[10px] font-mono font-bold text-white shadow-xs">
                          #{hIdx + 1}
                        </div>

                        {/* Hover Overlay with Positional Controls (← Left / Right →) and Delete */}
                        <div className="absolute inset-0 bg-black/65 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-1.5 z-20">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-amber-300 font-bold">
                              {hIdx === 0 ? '★ Lead Hero' : `Slide #${hIdx + 1}`}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setHeroImages(heroImages.filter((_, i) => i !== hIdx));
                              }}
                              className="p-1 rounded bg-red-700/90 text-white hover:bg-red-800 cursor-pointer"
                              title="Remove from Hero"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>

                          {/* Positional Move Buttons */}
                          <div className="flex items-center justify-center gap-1.5 pt-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveHero(hIdx, 'left');
                              }}
                              disabled={hIdx === 0}
                              className={`p-1 rounded flex items-center gap-0.5 text-[10px] font-bold ${
                                hIdx === 0 
                                  ? 'bg-zinc-800/50 text-zinc-500 cursor-not-allowed' 
                                  : 'bg-zinc-900/90 text-white hover:bg-black hover:text-amber-300 cursor-pointer active:scale-95'
                              }`}
                              title="Move Left (← Earlier in Carousel)"
                            >
                              <ChevronLeft className="w-3.5 h-3.5" />
                              <span>Left</span>
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveHero(hIdx, 'right');
                              }}
                              disabled={hIdx === heroImages.length - 1}
                              className={`p-1 rounded flex items-center gap-0.5 text-[10px] font-bold ${
                                hIdx === heroImages.length - 1 
                                  ? 'bg-zinc-800/50 text-zinc-500 cursor-not-allowed' 
                                  : 'bg-zinc-900/90 text-white hover:bg-black hover:text-amber-300 cursor-pointer active:scale-95'
                              }`}
                              title="Move Right (→ Later in Carousel)"
                            >
                              <span>Right</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {heroImages.length === 0 && (
                      <div className="col-span-full py-6 text-center text-zinc-400 bg-zinc-50 border border-dashed border-zinc-300 rounded-lg text-xs">
                        No hero carousel images configured. Click "Upload Hero Photos" or "Pick from Existing Gallery" above.
                      </div>
                    )}
                  </div>

                  {/* Single Clean URL Input Field for Manual Links Beneath the Thumbnails */}
                  <div className="flex items-center gap-2 pt-1 text-xs">
                    <input
                      type="url"
                      placeholder="Add Hero Image URL (https://...)"
                      value={newHeroUrl}
                      onChange={(e) => setNewHeroUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddHeroImage();
                        }
                      }}
                      className="flex-1 p-2 rounded-lg border border-zinc-300 bg-white text-zinc-900"
                    />
                    <button
                      type="button"
                      onClick={handleAddHeroImage}
                      className="px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-black text-white font-bold flex items-center gap-1 shadow-sm active:scale-95 transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      <span>+ Add</span>
                    </button>
                  </div>
                </div>

                {/* Categorized Photo Gallery Section */}
                <div className="space-y-3 pt-4 border-t border-zinc-200">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-zinc-800 uppercase tracking-wider">
                        Categorized Photo Gallery ({galleryImages.length} items)
                      </h4>
                      <p className="text-[11px] text-zinc-500">
                        High-resolution images organized for the complete inspection gallery.
                      </p>
                    </div>

                    {/* Batch Upload with Target Category Selector */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 bg-zinc-100 border border-zinc-300 rounded-lg px-2.5 py-1 text-xs">
                        <span className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider">Target Category:</span>
                        <select
                          value={newGalleryCategory}
                          onChange={(e) => setNewGalleryCategory(e.target.value as any)}
                          className="bg-transparent font-bold text-zinc-900 text-xs focus:outline-none cursor-pointer"
                          title="Category assigned to newly batch-uploaded photos"
                        >
                          <option value="exterior">Exterior</option>
                          <option value="interior">Interior</option>
                          <option value="engine">Engine</option>
                          <option value="underbody">Underbody</option>
                          <option value="docs">Docs & Records</option>
                        </select>
                      </div>

                      {/* Primary Prominent Action for Gallery Upload */}
                      <button
                        type="button"
                        onClick={() => triggerFileUpload({ type: 'gallery', category: newGalleryCategory })}
                        className="px-3.5 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                        title={`Select one or multiple photos/documents to batch upload into "${newGalleryCategory}"`}
                      >
                        <UploadCloud className="w-3.5 h-3.5" />
                        <span>+ Upload Photos & Inspection Documents</span>
                      </button>
                    </div>
                  </div>

                  {/* Single Inline Manual Entry Row */}
                  <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs items-center">
                    <div className="sm:col-span-5">
                      <input
                        type="url"
                        placeholder="Photo URL (https://...)"
                        value={newGalleryUrl}
                        onChange={(e) => setNewGalleryUrl(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddGalleryImage();
                          }
                        }}
                        className="w-full p-2 rounded-lg border border-zinc-300 bg-white text-zinc-900"
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <input
                        type="text"
                        placeholder="Title / Description"
                        value={newGalleryTitle}
                        onChange={(e) => setNewGalleryTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddGalleryImage();
                          }
                        }}
                        className="w-full p-2 rounded-lg border border-zinc-300 bg-white text-zinc-900"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <select
                        value={newGalleryCategory}
                        onChange={(e) => setNewGalleryCategory(e.target.value as any)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddGalleryImage();
                          }
                        }}
                        className="w-full p-2 rounded-lg border border-zinc-300 bg-white font-medium text-zinc-800"
                      >
                        <option value="exterior">Exterior</option>
                        <option value="interior">Interior</option>
                        <option value="engine">Engine</option>
                        <option value="underbody">Underbody</option>
                        <option value="docs">Docs & Records</option>
                      </select>
                    </div>
                    <div className="sm:col-span-1">
                      <button
                        type="button"
                        onClick={handleAddGalleryImage}
                        className="w-full px-3 py-2 rounded-lg bg-zinc-900 hover:bg-black text-white font-bold flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ Add</span>
                      </button>
                    </div>
                  </div>

                  {/* Gallery Items Grid with Inline Category Tag & Change Selector */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 max-h-80 overflow-y-auto p-1">
                    {galleryImages.map((img, gIdx) => {
                      const isPdf = img.isPdf || img.url.toLowerCase().endsWith('.pdf') || img.url.startsWith('data:application/pdf');
                      return (
                        <div key={img.id || gIdx} className="group relative rounded-xl overflow-hidden border border-zinc-300/80 bg-zinc-900 aspect-[4/3] text-xs shadow-xs flex flex-col justify-between select-none">
                          {isPdf ? (
                            <div className="w-full h-full absolute inset-0 bg-gradient-to-b from-red-50 to-zinc-100 flex flex-col items-center justify-center p-2 text-center">
                              <FileText className="w-8 h-8 text-red-600 mb-1" />
                              <span className="text-[10px] font-bold text-zinc-800 line-clamp-2">{img.title}</span>
                              <span className="text-[8px] font-bold uppercase text-red-700 mt-0.5">PDF Document</span>
                            </div>
                          ) : img.url && img.url.trim() !== '' ? (
                            <img
                              src={img.url}
                              alt={img.title}
                              className="w-full h-full object-cover absolute inset-0"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-full h-full absolute inset-0 flex items-center justify-center text-zinc-400 text-[10px]">
                              No Image
                            </div>
                          )}
                          {/* Top Controls: Inline Category Dropdown Tag & Trash */}
                          <div className="absolute top-0 inset-x-0 z-20 p-1.5 flex items-center justify-between gap-1.5 bg-gradient-to-b from-black/90 via-black/50 to-transparent">
                            <div className="relative min-w-0 flex-1">
                              <select
                                value={img.category || 'exterior'}
                                onChange={(e) => handleUpdateGalleryCategory(gIdx, e.target.value as any)}
                                className="w-full truncate bg-black/85 hover:bg-black text-amber-300 text-[10px] font-bold uppercase rounded px-2 py-1 pr-4 border border-zinc-700/80 focus:outline-none focus:ring-1 focus:ring-amber-400 cursor-pointer shadow-xs appearance-none leading-tight"
                                title="Change photo category"
                              >
                                <option value="exterior" className="bg-zinc-900 text-white">Exterior</option>
                                <option value="interior" className="bg-zinc-900 text-white">Interior</option>
                                <option value="engine" className="bg-zinc-900 text-white">Engine</option>
                                <option value="underbody" className="bg-zinc-900 text-white">Underbody</option>
                                <option value="docs" className="bg-zinc-900 text-white">Docs & Records</option>
                                <option value="documentation" className="bg-zinc-900 text-white">Docs (PDF)</option>
                              </select>
                              <div className="pointer-events-none absolute inset-y-0 right-1 flex items-center text-amber-300/90">
                                <ChevronDown className="w-2.5 h-2.5" />
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setGalleryImages(galleryImages.filter((_, i) => i !== gIdx));
                              }}
                              className="flex-shrink-0 w-6 h-6 rounded-md bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-md transition-all hover:scale-110 active:scale-95 cursor-pointer z-30"
                              title="Delete Photo / Document"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Bottom Title Bar */}
                          <div className="absolute bottom-0 inset-x-0 z-10 p-1.5 bg-gradient-to-t from-black/90 via-black/40 to-transparent text-white">
                            <span className="text-[10px] font-medium line-clamp-1 block text-zinc-200" title={img.title || img.caption}>
                              {img.title || 'Photo Detail'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    {galleryImages.length === 0 && (
                      <div className="col-span-full py-6 text-center text-zinc-400 bg-zinc-50 border border-dashed border-zinc-300 rounded-lg text-xs">
                        No gallery photos configured. Click "+ Upload Photos & Inspection Documents" or use the manual entry row above.
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* 6. Embedded Video Playlist Section & Driving Chapters Architecture */}
              <section id="sec-videos" className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-200 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Video className="w-5 h-5 text-red-700" />
                    <h3 className="text-base font-bold text-zinc-900">6. Embedded Video Playlist & Driving Chapters</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const newChapter: VideoChapter = {
                        id: `vid-${Date.now()}`,
                        title: `${videoChapters.length + 1}. New Driving Video`,
                        description: 'High-definition video documentation of the vehicle operation.',
                        videoUrl: 'https://www.youtube.com/watch?v=v9qF5yQfW9g',
                        duration: '03:30'
                      };
                      setVideoChapters([...videoChapters, newChapter]);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-black text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add Video Chapter</span>
                  </button>
                </div>

                <div className="space-y-4 text-xs">
                  <div>
                    <label className="block font-bold text-zinc-800 uppercase tracking-wider mb-1">
                      Master YouTube Playlist URL (Fallback / External Link)
                    </label>
                    <input
                      type="url"
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      placeholder="https://www.youtube.com/playlist?list=... or https://www.youtube.com/watch?v=..."
                      className="w-full p-2.5 rounded-lg border border-zinc-300 font-mono text-zinc-900"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-zinc-800 mb-1">Video Section Title</label>
                      <input
                        type="text"
                        value={videoTitle}
                        onChange={(e) => setVideoTitle(e.target.value)}
                        className="w-full p-2 rounded-lg border border-zinc-300 text-zinc-900 font-bold"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-zinc-800 mb-1">Video Section Subtitle</label>
                      <input
                        type="text"
                        value={videoSubtitle}
                        onChange={(e) => setVideoSubtitle(e.target.value)}
                        className="w-full p-2 rounded-lg border border-zinc-300 text-zinc-900"
                      />
                    </div>
                  </div>

                  {/* Video Chapters List */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between flex-wrap gap-2 pb-1">
                      <div>
                        <label className="block font-bold text-zinc-800 uppercase tracking-wider">
                          Video Index Chapters & Individual Embed URLs ({videoChapters.length})
                        </label>
                        <span className="text-zinc-500 text-[11px]">
                          Paste any YouTube URL or 11-char ID. Use "Fetch Metadata" to auto-pull title, duration, description, and thumbnail.
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {metadataFetchSuccess && (
                          <div className="px-3 py-1 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-semibold flex items-center gap-1.5 animate-fade-in shadow-xs">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                            <span className="truncate max-w-xs">{metadataFetchSuccess}</span>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={handleFetchAllChapters}
                          disabled={fetchingMetadataIdx !== null}
                          className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all disabled:opacity-50"
                          title="Fetch metadata for all video chapters in one click"
                        >
                          <DownloadCloud className={`w-3.5 h-3.5 ${fetchingMetadataIdx === -1 ? 'animate-bounce' : ''}`} />
                          <span>{fetchingMetadataIdx === -1 ? 'Fetching All...' : 'Fetch All Video Metadata'}</span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {videoChapters.map((chap, vIdx) => {
                        const isFetching = fetchingMetadataIdx === vIdx || fetchingMetadataIdx === -1;
                        const chapterThumb = chap.thumbnailUrl || (chap.videoUrl ? `https://img.youtube.com/vi/${chap.videoUrl.match(/[a-zA-Z0-9_-]{11}/)?.[0] || ''}/hqdefault.jpg` : '');

                        return (
                          <div key={chap.id || vIdx} className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl space-y-3 hover:border-zinc-300 transition-colors shadow-xs">
                            <div className="flex items-center justify-between border-b border-zinc-200 pb-2">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-red-700 text-white font-bold flex items-center justify-center text-[10px]">
                                  {vIdx + 1}
                                </span>
                                <span className="font-bold text-zinc-900 text-xs">Video Chapter #{vIdx + 1}</span>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={vIdx === 0}
                                  onClick={() => handleMoveVideoChapter(vIdx, 'up')}
                                  className={`p-1 rounded text-zinc-400 hover:text-zinc-800 ${vIdx === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
                                  title="Move Up"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={vIdx === videoChapters.length - 1}
                                  onClick={() => handleMoveVideoChapter(vIdx, 'down')}
                                  className={`p-1 rounded text-zinc-400 hover:text-zinc-800 ${vIdx === videoChapters.length - 1 ? 'opacity-30 cursor-not-allowed' : ''}`}
                                  title="Move Down"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setVideoChapters(videoChapters.filter((_, i) => i !== vIdx))}
                                  className="p-1 text-zinc-400 hover:text-red-700 ml-1"
                                  title="Delete Chapter"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                              {/* Left: Thumbnail preview if available */}
                              <div className="sm:col-span-3">
                                <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">
                                  Thumbnail Preview
                                </label>
                                <div className="w-full h-24 rounded-lg bg-zinc-200 border border-zinc-300 overflow-hidden relative group shadow-inner">
                                  {(() => {
                                    const ytMatch = chap.videoUrl?.match(/[a-zA-Z0-9_-]{11}/)?.[0];
                                    const thumbSrc = chap.thumbnailUrl && chap.thumbnailUrl.trim() !== ''
                                      ? chap.thumbnailUrl
                                      : (ytMatch ? `https://img.youtube.com/vi/${ytMatch}/hqdefault.jpg` : null);

                                    return thumbSrc ? (
                                      <img
                                        src={thumbSrc}
                                        alt={chap.title}
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                          (e.target as HTMLElement).style.display = 'none';
                                        }}
                                      />
                                    ) : (
                                      <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 p-2 text-center">
                                        <Film className="w-5 h-5 mb-1 opacity-50" />
                                        <span className="text-[9px] font-mono">Auto-generated</span>
                                      </div>
                                    );
                                  })()}
                                  <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-white text-[9px] font-mono font-bold">
                                    {chap.duration || '00:00'}
                                  </div>
                                </div>
                              </div>

                              {/* Right: Inputs */}
                              <div className="sm:col-span-9 space-y-2.5">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                  <div>
                                    <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-0.5">Chapter Title</label>
                                    <input
                                      type="text"
                                      value={chap.title}
                                      onChange={(e) => {
                                        const copy = [...videoChapters];
                                        copy[vIdx].title = e.target.value;
                                        setVideoChapters(copy);
                                      }}
                                      className="w-full font-bold text-zinc-800 p-2 border border-zinc-300 rounded-lg bg-white text-xs"
                                      placeholder="e.g. 1. Cold Start & Idle"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-0.5">
                                      YouTube Video URL or Video ID
                                    </label>
                                    <div className="flex items-center gap-1.5">
                                      <input
                                        type="text"
                                        value={chap.videoUrl || ''}
                                        onChange={(e) => {
                                          const copy = [...videoChapters];
                                          copy[vIdx].videoUrl = e.target.value;
                                          setVideoChapters(copy);
                                        }}
                                        onBlur={() => {
                                          // If user pasted a URL and title is default or empty, auto-fetch
                                          if (chap.videoUrl && (!chap.title || chap.title.includes('New Driving Video'))) {
                                            handleFetchChapterMetadata(vIdx);
                                          }
                                        }}
                                        className="flex-1 font-mono text-zinc-800 p-2 border border-zinc-300 rounded-lg bg-white text-xs"
                                        placeholder="https://youtube.com/watch?v=... or 11-char ID"
                                      />
                                      {/* PROMINENT DISTINCT BUTTON */}
                                      <button
                                        type="button"
                                        disabled={isFetching || !chap.videoUrl}
                                        onClick={() => handleFetchChapterMetadata(vIdx)}
                                        className={`px-3 py-2 rounded-lg bg-red-700 hover:bg-red-800 active:bg-red-900 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all flex-shrink-0 ${
                                          isFetching ? 'opacity-50 cursor-wait' : 'hover:scale-[1.02] active:scale-[0.98]'
                                        }`}
                                        title="Auto-fetch Title, Duration, Description and Thumbnail from YouTube"
                                      >
                                        <Sparkles className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                                        <span className="hidden md:inline">{isFetching ? 'Fetching...' : 'Fetch Metadata'}</span>
                                        <span className="md:hidden">{isFetching ? '...' : 'Fetch'}</span>
                                      </button>
                                    </div>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                  <div>
                                    <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-0.5">
                                      Custom Thumbnail URL (Optional)
                                    </label>
                                    <input
                                      type="text"
                                      value={chap.thumbnailUrl || ''}
                                      onChange={(e) => {
                                        const copy = [...videoChapters];
                                        copy[vIdx].thumbnailUrl = e.target.value;
                                        setVideoChapters(copy);
                                      }}
                                      className="w-full font-mono text-zinc-700 p-2 border border-zinc-300 rounded-lg bg-white text-xs"
                                      placeholder="https://img.youtube.com/vi/.../hqdefault.jpg"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-0.5">Duration</label>
                                    <input
                                      type="text"
                                      value={chap.duration || ''}
                                      onChange={(e) => {
                                        const copy = [...videoChapters];
                                        copy[vIdx].duration = e.target.value;
                                        setVideoChapters(copy);
                                      }}
                                      className="w-full font-mono text-zinc-800 p-2 border border-zinc-300 rounded-lg bg-white text-xs"
                                      placeholder="03:45"
                                    />
                                  </div>
                                </div>

                                <div>
                                  <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-0.5">Description</label>
                                  <textarea
                                    rows={2}
                                    value={chap.description || ''}
                                    onChange={(e) => {
                                      const copy = [...videoChapters];
                                      copy[vIdx].description = e.target.value;
                                      setVideoChapters(copy);
                                    }}
                                    className="w-full text-zinc-700 p-2 border border-zinc-300 rounded-lg bg-white text-xs"
                                    placeholder="Describe the footage captured in this video (auto-populated by Fetch Metadata)"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Secondary Bottom "+ Add Video Chapter" Action Button */}
                    <div className="pt-3 border-t border-zinc-200/80 flex items-center justify-between flex-wrap gap-2">
                      <span className="text-xs text-zinc-500">
                        Total chapters configured: <strong className="text-zinc-800 font-mono">{videoChapters.length}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setVideoChapters([
                            ...videoChapters,
                            {
                              id: `vid-${Date.now()}`,
                              title: `${videoChapters.length + 1}. New Driving / Walkaround Chapter`,
                              description: '',
                              videoUrl: '',
                              duration: '03:00',
                              thumbnailUrl: ''
                            }
                          ]);
                        }}
                        className="px-3.5 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                      >
                        <Plus className="w-4 h-4" />
                        <span>+ Add Video Chapter</span>
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {/* 7. Auction Dates & Financial Parameters (CAD Localization & Live Sync) */}
              <section id="sec-financials" className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-emerald-700" />
                    <h3 className="text-base font-bold text-zinc-900">7. Auction Dates & Financial Rules (Canadian Dollars - CAD)</h3>
                  </div>
                  <span className="px-2.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-xs">
                    CAD $ Standardized
                  </span>
                </div>

                <div className="space-y-4 text-xs">
                  {/* Financial inputs */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div>
                      <label className="block font-bold text-zinc-800 uppercase tracking-wider mb-1">
                        Starting Bid (CAD)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-zinc-500">$</span>
                        <input
                          type="number"
                          step={100}
                          value={startingBid}
                          onChange={(e) => setStartingBid(Number(e.target.value))}
                          className="w-full pl-7 pr-3 py-2 rounded-lg border border-zinc-300 font-mono font-bold text-zinc-900"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block font-bold text-zinc-800 uppercase tracking-wider mb-1">
                        Minimum Increment (CAD)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-zinc-500">$</span>
                        <input
                          type="number"
                          step={50}
                          value={minimumIncrement}
                          onChange={(e) => setMinimumIncrement(Number(e.target.value))}
                          className="w-full pl-7 pr-3 py-2 rounded-lg border border-zinc-300 font-mono font-bold text-zinc-900"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block font-bold text-zinc-800 uppercase tracking-wider mb-1">
                        Hidden Reserve Amount (CAD)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-zinc-500">$</span>
                        <input
                          type="number"
                          step={500}
                          value={reserveAmount}
                          onChange={(e) => setReserveAmount(Number(e.target.value))}
                          className="w-full pl-7 pr-3 py-2 rounded-lg border border-zinc-300 font-mono font-bold text-zinc-900"
                        />
                      </div>
                      <span className="text-[10px] text-zinc-500 mt-1 block">Hidden from public bidders</span>
                    </div>

                    <div>
                      <label className="block font-bold text-zinc-800 uppercase tracking-wider mb-1">
                        Auction Lifecycle Status
                      </label>
                      <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value as any)}
                        className="w-full p-2 rounded-lg border border-zinc-300 bg-white font-bold text-zinc-900"
                      >
                        <option value="active">Active (Accepting Bids)</option>
                        <option value="upcoming">Upcoming (Preview Mode)</option>
                        <option value="ended">Ended (Closed)</option>
                        <option value="sold">Sold (Final Settlement)</option>
                      </select>
                    </div>
                  </div>

                  {/* Dates & Timers */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block font-bold text-zinc-800 uppercase tracking-wider text-xs">
                          Auction Start Time
                        </label>
                        <button
                          type="button"
                          onClick={() => setStartTimeInput(formatForInput(Date.now()))}
                          className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-zinc-900 hover:bg-black text-white border border-zinc-700 shadow-xs cursor-pointer active:scale-95 transition-all flex items-center gap-1"
                          title="Set auction start time to current moment"
                        >
                          <Clock className="w-3 h-3 text-amber-400" />
                          <span>Set to Now</span>
                        </button>
                      </div>
                      <input
                        type="datetime-local"
                        value={startTimeInput}
                        onChange={(e) => setStartTimeInput(e.target.value)}
                        className="w-full p-2 rounded-lg border border-zinc-300 font-mono text-zinc-800 bg-white"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block font-bold text-zinc-800 uppercase tracking-wider text-xs">
                          Auction End Time
                        </label>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEndTimeInput(formatForInput(Date.now() + 3 * 24 * 60 * 60 * 1000))}
                            className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-700 hover:bg-red-800 text-white border border-red-800 shadow-xs cursor-pointer active:scale-95 transition-all"
                            title="Set auction end date to 3 days from now"
                          >
                            +3 Days
                          </button>
                          <button
                            type="button"
                            onClick={() => setEndTimeInput(formatForInput(Date.now() + 7 * 24 * 60 * 60 * 1000))}
                            className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-zinc-900 hover:bg-black text-white border border-zinc-700 shadow-xs cursor-pointer active:scale-95 transition-all"
                            title="Set auction end date to standard 7-day duration"
                          >
                            +7 Days
                          </button>
                        </div>
                      </div>
                      <input
                        type="datetime-local"
                        value={endTimeInput}
                        onChange={(e) => setEndTimeInput(e.target.value)}
                        className="w-full p-2 rounded-lg border border-zinc-300 font-mono text-zinc-800 bg-white"
                      />
                    </div>
                  </div>

                  {/* Quick Simulation Buttons */}
                  <div className="pt-3 border-t border-zinc-200 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={async () => {
                        await setAuctionEndingSoon(auction.id, 110);
                        setMessage({ type: 'success', text: 'Auction set to ending soon (1m 50s left) to test Anti-Sniping!' });
                      }}
                      className="px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-900 font-bold flex items-center gap-1.5"
                    >
                      <Flame className="w-3.5 h-3.5 text-amber-700" />
                      <span>Simulate Final 2 Minutes (Anti-Sniping Test)</span>
                    </button>
                  </div>
                </div>
              </section>

              {/* Master Floating Save Action Bar at bottom */}
              <div className="sticky bottom-0 z-20 bg-[#121619]/95 backdrop-blur-md text-white p-4 rounded-xl border border-zinc-700 shadow-2xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <div className="text-xs">
                    <span className="font-bold text-white block">Unified Listing Editor</span>
                    <span className="text-zinc-400">All modifications save to active Firestore documents</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSaveAll}
                    disabled={saving}
                    className={`px-6 py-2.5 rounded-lg font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg transition-all ${
                      saving
                        ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white hover:scale-105 active:scale-95'
                    }`}
                  >
                    <Save className="w-4 h-4" />
                    <span>{saving ? 'Saving to Firestore...' : 'Save Full Listing & Media'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* VIEW 2: LIVE BIDS & ANTI-SNIPING LOG */}
          {mainView === 'bids' && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
                  <div>
                    <h3 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                      <History className="w-5 h-5 text-red-700" />
                      <span>Live Bids History ({bids.length} Total)</span>
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Real-time bid logs in Canadian Dollars (CAD) with Anti-Sniping flags
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowClearConfirm(true)}
                    className="px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 border border-red-300 text-red-800 text-xs font-bold flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-red-700" />
                    <span>Reset & Clear All Bids</span>
                  </button>
                </div>

                {/* Confirm dialog */}
                {showClearConfirm && (
                  <div className="p-4 bg-red-50 border border-red-300 rounded-xl space-y-2 text-xs text-red-900">
                    <p className="font-bold">Are you sure you want to delete all {bids.length} bids from Firestore?</p>
                    <p>This will reset the auction current bid to {formatCurrency(startingBid)} and clear all bidding comments.</p>
                    <div className="flex items-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={handleClearAllBids}
                        disabled={clearingBids}
                        className="px-3 py-1.5 rounded bg-red-700 text-white font-bold hover:bg-red-800"
                      >
                        {clearingBids ? 'Clearing...' : 'Yes, Permanently Clear Bids'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowClearConfirm(false)}
                        className="px-3 py-1.5 rounded bg-zinc-200 text-zinc-800 font-semibold"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Bids List */}
                <div className="divide-y divide-zinc-200 max-h-96 overflow-y-auto">
                  {bids.length === 0 ? (
                    <div className="py-8 text-center text-xs text-zinc-500">
                      No bids have been recorded yet.
                    </div>
                  ) : (
                    bids.map((bid, idx) => (
                      <div key={bid.id || idx} className="py-3 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-zinc-100 text-zinc-600 font-bold flex items-center justify-center font-mono text-[11px]">
                            #{bids.length - idx}
                          </span>
                          <div>
                            <span className="font-bold text-zinc-900">{bid.bidderName}</span>
                            <span className="text-zinc-500 ml-2 font-mono text-[11px]">{bid.bidderEmail}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          {bid.antiSniped && (
                            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 font-bold text-[10px] flex items-center gap-1">
                              <Flame className="w-3 h-3 text-amber-600" />
                              Anti-Sniping +2m
                            </span>
                          )}
                          <span className="font-mono text-zinc-400 text-[11px]">
                            {formatDateTime(bid.timestamp)}
                          </span>
                          <span className="font-mono font-extrabold text-emerald-700 text-sm">
                            {formatCurrency(bid.amount)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* VIEW 3: REGISTERED BIDDERS */}
          {mainView === 'bidders' && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
                  <div>
                    <h3 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                      <Users className="w-5 h-5 text-red-700" />
                      <span>Registered Bidder Registry ({bidders.length} Members)</span>
                    </h3>
                    <p className="text-xs text-zinc-500">
                      All authenticated accounts with email verification and role status
                    </p>
                  </div>
                </div>

                <div className="divide-y divide-zinc-200 max-h-96 overflow-y-auto">
                  {bidders.length === 0 ? (
                    <div className="py-8 text-center text-xs text-zinc-500">
                      No registered bidders found in registry.
                    </div>
                  ) : (
                    bidders.map((userItem, uIdx) => (
                      <div key={userItem.uid || uIdx} className="py-3 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-zinc-100 font-bold text-zinc-700 flex items-center justify-center uppercase">
                            {userItem.displayName ? userItem.displayName[0] : 'U'}
                          </div>
                          <div>
                            <div className="font-bold text-zinc-900 flex items-center gap-2">
                              <span>{userItem.displayName || 'Anonymous Bidder'}</span>
                              <span className={`px-1.5 py-0.2 rounded text-[10px] uppercase font-bold ${
                                userItem.role === 'admin' 
                                  ? 'bg-red-100 text-red-800' 
                                  : userItem.role === 'seller'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-zinc-100 text-zinc-700'
                              }`}>
                                {userItem.role || 'bidder'}
                              </span>
                            </div>
                            <span className="text-zinc-500 font-mono text-[11px]">{userItem.email}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {userItem.isEmailVerified ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center gap-1">
                              <CheckCircle className="w-3 h-3 text-emerald-600" />
                              Email Verified
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-amber-600" />
                              Unverified
                            </span>
                          )}
                          <span className="text-zinc-400 font-mono text-[11px]">
                            {formatDateTime(userItem.registeredAt)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* VIEW 4: WINNER & SETTLEMENT */}
          {mainView === 'winner' && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
                  <div>
                    <h3 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                      <Trophy className="w-5 h-5 text-amber-600" />
                      <span>Auction Winner & Direct Offline Settlement</span>
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Private transaction facilitation with highest verified bidder in Canadian Dollars (CAD)
                    </p>
                  </div>
                </div>

                <div className="p-5 bg-zinc-50 rounded-xl border border-zinc-200 space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <span className="text-zinc-500 uppercase tracking-wider text-[10px] font-bold block mb-1">
                        Highest Leading Bidder
                      </span>
                      <span className="text-lg font-extrabold text-zinc-900 font-sans">
                        {auction.highBidderName || 'No Leading Bidder Yet'}
                      </span>
                      {auction.highBidderEmail && (
                        <span className="block font-mono text-zinc-500 mt-0.5">{auction.highBidderEmail}</span>
                      )}
                    </div>

                    <div>
                      <span className="text-zinc-500 uppercase tracking-wider text-[10px] font-bold block mb-1">
                        Final Winning / Current Bid Amount
                      </span>
                      <span className="text-2xl font-black font-mono text-emerald-700">
                        {formatCurrency(auction.currentBid)}
                      </span>
                      <div className="mt-1">
                        {auction.currentBid >= auction.reserveAmount ? (
                          <span className="text-emerald-700 font-bold">Reserve Met (Will Sell)</span>
                        ) : (
                          <span className="text-amber-700 font-bold">Reserve Not Met (${auction.reserveAmount.toLocaleString()} CAD)</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-zinc-200 space-y-2">
                    <h4 className="font-bold text-zinc-800">Private Settlement Checklist:</h4>
                    <p className="text-zinc-600">1. Contact the winning bidder directly via verified email/phone.</p>
                    <p className="text-zinc-600">2. Coordinate wire transfer / bank draft payment in Canadian Dollars (CAD).</p>
                    <p className="text-zinc-600">3. Arrange bill of sale, vehicle registration transfer, and transport carrier.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: CONSIGNMENT APPLICATIONS REVIEW */}
          {mainView === 'consignments' && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
                  <div>
                    <h3 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                      <FileText className="w-5 h-5 text-emerald-600" />
                      <span>Consignment Applications Review ({consignments.length})</span>
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Review seller applications, promote consignors to 'seller' role, and provision blank assigned auction lots.
                    </p>
                  </div>
                </div>

                <div className="divide-y divide-zinc-200 max-h-[600px] overflow-y-auto">
                  {consignments.length === 0 ? (
                    <div className="py-8 text-center text-xs text-zinc-500">
                      No consignment applications submitted yet.
                    </div>
                  ) : (
                    consignments.map((app) => (
                      <div key={app.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-zinc-900">
                              {app.year} {app.make} {app.model}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              app.status === 'approved' 
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                                : app.status === 'declined'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-amber-100 text-amber-800 border border-amber-300'
                            }`}>
                              {app.status}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-zinc-600 text-xs">
                            <span>Consignor: <strong>{app.sellerName}</strong> ({app.sellerEmail})</span>
                            {app.sellerPhone && <span>Phone: <strong>{app.sellerPhone}</strong></span>}
                            {app.location && <span>Location: <strong>{app.location}</strong></span>}
                            {app.reserveExpectation && <span>Expectation: <strong>{app.reserveExpectation}</strong></span>}
                          </div>

                          {app.notes && (
                            <p className="text-zinc-500 italic text-[11px] bg-zinc-50 p-2 rounded-lg border border-zinc-100">
                              "{app.notes}"
                            </p>
                          )}
                        </div>

                        {app.status !== 'approved' && (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  // Find matching user by email in bidders registry if available
                                  const matchingUser = bidders.find(b => b.email.toLowerCase() === app.sellerEmail.toLowerCase());
                                  const newLot = await approveConsignmentAndPromoteSeller(
                                    app.id!, 
                                    matchingUser?.uid, 
                                    `${app.year} ${app.make} ${app.model}`
                                  );
                                  setInventory(prev => [...prev, newLot]);
                                  setMessage({
                                    type: 'success',
                                    text: `Approved consignment for ${app.sellerName}! Created new lot "${newLot.title}" and promoted seller.`
                                  });
                                  setTimeout(() => setMessage(null), 5000);
                                } catch (err: any) {
                                  setMessage({ type: 'error', text: `Approval failed: ${err.message}` });
                                }
                              }}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>Approve & Promote Seller</span>
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* VIEW 5: SITE BRANDING & GLOBAL SETTINGS */}
          {mainView === 'branding' && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm space-y-6">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
                  <div className="flex items-center gap-2">
                    <Palette className="w-5 h-5 text-purple-700" />
                    <div>
                      <h3 className="text-base font-bold text-zinc-900">Site Branding & Global Settings</h3>
                      <p className="text-xs text-zinc-500">
                        Platform-level identity, header emblem, wordmark, and tagline (separated from individual vehicle lots)
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-0.5 rounded bg-purple-100 text-purple-800 font-bold text-xs">
                    Dynamic Header Sync
                  </span>
                </div>

                <div className="space-y-6 text-xs">
                  {/* Live Logo Preview Box */}
                  <div>
                    <label className="block font-bold text-zinc-800 uppercase tracking-wider mb-2">
                      Live Header Preview (Max 40px Height • Aspect-Ratio Preserved)
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Dark Navbar Preview */}
                      <div className="p-4 rounded-xl bg-[#121619] border border-zinc-800 flex flex-col justify-between">
                        <div className="flex items-center justify-between mb-3 text-[10px] text-zinc-400 border-b border-zinc-800/80 pb-1.5">
                          <span className="font-mono">Header Navbar Dark Preview</span>
                          <span className="text-emerald-400 font-semibold">Active State</span>
                        </div>
                        <div className="py-3 px-2 flex items-center gap-3">
                          {siteLogo && siteLogo.trim() !== '' ? (
                            <img
                              src={siteLogo}
                              alt={siteName || 'Site Logo'}
                              className="h-10 max-h-10 w-auto object-contain transition-all"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <WailtailLogo className="h-10" />
                          )}
                          <div className="border-l border-zinc-700 pl-3">
                            <div className="text-sm font-black tracking-tight text-white capitalize font-serif">
                              {siteName || 'wailtail'}
                            </div>
                            <div className="text-[10px] text-zinc-400 font-medium">
                              {siteTagline || 'Single-Car Auctions'}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Light Surface Preview */}
                      <div className="p-4 rounded-xl bg-zinc-100 border border-zinc-300 flex flex-col justify-between">
                        <div className="flex items-center justify-between mb-3 text-[10px] text-zinc-500 border-b border-zinc-200 pb-1.5">
                          <span className="font-mono">Light Background Contrast Preview</span>
                          <span className="text-zinc-600 font-semibold">40px Constraint</span>
                        </div>
                        <div className="py-3 px-2 flex items-center gap-3">
                          {siteLogo && siteLogo.trim() !== '' ? (
                            <img
                              src={siteLogo}
                              alt={siteName || 'Site Logo'}
                              className="h-10 max-h-10 w-auto object-contain transition-all"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <WailtailLogo className="h-10" />
                          )}
                          <div className="border-l border-zinc-300 pl-3">
                            <div className="text-sm font-black tracking-tight text-zinc-900 capitalize font-serif">
                              {siteName || 'wailtail'}
                            </div>
                            <div className="text-[10px] text-zinc-500 font-medium">
                              {siteTagline || 'Single-Car Auctions'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Logo Source Controls: URL and Direct Upload */}
                  <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200 space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="block font-bold text-zinc-800 uppercase tracking-wider">
                        Header Logo Image Source
                      </label>
                      {siteLogo && siteLogo.trim() !== '' && (
                        <button
                          type="button"
                          onClick={() => {
                            setSiteLogo('');
                            setMessage({ type: 'success', text: 'Reverted to native vector Wailtail emblem. Click Save to persist.' });
                          }}
                          className="text-[11px] text-red-600 hover:text-red-700 font-bold flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reset to Default Vector Emblem</span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                      <div className="sm:col-span-8">
                        <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">
                          Custom Logo Image URL (PNG / SVG / WebP)
                        </label>
                        <input
                          type="text"
                          value={siteLogo}
                          onChange={(e) => setSiteLogo(e.target.value)}
                          placeholder="https://example.com/logo.png or data:image/..."
                          className="w-full font-mono text-zinc-800 p-2.5 border border-zinc-300 rounded-lg bg-white text-xs"
                        />
                      </div>

                      <div className="sm:col-span-4 flex flex-col justify-end">
                        <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">
                          Direct File Upload
                        </label>
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
                          className="w-full py-2.5 px-3 rounded-lg bg-white hover:bg-zinc-100 border border-zinc-300 text-zinc-800 font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
                        >
                          <Upload className="w-4 h-4 text-purple-600" />
                          <span>Upload Logo File</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Brand Typography & Tagline */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-zinc-800 uppercase tracking-wider mb-1">
                        Site / Brand Name
                      </label>
                      <input
                        type="text"
                        value={siteName}
                        onChange={(e) => setSiteName(e.target.value)}
                        placeholder="e.g. wailtail"
                        className="w-full p-2.5 rounded-lg border border-zinc-300 font-bold text-zinc-900 bg-white"
                      />
                      <span className="text-[10px] text-zinc-500 mt-1 block">
                        Displayed in header brand title and metadata
                      </span>
                    </div>

                    <div>
                      <label className="block font-bold text-zinc-800 uppercase tracking-wider mb-1">
                        Site Tagline / Subtitle
                      </label>
                      <input
                        type="text"
                        value={siteTagline}
                        onChange={(e) => setSiteTagline(e.target.value)}
                        placeholder="e.g. Single-Car Auctions"
                        className="w-full p-2.5 rounded-lg border border-zinc-300 text-zinc-900 bg-white"
                      />
                      <span className="text-[10px] text-zinc-500 mt-1 block">
                        Displayed below the brand name in the navigation bar
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating Save Action Bar for Branding */}
              <div className="sticky bottom-0 z-20 bg-[#121619]/95 backdrop-blur-md text-white p-4 rounded-xl border border-zinc-700 shadow-2xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-pulse"></span>
                  <div className="text-xs">
                    <span className="font-bold text-white block">Global Brand Identity</span>
                    <span className="text-zinc-400">Updates header logo, brand name & tagline across the platform</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={async () => {
                      if (confirm('Permanently purge all catalog listings, media configurations, and local cache? This cannot be undone.')) {
                        try {
                          await purgeAllListings();
                          setMessage({ type: 'success', text: 'All catalog listings and media data have been purged.' });
                          setTimeout(() => setMessage(null), 5000);
                        } catch (err: any) {
                          setMessage({ type: 'error', text: `Purge failed: ${err.message}` });
                        }
                      }
                    }}
                    className="px-3 py-2 rounded-lg text-xs font-bold bg-zinc-700 hover:bg-red-900 text-zinc-300 hover:text-white border border-zinc-600 hover:border-red-700 transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Purge All Catalog Listings (0 Lots)</span>
                    <span className="sm:hidden">Purge All</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveAll}
                    disabled={saving}
                    className={`px-6 py-2.5 rounded-lg font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg transition-all ${
                      saving
                        ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                        : 'bg-purple-600 hover:bg-purple-500 text-white hover:scale-105 active:scale-95'
                    }`}
                  >
                    <Save className="w-4 h-4" />
                    <span>{saving ? 'Saving...' : 'Save Branding & Global Settings'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* NEW LISTING CREATION MODAL */}
      {showNewListingModal && (
        <div 
          onClick={() => setShowNewListingModal(false)}
          className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4 animate-in fade-in"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-zinc-200 p-6 space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="p-3 rounded-full bg-emerald-100 text-emerald-700 flex-shrink-0">
                <Car className="w-6 h-6" />
              </div>
              <div className="space-y-1 flex-1">
                <h3 className="text-base font-bold text-zinc-900">Initialize New Vehicle Listing</h3>
                <p className="text-xs text-zinc-600">
                  Creates a clean auction lot with empty specification arrays and standard Canadian CAD financial defaults.
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateNewListingSubmit} className="space-y-4 pt-1">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Vehicle Listing Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newListingTitle}
                  onChange={(e) => setNewListingTitle(e.target.value)}
                  placeholder="e.g. 1989 Porsche 911 Speedster"
                  className="w-full p-2.5 rounded-lg border border-zinc-300 text-sm text-zinc-900 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  autoFocus
                />
              </div>

              <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 text-[11px] text-zinc-600 space-y-1">
                <div className="flex justify-between">
                  <span>Starting Bid:</span>
                  <span className="font-bold text-zinc-900">$1,000 CAD</span>
                </div>
                <div className="flex justify-between">
                  <span>Minimum Increment:</span>
                  <span className="font-bold text-zinc-900">$250 CAD</span>
                </div>
                <div className="flex justify-between">
                  <span>Lifecycle Status:</span>
                  <span className="font-bold text-amber-600">Upcoming / Draft</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setShowNewListingModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingListing || !newListingTitle.trim()}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  {creatingListing ? 'Creating...' : 'Create Listing Lot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRMATION DIALOG: Delete Vehicle Listing */}
      {confirmDeleteLot && (
        <div 
          onClick={() => setConfirmDeleteLot(null)}
          className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4 animate-in fade-in"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-red-200 p-6 space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="p-3 rounded-full bg-red-100 text-red-700 flex-shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="space-y-1 flex-1">
                <h3 className="text-base font-bold text-zinc-900">Delete Vehicle Listing?</h3>
                <p className="text-xs text-zinc-700 font-medium">
                  Are you sure you want to permanently delete "{confirmDeleteLot.title}"?
                </p>
                <p className="text-[11px] text-zinc-500">
                  This will remove the auction document and its media configuration from Firestore. This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setConfirmDeleteLot(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteListingSubmit}
                disabled={deletingListing}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-sm transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {deletingListing ? 'Deleting...' : 'Yes, Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IMAGE PICKER MODAL (Choose directly from gallery photos) */}
      {pickerTarget && (
        <div 
          onClick={() => setPickerTarget(null)}
          className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4 animate-in fade-in"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-zinc-300 p-6 flex flex-col max-h-[85vh] overflow-hidden"
          >
            <div className="flex items-center justify-between pb-4 border-b border-zinc-200">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-red-700" />
                <h3 className="font-bold text-zinc-900 text-base">Select Photograph from Listing Gallery</h3>
              </div>
              <button
                onClick={() => setPickerTarget(null)}
                className="p-1 rounded text-zinc-400 hover:text-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter & Search */}
            <div className="py-3 flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search photos by title or caption..."
                  value={pickerSearchTerm}
                  onChange={(e) => setPickerSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-zinc-300 text-xs"
                />
              </div>

              <select
                value={pickerFilterCategory}
                onChange={(e) => setPickerFilterCategory(e.target.value)}
                className="p-1.5 rounded-lg border border-zinc-300 text-xs font-medium"
              >
                <option value="all">All Categories</option>
                <option value="exterior">Exterior</option>
                <option value="interior">Interior</option>
                <option value="engine">Engine</option>
                <option value="underbody">Underbody</option>
                <option value="docs">Documentation</option>
              </select>
            </div>

            {/* Photos Grid */}
            <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-4 gap-3 py-2">
              {/* Combine Hero & Gallery */}
              {[
                ...heroImages.map((hUrl, idx) => ({ id: `hero-${idx}`, url: hUrl, title: `Hero Photo #${idx + 1}`, category: 'exterior' })),
                ...galleryImages
              ]
                .filter((item) => {
                  if (!item.url || !item.url.trim()) return false;
                  if (pickerFilterCategory !== 'all' && item.category !== pickerFilterCategory) return false;
                  if (pickerSearchTerm && !item.title.toLowerCase().includes(pickerSearchTerm.toLowerCase())) return false;
                  return true;
                })
                .map((item, idx) => (
                  <div
                    key={item.id || idx}
                    onClick={() => handleSelectFromGallery(item.url)}
                    className="group relative rounded-xl overflow-hidden border border-zinc-300 hover:border-red-600 bg-zinc-100 cursor-pointer aspect-4/3 shadow-sm hover:scale-[1.02] transition-all"
                  >
                    <img
                      src={item.url}
                      alt={item.title}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-between text-white text-xs">
                      <span className="font-bold text-[11px] line-clamp-2">{item.title}</span>
                      <span className="self-end px-2 py-0.5 rounded bg-red-700 text-[10px] font-bold">Select Photo</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
