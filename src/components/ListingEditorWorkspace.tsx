import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Auction, 
  MediaConfiguration, 
  GalleryImage, 
  ShowcaseSection, 
  ShowcaseChapter,
  VideoChapter,
  ListingDraftSchema
} from '../types';
import { 
  updateAuctionConfig,
  setAuctionEndingSoon,
  createNewListing,
  subscribeToAllAuctions,
  compressImageDataUrl,
  uploadImageToStorage,
  MAIN_AUCTION_ID
} from '../services/auctionService';
import { fetchYouTubeMetadata } from '../utils/youtubeMetadata';
import { formatCurrency, formatAuctionCountdown } from '../utils/formatters';
import { normalizeSectionToChapter, chapterToSection } from '../utils/showcaseConverter';
import { HeroMediaCarousel } from './HeroMediaCarousel';
import { InlineShowcaseSection } from './InlineShowcaseSection';
import { YouTubePlaylistSection } from './YouTubePlaylistSection';
import { PhotoGalleryGrid } from './PhotoGalleryGrid';
import { ShowcaseChaptersEditor } from './ShowcaseChaptersEditor';
import { 
  ArrowLeft, 
  Save, 
  CheckCircle, 
  AlertTriangle, 
  FileText, 
  Car, 
  Sliders, 
  BookOpen, 
  ImageIcon, 
  Video, 
  DollarSign, 
  FilePlus, 
  Download, 
  Upload, 
  Layers, 
  Eye, 
  Sparkles, 
  Trash2, 
  Plus, 
  UploadCloud, 
  RotateCcw, 
  ArrowUp, 
  ArrowDown, 
  Play, 
  RefreshCw, 
  ChevronRight, 
  ChevronLeft,
  ChevronDown,
  DownloadCloud,
  Flame,
  Film,
  FolderOpen,
  Search,
  X,
  Smartphone,
  Monitor,
  MapPin, 
  ExternalLink,
  Split,
  Maximize2,
  Minimize2,
  Check,
  Copy,
  Clock,
  Gauge,
  Calendar,
  ShieldCheck,
  Info,
  Gavel,
  Mail
} from 'lucide-react';

interface ListingEditorWorkspaceProps {
  auction: Auction;
  mediaConfig: MediaConfiguration;
  allAuctions?: Auction[];
  onSelectAuction?: (auctionId: string) => void;
  onUpdateAuction: (data: Partial<Auction>) => Promise<void>;
  onUpdateMediaConfig: (newConfig: MediaConfiguration) => Promise<void>;
  onBackToPublic: () => void;
}

// Standardized Year choices (2026 down to 1950, then key classics down to 1900)
const YEAR_OPTIONS = Array.from({ length: 2026 - 1930 + 1 }, (_, i) => 2026 - i);

// Standardized Title & Registration options
const TITLE_STATUS_OPTIONS = [
  'Clean Registration',
  'Rebuilt / Reconstructed',
  'Salvage Title',
  'Irreparable / Parts Only',
  'Lien / Lease Pending',
  'Other / Custom'
];

// Standardized Drivetrain & Gearbox options
const GEARBOX_OPTIONS = [
  '5-Speed Manual (915)',
  '5-Speed Manual',
  '6-Speed Manual',
  '4-Speed Automatic',
  '5-Speed Automatic',
  'Dual-Clutch / PDK',
  'Sequential',
  'Other'
];

export const ListingEditorWorkspace: React.FC<ListingEditorWorkspaceProps> = ({
  auction,
  mediaConfig,
  allAuctions,
  onSelectAuction,
  onUpdateAuction,
  onUpdateMediaConfig,
  onBackToPublic
}) => {
  // Multi-listing Catalog State
  const [availableAuctions, setAvailableAuctions] = useState<Auction[]>(() => {
    if (allAuctions && allAuctions.length > 0) return allAuctions;
    return [auction];
  });

  useEffect(() => {
    if (allAuctions && allAuctions.length > 0) {
      setAvailableAuctions(allAuctions);
    }
  }, [allAuctions]);

  useEffect(() => {
    const unsub = subscribeToAllAuctions((list) => {
      if (list && list.length > 0) {
        setAvailableAuctions(list);
      }
    });
    return () => unsub();
  }, []);

  // + New Listing modal state
  const [showNewListingModal, setShowNewListingModal] = useState(false);
  const [newListingTitle, setNewListingTitle] = useState('');
  const [creatingListing, setCreatingListing] = useState(false);

  // View mode: split (60/40), form (full-screen form), preview (full-screen preview)
  const [viewMode, setViewMode] = useState<'split' | 'form' | 'preview'>('split');
  const [activeStep, setActiveStep] = useState<number>(1);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modals inside workspace
  const [showImportModal, setShowImportModal] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  // File Upload Ref & Target
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadTarget, setActiveUploadTarget] = useState<{
    type: 'overview' | 'showcase' | 'hero' | 'gallery';
    showcaseIndex?: number;
    category?: GalleryImage['category'];
  } | null>(null);

  // Image picker modal state (choose from existing gallery photos)
  const [pickerTarget, setPickerTarget] = useState<{
    type: 'overview' | 'showcase' | 'hero' | 'gallery';
    showcaseIndex?: number;
  } | null>(null);
  const [pickerSearchTerm, setPickerSearchTerm] = useState('');
  const [pickerFilterCategory, setPickerFilterCategory] = useState<string>('all');

  // Video metadata status
  const [metadataFetchSuccess, setMetadataFetchSuccess] = useState<string | null>(null);
  const [isFetchingAllVideos, setIsFetchingAllVideos] = useState(false);

  // Drag & drop state for hero images
  const [draggedHeroIdx, setDraggedHeroIdx] = useState<number | null>(null);

  // Gallery view filter in Section 5
  const [galleryActiveFilter, setGalleryActiveFilter] = useState<string>('all');

  // Live Preview interactive states
  const [previewViewport, setPreviewViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [previewActiveHeroIdx, setPreviewActiveHeroIdx] = useState<number>(0);
  const [previewGalleryCategory, setPreviewGalleryCategory] = useState<string>('all');
  const [previewSelectedVideoIdx, setPreviewSelectedVideoIdx] = useState<number>(0);
  const [previewLightboxUrl, setPreviewLightboxUrl] = useState<string | null>(null);
  const [previewLightboxIndex, setPreviewLightboxIndex] = useState<number | null>(null);

  // SECTION 1: VEHICLE IDENTITY
  const isMainLot = auction.id === MAIN_AUCTION_ID;

  const [title, setTitle] = useState(auction.title ?? '');
  const [subtitle, setSubtitle] = useState(auction.subtitle ?? '');
  const [headline, setHeadline] = useState(auction.headline ?? (isMainLot ? (auction.title ?? '') : ''));
  const [make, setMake] = useState(auction.make ?? (isMainLot ? 'Porsche' : ''));
  const [model, setModel] = useState(auction.model ?? (isMainLot ? '911 Turbo-Look' : ''));
  const [year, setYear] = useState<number | string>(auction.year ? Number(auction.year) : (isMainLot ? 1978 : ''));
  const [vin, setVin] = useState(auction.vin ?? '');
  const [mileage, setMileage] = useState(auction.mileage ?? '');
  const [distanceUnit, setDistanceUnit] = useState<'km' | 'mi'>(auction.distanceUnit ?? 'km');
  const [highlightsBadge, setHighlightsBadge] = useState(auction.highlightsBadge ?? (isMainLot ? (mediaConfig.highlightsBadge ?? '1978 911 SC') : ''));
  const [engine, setEngine] = useState(auction.engine ?? (isMainLot ? '3.0L Flat-Six CIS' : ''));
  const [drivetrain, setDrivetrain] = useState(auction.drivetrain ?? (isMainLot ? '5-Speed Manual (915)' : ''));
  const [customDrivetrain, setCustomDrivetrain] = useState('');
  const [exteriorColor, setExteriorColor] = useState(auction.exteriorColor ?? (isMainLot ? 'Guards Red (027)' : ''));
  const [interior, setInterior] = useState(auction.interior ?? (isMainLot ? 'Black Leather / Houndstooth' : ''));
  const [titleStatus, setTitleStatus] = useState(auction.titleStatus ?? 'Clean Registration');
  const [customTitleStatus, setCustomTitleStatus] = useState('');
  const [sellerName, setSellerName] = useState(auction.sellerName ?? (isMainLot ? 'Private Consignor' : ''));

  // Structured Location state (City, Province/State, Country)
  const [locationCity, setLocationCity] = useState(() => {
    if (!auction.location && !isMainLot) return '';
    const parts = (auction.location ?? (isMainLot ? 'Vancouver, BC, Canada' : '')).split(',').map(s => s.trim());
    return parts[0] ?? (isMainLot ? 'Vancouver' : '');
  });
  const [locationRegion, setLocationRegion] = useState(() => {
    if (!auction.location && !isMainLot) return '';
    const parts = (auction.location ?? (isMainLot ? 'Vancouver, BC, Canada' : '')).split(',').map(s => s.trim());
    return parts[1] ?? (isMainLot ? 'BC' : '');
  });
  const [locationCountry, setLocationCountry] = useState(() => {
    if (!auction.location && !isMainLot) return '';
    const parts = (auction.location ?? (isMainLot ? 'Vancouver, BC, Canada' : '')).split(',').map(s => s.trim());
    return parts[2] ?? (isMainLot ? 'Canada' : '');
  });

  const formattedLocation = useMemo(() => {
    return [locationCity.trim(), locationRegion.trim(), locationCountry.trim()].filter(Boolean).join(', ');
  }, [locationCity, locationRegion, locationCountry]);

  // SECTION 2: OVERVIEW NARRATIVE
  const [overviewHeading, setOverviewHeading] = useState(mediaConfig.overviewHeading ?? (isMainLot ? 'Vehicle Overview & Provenance' : ''));
  const [overviewParagraphsText, setOverviewParagraphsText] = useState(() => {
    if (mediaConfig.overviewParagraphs && mediaConfig.overviewParagraphs.length > 0) {
      return mediaConfig.overviewParagraphs.join('\n\n');
    }
    if (isMainLot) {
      return 'Completed at Zuffenhausen and finished in classic Guards Red (027) over a Black sport interior with iconic Houndstooth seat inserts.\n\nPower is supplied by an air-cooled 3.0-liter flat-six paired with a Type 915 five-speed manual transaxle. Factory equipment includes the coveted rubber-lipped Whale Tail rear spoiler, forged Fuchs alloy wheels, front chin spoiler, and power sunroof.';
    }
    return '';
  });
  const [overviewImage, setOverviewImage] = useState(mediaConfig.overviewImage ?? { url: '', caption: '', alt: '' });

  // SECTION 3: TECHNICAL SPECIFICATIONS (Single Source Mirror + Custom Rows)
  const isPrimarySpecLabel = (label: string) => {
    const norm = label.trim().toLowerCase();
    return ['vin', 'odometer', 'mileage', 'engine', 'transmission', 'gearbox', 'drivetrain', 'exterior', 'exterior color', 'interior', 'title', 'title status', 'location'].includes(norm);
  };

  const [customSpecs, setCustomSpecs] = useState<{ label: string; value: string }[]>(() => {
    if (mediaConfig.overviewSpecs && mediaConfig.overviewSpecs.length > 0) {
      return mediaConfig.overviewSpecs.filter(s => !isPrimarySpecLabel(s.label));
    }
    if (isMainLot) {
      return [
        { label: 'Compression', value: '145–150 psi across all 6 cylinders' },
        { label: 'Exhaust', value: 'Stainless steel heat exchangers & Bursch muffler' },
        { label: 'Wheels', value: '16x6 Front & 16x7 Rear Staggered Fuchs' }
      ];
    }
    return [];
  });
  const [newSpecLabel, setNewSpecLabel] = useState('');
  const [newSpecValue, setNewSpecValue] = useState('');

  // Auto-calculated core specs from Section 1
  const primarySpecs = useMemo(() => [
    { label: 'VIN', value: vin },
    { 
      label: 'Odometer', 
      value: mileage 
        ? (mileage.includes('km') || mileage.includes('mi') ? mileage : `${mileage} ${distanceUnit === 'mi' ? 'Miles' : 'km'}`)
        : '' 
    },
    { label: 'Engine', value: engine },
    { label: 'Transmission', value: drivetrain === 'Other' && customDrivetrain ? customDrivetrain : drivetrain },
    { label: 'Exterior Color', value: exteriorColor },
    { label: 'Interior', value: interior },
    { label: 'Title Status', value: titleStatus === 'Other / Custom' && customTitleStatus ? customTitleStatus : titleStatus },
    { label: 'Location', value: formattedLocation }
  ], [vin, mileage, distanceUnit, engine, drivetrain, customDrivetrain, exteriorColor, interior, titleStatus, customTitleStatus, formattedLocation]);

  const compiledOverviewSpecs = useMemo(() => [
    ...primarySpecs.filter(s => s.value.trim() !== ''),
    ...customSpecs.filter(s => s.label.trim() !== '' && s.value.trim() !== '')
  ], [primarySpecs, customSpecs]);

  // SECTION 4: SHOWCASE CHAPTERS (01–04)
  const [showcaseChapters, setShowcaseChapters] = useState<ShowcaseChapter[]>(() => {
    if (mediaConfig.showcaseChapters && mediaConfig.showcaseChapters.length > 0) {
      return mediaConfig.showcaseChapters.map((ch, idx) => normalizeSectionToChapter(ch, idx));
    }
    if (mediaConfig.inlineShowcase && mediaConfig.inlineShowcase.length > 0) {
      return mediaConfig.inlineShowcase.map((sec, idx) => normalizeSectionToChapter(sec, idx));
    }
    return [];
  });

  // SECTION 5: HERO CAROUSEL & FULL PHOTO GALLERY
  const [heroImages, setHeroImages] = useState<string[]>(mediaConfig.heroImages ?? []);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>(mediaConfig.fullGallery ?? []);
  const [newHeroUrl, setNewHeroUrl] = useState('');
  const [newGalleryUrl, setNewGalleryUrl] = useState('');
  const [newGalleryTitle, setNewGalleryTitle] = useState('');
  const [newGalleryCategory, setNewGalleryCategory] = useState<GalleryImage['category']>('exterior');

  // SECTION 6: VIDEOS & DRIVING CHAPTERS
  const [youtubeUrl, setYoutubeUrl] = useState(mediaConfig.youtubePlaylistUrl ?? '');
  const [videoTitle, setVideoTitle] = useState(mediaConfig.videoTitle ?? (isMainLot ? 'Driving Footage & Dynamic Audio' : ''));
  const [videoSubtitle, setVideoSubtitle] = useState(mediaConfig.videoSubtitle ?? (isMainLot ? 'Experience the responsive 3.0L CIS flat-six' : ''));
  const [videoChapters, setVideoChapters] = useState<VideoChapter[]>(mediaConfig.videoChapters ?? []);
  const [fetchingMetadataIdx, setFetchingMetadataIdx] = useState<number | null>(null);

  // SECTION 7: AUCTION FINANCIALS & RULES (CAD)
  const formatForInput = (timestamp: number) => {
    const d = new Date(timestamp);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };

  const [startingBid, setStartingBid] = useState(auction.startingBid ?? 0);
  const [minimumIncrement, setMinimumIncrement] = useState(auction.minimumIncrement ?? 0);
  const [reserveAmount, setReserveAmount] = useState(auction.reserveAmount ?? 0);
  const [status, setStatus] = useState(auction.status ?? 'upcoming');
  const [startTimeInput, setStartTimeInput] = useState(formatForInput(auction.startTime ?? Date.now()));
  const [endTimeInput, setEndTimeInput] = useState(formatForInput(auction.endTime ?? (Date.now() + 7 * 86400000)));

  // Synchronize internal state when active vehicle auction changes
  useEffect(() => {
    const isMain = auction.id === MAIN_AUCTION_ID;
    setTitle(auction.title ?? '');
    setSubtitle(auction.subtitle ?? '');
    setHeadline(auction.headline ?? (isMain ? (auction.title ?? '') : ''));
    setMake(auction.make ?? (isMain ? 'Porsche' : ''));
    setModel(auction.model ?? (isMain ? '911 Turbo-Look' : ''));
    setYear(auction.year ? Number(auction.year) : (isMain ? 1978 : ''));
    setVin(auction.vin ?? '');
    setMileage(auction.mileage ?? '');
    setDistanceUnit(auction.distanceUnit ?? 'km');
    setHighlightsBadge(auction.highlightsBadge ?? (isMain ? (mediaConfig.highlightsBadge ?? '1978 911 SC') : ''));
    setEngine(auction.engine ?? (isMain ? '3.0L Flat-Six CIS' : ''));
    setDrivetrain(auction.drivetrain ?? (isMain ? '5-Speed Manual (915)' : ''));
    setCustomDrivetrain('');
    setExteriorColor(auction.exteriorColor ?? (isMain ? 'Guards Red (027)' : ''));
    setInterior(auction.interior ?? (isMain ? 'Black Leather / Houndstooth' : ''));
    setTitleStatus(auction.titleStatus ?? 'Clean Registration');
    setCustomTitleStatus('');
    setSellerName(auction.sellerName ?? (isMain ? 'Private Consignor' : ''));

    const parts = (auction.location ?? (isMain ? 'Vancouver, BC, Canada' : '')).split(',').map(s => s.trim());
    setLocationCity(parts[0] ?? (isMain ? 'Vancouver' : ''));
    setLocationRegion(parts[1] ?? (isMain ? 'BC' : ''));
    setLocationCountry(parts[2] ?? (isMain ? 'Canada' : ''));

    setStartingBid(auction.startingBid ?? (isMain ? 15000 : 0));
    setMinimumIncrement(auction.minimumIncrement ?? (isMain ? 250 : 0));
    setReserveAmount(auction.reserveAmount ?? 0);
    setStatus(auction.status ?? 'upcoming');
    setStartTimeInput(formatForInput(auction.startTime ?? Date.now()));
    setEndTimeInput(formatForInput(auction.endTime ?? (Date.now() + 7 * 86400000)));
  }, [auction.id]);

  // Synchronize media config state when mediaConfig or auction changes
  useEffect(() => {
    const isMain = auction.id === MAIN_AUCTION_ID;
    setOverviewHeading(mediaConfig.overviewHeading ?? (isMain ? 'Vehicle Overview & Provenance' : ''));
    if (mediaConfig.overviewParagraphs && mediaConfig.overviewParagraphs.length > 0) {
      setOverviewParagraphsText(mediaConfig.overviewParagraphs.join('\n\n'));
    } else if (isMain) {
      setOverviewParagraphsText('Completed at Zuffenhausen and finished in classic Guards Red (027) over a Black sport interior with iconic Houndstooth seat inserts.\n\nPower is supplied by an air-cooled 3.0-liter flat-six paired with a Type 915 five-speed manual transaxle. Factory equipment includes the coveted rubber-lipped Whale Tail rear spoiler, forged Fuchs alloy wheels, front chin spoiler, and power sunroof.');
    } else {
      setOverviewParagraphsText('');
    }
    setOverviewImage(mediaConfig.overviewImage ?? { url: '', caption: '', alt: '' });
    if (mediaConfig.showcaseChapters && mediaConfig.showcaseChapters.length > 0) {
      setShowcaseChapters(mediaConfig.showcaseChapters.map((ch, idx) => normalizeSectionToChapter(ch, idx)));
    } else if (mediaConfig.inlineShowcase && mediaConfig.inlineShowcase.length > 0) {
      setShowcaseChapters(mediaConfig.inlineShowcase.map((sec, idx) => normalizeSectionToChapter(sec, idx)));
    } else {
      setShowcaseChapters([]);
    }
    setHeroImages(mediaConfig.heroImages ?? []);
    setGalleryImages(mediaConfig.fullGallery ?? []);
    setYoutubeUrl(mediaConfig.youtubePlaylistUrl ?? '');
    setVideoTitle(mediaConfig.videoTitle ?? (isMain ? 'Cold Start, Driving Footage & 360 Walkaround' : ''));
    setVideoSubtitle(mediaConfig.videoSubtitle ?? (isMain ? 'Complete high-definition video playlist.' : ''));
    setVideoChapters(mediaConfig.videoChapters ?? []);
    if (mediaConfig.overviewSpecs && mediaConfig.overviewSpecs.length > 0) {
      setCustomSpecs(mediaConfig.overviewSpecs.filter(s => !isPrimarySpecLabel(s.label)));
    } else if (isMain) {
      setCustomSpecs([
        { label: 'Compression', value: '145–150 psi across all 6 cylinders' },
        { label: 'Exhaust', value: 'Stainless steel heat exchangers & Bursch muffler' },
        { label: 'Wheels', value: '16x6 Front & 16x7 Rear Staggered Fuchs' }
      ]);
    } else {
      setCustomSpecs([]);
    }
  }, [auction.id, mediaConfig]);

  // Progress Stepper Status Computations
  const stepStatuses = useMemo(() => {
    const s1Missing = [!title && 'Title', !vin && 'VIN', !make && 'Make', !model && 'Model'].filter(Boolean);
    const s1Status = s1Missing.length === 0 ? 'complete' : `${s1Missing.length} needed`;

    const s2Status = overviewParagraphsText.trim().length > 50 ? 'complete' : 'draft';
    const s3Status = compiledOverviewSpecs.length >= 6 ? 'complete' : `${compiledOverviewSpecs.length} specs`;
    const s4Status = showcaseChapters.length > 0 ? 'complete' : 'draft';
    const s5Status = heroImages.length > 0 && galleryImages.length > 0 ? 'complete' : (heroImages.length === 0 ? 'No hero' : 'draft');
    const s6Status = videoChapters.length > 0 ? 'complete' : 'optional';
    const s7Status = startingBid > 0 && minimumIncrement > 0 ? 'complete' : 'review';

    return [
      { id: 1, label: 'Vehicle Identity', anchor: 'sec-identity', status: s1Status, icon: Car },
      { id: 2, label: 'Narrative & Story', anchor: 'sec-narrative', status: s2Status, icon: FileText },
      { id: 3, label: 'Technical Specs', anchor: 'sec-specs', status: s3Status, icon: Sliders },
      { id: 4, label: 'Showcase Chapters', anchor: 'sec-showcase', status: s4Status, icon: BookOpen },
      { id: 5, label: 'Hero & Gallery', anchor: 'sec-gallery', status: s5Status, icon: ImageIcon },
      { id: 6, label: 'Videos & Driving', anchor: 'sec-videos', status: s6Status, icon: Video },
      { id: 7, label: 'Financials & Dates', anchor: 'sec-financials', status: s7Status, icon: DollarSign }
    ];
  }, [title, vin, make, model, overviewParagraphsText, compiledOverviewSpecs, showcaseChapters, heroImages, galleryImages, videoChapters, startingBid, minimumIncrement]);

  // Scroll smoothly to section anchor
  const scrollToSection = (anchorId: string, stepId: number) => {
    setActiveStep(stepId);
    const el = document.getElementById(anchorId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // MASTER SAVE HANDLER
  const handleSaveWorkspace = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const finalGearbox = drivetrain === 'Other' && customDrivetrain ? customDrivetrain : drivetrain;
      const finalTitleStatus = titleStatus === 'Other / Custom' && customTitleStatus ? customTitleStatus : titleStatus;
      const startMs = new Date(startTimeInput).getTime() || auction.startTime;
      const endMs = new Date(endTimeInput).getTime() || auction.endTime;
      const isReserveMet = (auction.currentBid || 0) >= Number(reserveAmount);

      // 1. Update Core Auction Document
      await onUpdateAuction({
        title,
        subtitle,
        headline: headline || title,
        make,
        model,
        year,
        vin,
        mileage,
        distanceUnit,
        location: formattedLocation,
        sellerName,
        engine,
        drivetrain: finalGearbox,
        exteriorColor,
        interior,
        titleStatus: finalTitleStatus,
        highlightsBadge,
        currency: 'CAD',
        startingBid: Number(startingBid),
        minimumIncrement: Number(minimumIncrement),
        reserveAmount: Number(reserveAmount),
        status,
        startTime: startMs,
        endTime: endMs,
        isReserveMet
      });

      // 2. Update Media Configuration
      const paragraphs = overviewParagraphsText
        .split('\n\n')
        .map(p => p.trim())
        .filter(Boolean);

      const updatedMedia: MediaConfiguration = {
        ...mediaConfig,
        vehicleName: title,
        highlightsBadge,
        distanceUnit,
        overviewHeading,
        overviewParagraphs: paragraphs,
        overviewImage: overviewImage.url ? overviewImage : undefined,
        overviewSpecs: compiledOverviewSpecs,
        inlineShowcase: showcaseChapters.map(chapterToSection),
        showcaseChapters,
        heroImages,
        fullGallery: galleryImages,
        videoTitle,
        videoSubtitle,
        youtubePlaylistUrl: youtubeUrl,
        videoChapters
      };

      await onUpdateMediaConfig(updatedMedia);

      setMessage({ type: 'success', text: 'All listing specifications, narrative chapters, and media saved successfully to Firestore!' });
      setTimeout(() => setMessage(null), 4500);
    } catch (err: any) {
      console.error('Error saving listing workspace:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to save changes.' });
    } finally {
      setSaving(false);
    }
  };

  // EXPORT JSON ACTION (ListingDraftSchema)
  const handleExportJson = () => {
    const finalGearbox = drivetrain === 'Other' && customDrivetrain ? customDrivetrain : drivetrain;
    const finalTitleStatus = titleStatus === 'Other / Custom' && customTitleStatus ? customTitleStatus : titleStatus;
    const paragraphs = overviewParagraphsText.split('\n\n').map(p => p.trim()).filter(Boolean);

    const draftData: ListingDraftSchema = {
      title,
      subtitle,
      year,
      make,
      model,
      vin,
      mileage,
      distanceUnit,
      location: formattedLocation,
      engine,
      gearbox: finalGearbox,
      exteriorColor,
      interior,
      titleStatus: finalTitleStatus,
      sellerName,
      highlightsBadge,
      overviewHeading,
      overviewNarrative: paragraphs,
      specifications: compiledOverviewSpecs,
      showcaseChapters: showcaseChapters.map((ch, idx) => ({
        chapterNumber: String(idx + 1).padStart(2, '0'),
        title: ch.title,
        subtitle: ch.subtitle,
        featureBullets: ch.highlights,
        bottomAttributeCards: ch.specCards.map(s => ({
          label: s.key,
          value: s.value
        }))
      })),
      financials: {
        currency: 'CAD',
        startingBid: Number(startingBid),
        minimumIncrement: Number(minimumIncrement),
        reserveAmount: Number(reserveAmount),
        durationDays: 7
      }
    };

    const jsonString = JSON.stringify(draftData, null, 2);
    navigator.clipboard.writeText(jsonString).then(() => {
      setMessage({ type: 'success', text: 'ListingDraftSchema JSON copied to clipboard!' });
      setTimeout(() => setMessage(null), 4000);
    }).catch(() => {
      setMessage({ type: 'error', text: 'Failed to copy to clipboard.' });
    });
  };

  // IMPORT JSON ACTION (ListingDraftSchema)
  const handleApplyImportJson = () => {
    setImportError(null);
    if (!importJsonText.trim()) {
      setImportError('Please paste a JSON payload first.');
      return;
    }

    try {
      const parsed: ListingDraftSchema = JSON.parse(importJsonText);

      if (!parsed.title || !parsed.vin) {
        setImportError('Invalid schema: "title" and "vin" are required keys.');
        return;
      }

      // Hydrate Section 1
      if (parsed.title) setTitle(parsed.title);
      if (parsed.subtitle) setSubtitle(parsed.subtitle);
      if (parsed.year) setYear(Number(parsed.year));
      if (parsed.make) setMake(parsed.make);
      if (parsed.model) setModel(parsed.model);
      if (parsed.vin) setVin(parsed.vin);
      if (parsed.mileage !== undefined) setMileage(String(parsed.mileage));
      if (parsed.distanceUnit) setDistanceUnit(parsed.distanceUnit);
      if (parsed.highlightsBadge) setHighlightsBadge(parsed.highlightsBadge);
      if (parsed.engine) setEngine(parsed.engine);
      if (parsed.exteriorColor) setExteriorColor(parsed.exteriorColor);
      if (parsed.interior) setInterior(parsed.interior);
      if (parsed.sellerName) setSellerName(parsed.sellerName);

      if (parsed.gearbox) {
        if (GEARBOX_OPTIONS.includes(parsed.gearbox)) {
          setDrivetrain(parsed.gearbox);
          setCustomDrivetrain('');
        } else {
          setDrivetrain('Other');
          setCustomDrivetrain(parsed.gearbox);
        }
      }

      if (parsed.titleStatus) {
        if (TITLE_STATUS_OPTIONS.includes(parsed.titleStatus)) {
          setTitleStatus(parsed.titleStatus);
          setCustomTitleStatus('');
        } else {
          setTitleStatus('Other / Custom');
          setCustomTitleStatus(parsed.titleStatus);
        }
      }

      if (parsed.location) {
        const parts = parsed.location.split(',').map(s => s.trim());
        if (parts[0]) setLocationCity(parts[0]);
        if (parts[1]) setLocationRegion(parts[1]);
        if (parts[2]) setLocationCountry(parts[2]);
      }

      // Hydrate Section 2
      if (parsed.overviewHeading) setOverviewHeading(parsed.overviewHeading);
      if (Array.isArray(parsed.overviewNarrative)) {
        setOverviewParagraphsText(parsed.overviewNarrative.join('\n\n'));
      }

      // Hydrate Section 3
      if (Array.isArray(parsed.specifications)) {
        const customRows = parsed.specifications.filter(s => !isPrimarySpecLabel(s.label));
        setCustomSpecs(customRows);
      }

      // Hydrate Section 4
      if (Array.isArray(parsed.showcaseChapters) && parsed.showcaseChapters.length > 0) {
        const converted = parsed.showcaseChapters.map((ch, i) => normalizeSectionToChapter(ch, i));
        setShowcaseChapters(converted);
      }

      // Hydrate Section 7
      if (parsed.financials) {
        if (parsed.financials.startingBid) setStartingBid(parsed.financials.startingBid);
        if (parsed.financials.minimumIncrement) setMinimumIncrement(parsed.financials.minimumIncrement);
        if (parsed.financials.reserveAmount !== undefined) setReserveAmount(parsed.financials.reserveAmount);
      }

      setShowImportModal(false);
      setImportJsonText('');
      setMessage({ type: 'success', text: 'Listing draft successfully populated from JSON payload!' });
      setTimeout(() => setMessage(null), 4000);
    } catch (e: any) {
      setImportError(`JSON Parse Error: ${e.message}`);
    }
  };

  // + NEW LISTING WORKFLOW
  const handleCreateNewListing = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = newListingTitle.trim();
    if (!cleanTitle) return;

    setCreatingListing(true);
    try {
      const newLot = await createNewListing(cleanTitle);
      setMessage({
        type: 'success',
        text: `Created new listing lot: "${newLot.title}"`
      });
      setShowNewListingModal(false);
      setNewListingTitle('');
      if (onSelectAuction) {
        onSelectAuction(newLot.id);
      } else {
        window.history.pushState({}, '', `/dashboard/listings/${newLot.id}/edit`);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    } catch (err: any) {
      console.error('Error creating new listing:', err);
      setMessage({
        type: 'error',
        text: `Failed to create new listing: ${err?.message || 'Unknown error'}`
      });
    } finally {
      setCreatingListing(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  // FILE UPLOAD HANDLER
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
    const validFiles: File[] = files.filter(f => f.size <= 12 * 1024 * 1024);

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

      if (activeUploadTarget.type === 'hero') {
        const urls = readResults.map(r => r.dataUrl);
        setHeroImages(prev => [...prev, ...urls]);
      } else if (activeUploadTarget.type === 'gallery') {
        const cat = activeUploadTarget.category || newGalleryCategory || 'exterior';
        const newItems: GalleryImage[] = readResults.map((r, i) => {
          const isPdf = r.name.toLowerCase().endsWith('.pdf') || r.dataUrl.startsWith('data:application/pdf');
          return {
            id: `img-${Date.now()}-${i}`,
            url: r.dataUrl,
            title: r.cleanedName || (isPdf ? 'Vehicle Inspection Report' : 'Vehicle Photo'),
            caption: isPdf ? 'Inspection Report / Document' : r.cleanedName,
            category: isPdf ? 'documentation' : cat,
            isPdf
          };
        });
        setGalleryImages(prev => [...prev, ...newItems]);
      } else if (activeUploadTarget.type === 'showcase' && activeUploadTarget.showcaseIndex !== undefined) {
        const cIdx = activeUploadTarget.showcaseIndex;
        const copy = [...showcaseChapters];
        if (copy[cIdx]) {
          copy[cIdx] = {
            ...copy[cIdx],
            photoUrl: readResults[0].dataUrl,
            photoCaption: readResults[0].cleanedName || copy[cIdx].title
          };
          setShowcaseChapters(copy);
        }
      } else if (activeUploadTarget.type === 'overview') {
        setOverviewImage({
          url: readResults[0].dataUrl,
          caption: readResults[0].cleanedName,
          alt: readResults[0].cleanedName
        });
      }

      setMessage({ type: 'success', text: `Uploaded ${readResults.length} file(s)!` });
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setMessage({ type: 'error', text: 'Error reading uploaded files.' });
    }
  };

  // Select Photo from Existing Gallery Modal
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
      const copy = [...showcaseChapters];
      if (copy[idx]) {
        copy[idx] = {
          ...copy[idx],
          photoUrl: selectedUrl,
          photoCaption: caption || copy[idx].title
        };
        setShowcaseChapters(copy);
      }
    } else if (pickerTarget.type === 'hero') {
      setHeroImages(prev => [...prev, selectedUrl]);
    } else if (pickerTarget.type === 'gallery') {
      const newImg: GalleryImage = {
        id: `img-${Date.now()}`,
        url: selectedUrl,
        title: caption || 'Porsche 911 Detail',
        caption: caption,
        category: (pickerFilterCategory !== 'all' ? pickerFilterCategory : 'exterior') as any
      };
      setGalleryImages(prev => [...prev, newImg]);
    }

    setPickerTarget(null);
  };

  // Hero Image Reordering & Management
  const handleMoveHero = (index: number, direction: 'left' | 'right') => {
    const targetIdx = direction === 'left' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= heroImages.length) return;
    const copy = [...heroImages];
    const temp = copy[index];
    copy[index] = copy[targetIdx];
    copy[targetIdx] = temp;
    setHeroImages(copy);
  };

  const handleHeroDragStart = (e: React.DragEvent, index: number) => {
    setDraggedHeroIdx(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleHeroDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedHeroIdx === null || draggedHeroIdx === targetIndex) return;
    const copy = [...heroImages];
    const moved = copy.splice(draggedHeroIdx, 1)[0];
    copy.splice(targetIndex, 0, moved);
    setHeroImages(copy);
    setDraggedHeroIdx(null);
  };

  const handleAddHeroImage = () => {
    if (!newHeroUrl.trim()) return;
    setHeroImages(prev => [...prev, newHeroUrl.trim()]);
    setNewHeroUrl('');
  };

  const handleAddGalleryImage = () => {
    if (!newGalleryUrl.trim()) return;
    const isPdf = newGalleryUrl.toLowerCase().endsWith('.pdf') || newGalleryUrl.includes('.pdf');
    const newImg: GalleryImage = {
      id: `img-${Date.now()}`,
      url: newGalleryUrl.trim(),
      title: newGalleryTitle.trim() || (isPdf ? 'Inspection Report / Document' : 'Vehicle Photo'),
      caption: newGalleryTitle.trim(),
      category: isPdf ? 'documentation' : newGalleryCategory,
      isPdf
    };
    setGalleryImages(prev => [...prev, newImg]);
    setNewGalleryUrl('');
    setNewGalleryTitle('');
  };

  const handleUpdateGalleryCategory = (index: number, newCategory: GalleryImage['category']) => {
    const copy = [...galleryImages];
    copy[index] = { ...copy[index], category: newCategory };
    setGalleryImages(copy);
  };

  // YouTube Metadata Fetchers
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
      const copy = videoChapters.map(c => ({ ...c }));
      
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

      if (meta.thumbnailUrl) {
        copy[index].thumbnailUrl = meta.thumbnailUrl;
      }

      if (meta.duration && (meta.isExactDuration || !copy[index].duration || copy[index].duration === '00:00' || copy[index].duration === '')) {
        copy[index].duration = meta.duration;
      }

      if (meta.description) {
        copy[index].description = meta.description;
      }

      setVideoChapters(copy);
      setMetadataFetchSuccess(`Fetched: "${meta.title}" (${copy[index].duration || 'HD'})`);
      setTimeout(() => setMetadataFetchSuccess(null), 4000);
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

  const handleFetchAllChapters = async () => {
    const chaptersWithUrls = videoChapters
      .map((c, i) => ({ ...c, originalIndex: i }))
      .filter(c => c.videoUrl && c.videoUrl.trim() !== '');

    if (chaptersWithUrls.length === 0) {
      setMessage({
        type: 'error',
        text: 'No video chapters have valid YouTube URLs to fetch.'
      });
      return;
    }

    setIsFetchingAllVideos(true);
    let successCount = 0;
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
        if (meta.duration) {
          copy[idx].duration = meta.duration;
        }
        if (meta.description) {
          copy[idx].description = meta.description;
        }
        successCount++;
      } catch (e) {
        console.warn(`Failed metadata for index ${item.originalIndex}:`, e);
      }
    }

    setVideoChapters(copy);
    setIsFetchingAllVideos(false);
    setMessage({
      type: 'success',
      text: `Successfully updated metadata for ${successCount} video chapter(s)!`
    });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleMoveVideoChapter = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= videoChapters.length) return;
    const copy = [...videoChapters];
    const temp = copy[index];
    copy[index] = copy[targetIdx];
    copy[targetIdx] = temp;
    setVideoChapters(copy);
  };

  return (
    <div className="min-h-screen bg-[#0f1215] text-zinc-100 flex flex-col font-sans">
      {/* Hidden File Input for Image/PDF Uploads */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelected}
        accept="image/png, image/jpeg, image/webp, image/gif, application/pdf"
        multiple
        className="hidden"
      />

      {/* TOP WORKSPACE NAVIGATION & CONTROLS BAR */}
      <header className="sticky top-0 z-40 bg-[#14181d] border-b border-zinc-800 px-4 sm:px-6 py-3 flex items-center justify-between gap-4 shadow-lg">
        {/* Left: Back Action & Breadcrumb */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBackToPublic}
            className="p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
            title="Return to Public Auction View"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden md:inline">Public View</span>
          </button>

          <div className="h-5 w-[1px] bg-zinc-700 hidden sm:block" />

          {/* Select Vehicle Listing Dropdown */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs shadow-inner">
              <Car className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
              <label htmlFor="select-vehicle-listing" className="text-[10px] uppercase font-bold text-zinc-400 hidden lg:inline flex-shrink-0">
                Lot:
              </label>
              <select
                id="select-vehicle-listing"
                value={auction.id}
                onChange={(e) => {
                  const targetId = e.target.value;
                  if (targetId && targetId !== auction.id) {
                    if (onSelectAuction) {
                      onSelectAuction(targetId);
                    } else {
                      window.history.pushState({}, '', `/dashboard/listings/${targetId}/edit`);
                      window.dispatchEvent(new PopStateEvent('popstate'));
                    }
                  }
                }}
                className="bg-transparent text-white font-bold text-xs border-0 focus:ring-0 focus:outline-none cursor-pointer pr-1 max-w-[130px] sm:max-w-[190px] md:max-w-[240px] truncate"
                title="Select vehicle listing inventory to edit"
              >
                {availableAuctions.map((lot) => (
                  <option key={lot.id} value={lot.id} className="bg-zinc-900 text-white font-normal py-1">
                    {lot.title || lot.id} {lot.status ? `(${lot.status.toUpperCase()})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Center: View Mode Segmented Switcher */}
        <div className="hidden lg:flex items-center bg-zinc-900 border border-zinc-700/80 rounded-xl p-1 shadow-inner text-xs font-semibold">
          <button
            type="button"
            onClick={() => setViewMode('split')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'split' ? 'bg-red-700 text-white shadow-sm' : 'text-zinc-400 hover:text-white'
            }`}
            title="Split-Screen: Form Controls (Left) & Live Preview (Right)"
          >
            <Split className="w-3.5 h-3.5" />
            <span>Split View</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('form')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'form' ? 'bg-red-700 text-white shadow-sm' : 'text-zinc-400 hover:text-white'
            }`}
            title="Full-Width Form Editor"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Edit Form</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('preview')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'preview' ? 'bg-red-700 text-white shadow-sm' : 'text-zinc-400 hover:text-white'
            }`}
            title="Full-Width Live Public Preview"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Live Preview</span>
          </button>
        </div>

        {/* Right: Actions (Import/Export, + New Listing, Save) */}
        <div className="flex items-center gap-2">
          {/* JSON Tools */}
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Import ListingDraftSchema JSON payload"
          >
            <Upload className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Import JSON</span>
          </button>

          <button
            type="button"
            onClick={handleExportJson}
            className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Copy clean ListingDraftSchema JSON to clipboard"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Export JSON</span>
          </button>

          {/* + New Listing */}
          <button
            type="button"
            onClick={() => setShowNewListingModal(true)}
            className="px-2.5 py-1.5 rounded-lg bg-emerald-950/90 hover:bg-emerald-900 text-emerald-300 hover:text-white border border-emerald-800/80 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Create a new vehicle listing lot"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">+ New Listing</span>
            <span className="sm:hidden">+ New</span>
          </button>

          {/* Master Save */}
          <button
            type="button"
            onClick={handleSaveWorkspace}
            disabled={saving}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md transition-all ${
              saving 
                ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed' 
                : 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer active:scale-95'
            }`}
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      </header>

      {/* GLOBAL TOAST / FEEDBACK BANNER */}
      {message && (
        <div className={`px-6 py-2.5 text-xs font-semibold flex items-center justify-between border-b transition-all ${
          message.type === 'success' 
            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80' 
            : 'bg-red-950/80 text-red-300 border-red-800/80'
        }`}>
          <div className="flex items-center gap-2">
            {message.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-400" />
            )}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-zinc-400 hover:text-white text-sm">✕</button>
        </div>
      )}

      {/* MAIN WORKSPACE BODY */}
      <div className="flex-1 flex overflow-hidden">
        {/* =================================================================== */}
        {/* LEFT PANE: VERTICAL STEPPER + FORM CONTROLS */}
        {/* =================================================================== */}
        <div className={`flex flex-col bg-[#111418] border-r border-zinc-800 ${
          viewMode === 'preview' 
            ? 'hidden' 
            : viewMode === 'form' 
              ? 'w-full' 
              : 'w-full lg:w-[60%]'
        }`}>
          <div className="flex flex-1 overflow-hidden">
            {/* Sticky Vertical Progress Stepper */}
            <aside className="sticky top-6 self-start max-h-[calc(100vh-3rem)] overflow-y-auto w-48 sm:w-56 bg-[#161a20] border-r border-zinc-800 p-3 flex flex-col justify-between flex-shrink-0 select-none z-20">
              <div className="space-y-1">
                <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Listing Sections
                </div>
                {stepStatuses.map((step) => {
                  const Icon = step.icon;
                  const isActive = activeStep === step.id;
                  const isComplete = step.status === 'complete';
                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => scrollToSection(step.anchor, step.id)}
                      className={`w-full text-left p-2.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 transition-all cursor-pointer ${
                        isActive 
                          ? 'bg-red-700 text-white shadow-sm' 
                          : 'text-zinc-300 hover:bg-zinc-800/70 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-white' : 'text-zinc-400'}`} />
                        <span className="truncate">{step.label}</span>
                      </div>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded flex-shrink-0 ${
                        isComplete 
                          ? (isActive ? 'bg-white/20 text-white' : 'bg-emerald-950 text-emerald-400 border border-emerald-800/50')
                          : (isActive ? 'bg-black/20 text-white' : 'bg-zinc-800 text-zinc-400')
                      }`}>
                        {isComplete ? '✓' : step.status}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="pt-4 border-t border-zinc-800/80 px-2 space-y-2 text-[11px] text-zinc-400">
                <div className="flex items-center justify-between">
                  <span>Currency:</span>
                  <span className="font-bold text-zinc-200">CAD ($)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Distance:</span>
                  <span className="font-bold text-zinc-200 uppercase">{distanceUnit}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Specs Live:</span>
                  <span className="font-bold text-emerald-400">{compiledOverviewSpecs.length} rows</span>
                </div>
              </div>
            </aside>

            {/* Scrollable Form Content */}
            <main className={`flex-1 p-4 sm:p-6 overflow-y-auto space-y-8 ${
              viewMode === 'form' ? 'w-full max-w-6xl mx-auto' : 'w-full'
            }`}>
              {/* SECTION 1: VEHICLE IDENTITY */}
              <section id="sec-identity" className="bg-[#181d24] rounded-2xl border border-zinc-800 p-5 sm:p-6 space-y-5 scroll-mt-6">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <div className="flex items-center gap-2 text-zinc-100 font-bold text-base">
                    <Car className="w-5 h-5 text-red-500" />
                    <h3>1. Vehicle Identity & Header Specs</h3>
                  </div>
                  <span className="text-[11px] text-zinc-400 font-mono">Section 1</span>
                </div>

                <div className="space-y-4 text-xs">
                  <div>
                    <label className="block font-bold text-zinc-300 mb-1">Listing Title</label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. 1978 Porsche 911 SC 'Whale Tail' Coupe"
                      className="w-full p-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:border-red-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-zinc-300 mb-1">Subtitle / Highlights Bar</label>
                    <input
                      type="text"
                      value={subtitle}
                      onChange={(e) => setSubtitle(e.target.value)}
                      placeholder="e.g. 3.0L Flat-Six • 5-Speed 915 • Guards Red (027)"
                      className="w-full p-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:border-red-500 focus:outline-none"
                    />
                  </div>

                  {/* Year, Make, Model Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-bold text-zinc-300 mb-1">Year</label>
                      <select
                        value={year}
                        onChange={(e) => setYear(Number(e.target.value))}
                        className="w-full p-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:border-red-500 focus:outline-none cursor-pointer"
                      >
                        {YEAR_OPTIONS.map((y) => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-zinc-300 mb-1">Make</label>
                      <input
                        type="text"
                        value={make}
                        onChange={(e) => setMake(e.target.value)}
                        placeholder="Porsche"
                        className="w-full p-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:border-red-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-zinc-300 mb-1">Model</label>
                      <input
                        type="text"
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        placeholder="911 SC"
                        className="w-full p-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:border-red-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* VIN & Odometer */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-zinc-300 mb-1">VIN (Vehicle Identification Number)</label>
                      <input
                        type="text"
                        value={vin}
                        onChange={(e) => setVin(e.target.value.toUpperCase())}
                        placeholder="9118200142"
                        className="w-full p-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-white font-mono uppercase focus:border-red-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-bold text-zinc-300">Odometer Reading</label>
                        <div className="flex items-center gap-1 bg-zinc-900 rounded p-0.5 border border-zinc-700">
                          <button
                            type="button"
                            onClick={() => setDistanceUnit('km')}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${distanceUnit === 'km' ? 'bg-red-700 text-white' : 'text-zinc-400'}`}
                          >
                            KM
                          </button>
                          <button
                            type="button"
                            onClick={() => setDistanceUnit('mi')}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${distanceUnit === 'mi' ? 'bg-red-700 text-white' : 'text-zinc-400'}`}
                          >
                            MI
                          </button>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={mileage}
                        onChange={(e) => setMileage(e.target.value)}
                        placeholder="42,150"
                        className="w-full p-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:border-red-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Engine & Standardized Gearbox */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-zinc-300 mb-1">Engine Specification</label>
                      <input
                        type="text"
                        value={engine}
                        onChange={(e) => setEngine(e.target.value)}
                        placeholder="3.0L Flat-Six CIS"
                        className="w-full p-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:border-red-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-zinc-300 mb-1">Drivetrain / Gearbox</label>
                      <select
                        value={drivetrain}
                        onChange={(e) => setDrivetrain(e.target.value)}
                        className="w-full p-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:border-red-500 focus:outline-none cursor-pointer"
                      >
                        {GEARBOX_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                      {drivetrain === 'Other' && (
                        <input
                          type="text"
                          value={customDrivetrain}
                          onChange={(e) => setCustomDrivetrain(e.target.value)}
                          placeholder="Specify custom gearbox / transaxle..."
                          className="w-full mt-2 p-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white text-xs"
                        />
                      )}
                    </div>
                  </div>

                  {/* Colors */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-zinc-300 mb-1">Exterior Finish</label>
                      <input
                        type="text"
                        value={exteriorColor}
                        onChange={(e) => setExteriorColor(e.target.value)}
                        placeholder="Guards Red (027)"
                        className="w-full p-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:border-red-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-zinc-300 mb-1">Interior / Cabin</label>
                      <input
                        type="text"
                        value={interior}
                        onChange={(e) => setInterior(e.target.value)}
                        placeholder="Black Leather / Houndstooth"
                        className="w-full p-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:border-red-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Standardized Title Status */}
                  <div>
                    <label className="block font-bold text-zinc-300 mb-1">Title & Registration Status</label>
                    <select
                      value={titleStatus}
                      onChange={(e) => setTitleStatus(e.target.value)}
                      className="w-full p-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:border-red-500 focus:outline-none cursor-pointer"
                    >
                      {TITLE_STATUS_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    {titleStatus === 'Other / Custom' && (
                      <input
                        type="text"
                        value={customTitleStatus}
                        onChange={(e) => setCustomTitleStatus(e.target.value)}
                        placeholder="Specify custom title/registration details..."
                        className="w-full mt-2 p-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white text-xs"
                      />
                    )}
                  </div>

                  {/* Standardized Structured Location Fields */}
                  <div className="p-3 bg-zinc-900/80 rounded-xl border border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-zinc-300 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-red-500" />
                        <span>Structured Vehicle Location</span>
                      </label>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        Preview: {formattedLocation || 'Not set'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <span className="text-[10px] text-zinc-400 font-semibold mb-1 block">City</span>
                        <input
                          type="text"
                          value={locationCity}
                          onChange={(e) => setLocationCity(e.target.value)}
                          placeholder="Vancouver"
                          className="w-full p-2 rounded-lg bg-black border border-zinc-700 text-white text-xs"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-400 font-semibold mb-1 block">Province / State</span>
                        <input
                          type="text"
                          value={locationRegion}
                          onChange={(e) => setLocationRegion(e.target.value)}
                          placeholder="BC"
                          className="w-full p-2 rounded-lg bg-black border border-zinc-700 text-white text-xs"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-400 font-semibold mb-1 block">Country</span>
                        <input
                          type="text"
                          value={locationCountry}
                          onChange={(e) => setLocationCountry(e.target.value)}
                          placeholder="Canada"
                          className="w-full p-2 rounded-lg bg-black border border-zinc-700 text-white text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Seller & Highlights Badge */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-zinc-300 mb-1">Seller / Consignor Name</label>
                      <input
                        type="text"
                        value={sellerName}
                        onChange={(e) => setSellerName(e.target.value)}
                        placeholder="Private Consignor"
                        className="w-full p-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:border-red-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-zinc-300 mb-1">Highlights Tag Badge</label>
                      <input
                        type="text"
                        value={highlightsBadge}
                        onChange={(e) => setHighlightsBadge(e.target.value)}
                        placeholder="1978 911 SC"
                        className="w-full p-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:border-red-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* SECTION 2: NARRATIVE & STORY */}
              <section id="sec-narrative" className="bg-[#181d24] rounded-2xl border border-zinc-800 p-5 sm:p-6 space-y-5 scroll-mt-6">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <div className="flex items-center gap-2 text-zinc-100 font-bold text-base">
                    <FileText className="w-5 h-5 text-red-500" />
                    <h3>2. Narrative & Provenance Prose</h3>
                  </div>
                  <span className="text-[11px] text-zinc-400 font-mono">Section 2</span>
                </div>

                <div className="space-y-4 text-xs">
                  <div>
                    <label className="block font-bold text-zinc-300 mb-1">Overview Section Heading</label>
                    <input
                      type="text"
                      value={overviewHeading}
                      onChange={(e) => setOverviewHeading(e.target.value)}
                      placeholder="Vehicle Overview & Provenance"
                      className="w-full p-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:border-red-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bold text-zinc-300">Listing Prose Narrative</label>
                      <span className="text-[10px] text-zinc-400">Separate paragraphs with double line breaks</span>
                    </div>
                    <textarea
                      rows={7}
                      value={overviewParagraphsText}
                      onChange={(e) => setOverviewParagraphsText(e.target.value)}
                      placeholder="Write detailed provenance, history, restoration details, and options..."
                      className="w-full p-3 rounded-lg bg-zinc-900 border border-zinc-700 text-white leading-relaxed focus:border-red-500 focus:outline-none"
                    />
                  </div>
                </div>
              </section>

              {/* SECTION 3: TECHNICAL SPECIFICATIONS */}
              <section id="sec-specs" className="bg-[#181d24] rounded-2xl border border-zinc-800 p-5 sm:p-6 space-y-5 scroll-mt-6">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <div className="flex items-center gap-2 text-zinc-100 font-bold text-base">
                    <Sliders className="w-5 h-5 text-red-500" />
                    <h3>3. Technical Specifications Table</h3>
                  </div>
                  <span className="text-[11px] text-zinc-400 font-mono">Section 3</span>
                </div>

                {/* Single-Source Auto-Sync Banner */}
                <div className="p-3 bg-red-950/30 border border-red-800/50 rounded-xl text-xs flex items-start gap-2.5 text-zinc-300">
                  <Sparkles className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    Core vehicle specs are <strong>automatically synchronized directly from Section 1</strong>. You never need to type them twice. Append additional custom rows below.
                  </p>
                </div>

                {/* Core Specs Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  {primarySpecs.map((spec, pIdx) => (
                    <div key={pIdx} className="p-2 bg-zinc-900/90 border border-zinc-800 rounded-lg">
                      <div className="text-[10px] font-bold text-zinc-500 uppercase">{spec.label}</div>
                      <div className="font-semibold text-zinc-200 truncate mt-0.5">{spec.value || '—'}</div>
                    </div>
                  ))}
                </div>

                {/* Custom Specs Rows */}
                <div className="space-y-3 pt-3 border-t border-zinc-800">
                  <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
                    <span>Additional Custom Specifications ({customSpecs.length})</span>
                  </div>

                  {customSpecs.map((spec, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs">
                      <input
                        type="text"
                        value={spec.label}
                        onChange={(e) => {
                          const copy = [...customSpecs];
                          copy[idx].label = e.target.value;
                          setCustomSpecs(copy);
                        }}
                        className="w-1/3 p-1.5 rounded bg-black border border-zinc-700 text-zinc-200 font-bold"
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
                        className="flex-1 p-1.5 rounded bg-black border border-zinc-700 text-zinc-200"
                        placeholder="Value"
                      />
                      <button
                        type="button"
                        onClick={() => setCustomSpecs(customSpecs.filter((_, i) => i !== idx))}
                        className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  {/* Add New Custom Spec Row */}
                  <div className="flex items-center gap-2 p-2.5 bg-zinc-900/60 border border-dashed border-zinc-700 rounded-xl">
                    <input
                      type="text"
                      value={newSpecLabel}
                      onChange={(e) => setNewSpecLabel(e.target.value)}
                      placeholder="Spec label (e.g. Differential, Exhaust)"
                      className="w-1/3 p-2 rounded-lg bg-black border border-zinc-700 text-xs text-white"
                    />
                    <input
                      type="text"
                      value={newSpecValue}
                      onChange={(e) => setNewSpecValue(e.target.value)}
                      placeholder="Spec value"
                      className="flex-1 p-2 rounded-lg bg-black border border-zinc-700 text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (newSpecLabel.trim() && newSpecValue.trim()) {
                          setCustomSpecs(prev => [...prev, { label: newSpecLabel.trim(), value: newSpecValue.trim() }]);
                          setNewSpecLabel('');
                          setNewSpecValue('');
                        }
                      }}
                      className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs"
                    >
                      + Add
                    </button>
                  </div>
                </div>
              </section>

              {/* SECTION 4: SHOWCASE CHAPTERS */}
              <section id="sec-showcase" className="bg-[#181d24] rounded-2xl border border-zinc-800 p-5 sm:p-6 space-y-5 scroll-mt-6">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <div className="flex items-center gap-2 text-zinc-100 font-bold text-base">
                    <BookOpen className="w-5 h-5 text-red-500" />
                    <h3>4. Curated Showcase Chapters</h3>
                  </div>
                  <span className="text-[11px] text-zinc-400 font-mono">{showcaseChapters.length} Chapters</span>
                </div>

                <ShowcaseChaptersEditor
                  chapters={showcaseChapters}
                  onChange={setShowcaseChapters}
                  onOpenGalleryPicker={(chapterIndex) => setPickerTarget({ type: 'showcase', showcaseIndex: chapterIndex })}
                  onTriggerFileUpload={(chapterIndex) => triggerFileUpload({ type: 'showcase', showcaseIndex: chapterIndex })}
                />
              </section>

              {/* SECTION 5: HERO CAROUSEL & PHOTO GALLERY */}
              <section id="sec-gallery" className="bg-[#181d24] rounded-2xl border border-zinc-800 p-5 sm:p-6 space-y-6 scroll-mt-6">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2 text-zinc-100 font-bold text-base">
                    <ImageIcon className="w-5 h-5 text-red-500" />
                    <h3>5. Hero Carousel & Full Photo Gallery</h3>
                  </div>
                  <span className="text-[11px] text-zinc-400 font-mono">
                    {heroImages.length} Hero • {galleryImages.length} Gallery Photos
                  </span>
                </div>

                {/* 5A: HERO CAROUSEL BUILDER */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <span className="font-bold text-zinc-200 text-xs flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>Hero Carousel Slides ({heroImages.length})</span>
                      </span>
                      <p className="text-[11px] text-zinc-400">
                        The first image serves as the main lead hero photo. Drag cards or use arrows to reorder.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPickerTarget({ type: 'hero' })}
                        className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors border border-zinc-700"
                        title="Pick photos from existing gallery"
                      >
                        <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                        <span>Pick from Gallery</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => triggerFileUpload({ type: 'hero' })}
                        className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors shadow-sm"
                      >
                        <UploadCloud className="w-3.5 h-3.5" />
                        <span>Upload Hero Photos</span>
                      </button>
                    </div>
                  </div>

                  {/* Inline URL Add Bar for Hero */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newHeroUrl}
                      onChange={(e) => setNewHeroUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddHeroImage();
                        }
                      }}
                      placeholder="Paste image URL to add to hero carousel..."
                      className="flex-1 p-2 rounded-lg bg-black border border-zinc-700 text-white text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleAddHeroImage}
                      className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs cursor-pointer transition-colors flex-shrink-0"
                    >
                      + Add Slide
                    </button>
                  </div>

                  {/* Hero Images Grid with Drag & Reorder */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {heroImages.map((imgUrl, hIdx) => (
                      <div
                        key={hIdx}
                        draggable
                        onDragStart={(e) => handleHeroDragStart(e, hIdx)}
                        onDrop={(e) => handleHeroDrop(e, hIdx)}
                        onDragOver={(e) => e.preventDefault()}
                        className={`relative rounded-xl overflow-hidden border aspect-[4/3] bg-black group transition-all cursor-move select-none shadow-md ${
                          hIdx === 0 
                            ? 'border-amber-500/80 ring-1 ring-amber-500/40' 
                            : 'border-zinc-800 hover:border-zinc-600'
                        } ${draggedHeroIdx === hIdx ? 'opacity-40 scale-95' : 'opacity-100'}`}
                      >
                        <img 
                          src={imgUrl} 
                          alt={`Hero slide ${hIdx + 1}`} 
                          className="w-full h-full object-cover pointer-events-none" 
                        />

                        {/* Top Badge Overlay */}
                        <div className="absolute top-1.5 left-1.5 right-1.5 flex items-center justify-between z-10">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm ${
                            hIdx === 0 
                              ? 'bg-amber-500 text-black font-black' 
                              : 'bg-black/75 text-zinc-300 backdrop-blur-xs'
                          }`}>
                            {hIdx === 0 ? '★ Lead Hero' : `#${hIdx + 1}`}
                          </span>

                          <button
                            type="button"
                            onClick={() => setHeroImages(heroImages.filter((_, i) => i !== hIdx))}
                            className="w-6 h-6 rounded bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-md cursor-pointer transition-colors opacity-90 group-hover:opacity-100"
                            title="Remove slide"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Bottom Reorder Bar */}
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-1.5 flex items-center justify-between z-10">
                          <button
                            type="button"
                            onClick={() => handleMoveHero(hIdx, 'left')}
                            disabled={hIdx === 0}
                            className={`p-1 rounded text-[10px] font-bold flex items-center gap-0.5 ${
                              hIdx === 0 
                                ? 'text-zinc-600 cursor-not-allowed' 
                                : 'text-zinc-200 hover:text-white bg-black/60 hover:bg-black/90 cursor-pointer'
                            }`}
                            title="Move slide left"
                          >
                            <ChevronLeft className="w-3 h-3" />
                            <span>Left</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleMoveHero(hIdx, 'right')}
                            disabled={hIdx === heroImages.length - 1}
                            className={`p-1 rounded text-[10px] font-bold flex items-center gap-0.5 ${
                              hIdx === heroImages.length - 1 
                                ? 'text-zinc-600 cursor-not-allowed' 
                                : 'text-zinc-200 hover:text-white bg-black/60 hover:bg-black/90 cursor-pointer'
                            }`}
                            title="Move slide right"
                          >
                            <span>Right</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 5B: FULL CATEGORIZED GALLERY */}
                <div className="pt-4 border-t border-zinc-800 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <span className="font-bold text-zinc-200 text-xs flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-blue-400" />
                        <span>Categorized Gallery & Inspection Docs ({galleryImages.length})</span>
                      </span>
                      <p className="text-[11px] text-zinc-400">
                        Upload multi-angle photography or PDF reports categorized by section.
                      </p>
                    </div>

                    {/* Batch Upload with Target Category Dropdown */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        value={newGalleryCategory}
                        onChange={(e) => setNewGalleryCategory(e.target.value as any)}
                        className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 font-semibold cursor-pointer"
                      >
                        <option value="exterior">Upload as: Exterior</option>
                        <option value="interior">Upload as: Interior</option>
                        <option value="engine">Upload as: Engine Bay</option>
                        <option value="underbody">Upload as: Underbody & Mechanical</option>
                        <option value="documentation">Upload as: Docs & Inspection</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => triggerFileUpload({ type: 'gallery', category: newGalleryCategory })}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors shadow-sm"
                      >
                        <UploadCloud className="w-3.5 h-3.5" />
                        <span>+ Upload Photos & Inspection Docs</span>
                      </button>
                    </div>
                  </div>

                  {/* Single Inline Manual Entry Row */}
                  <div className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-2">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                      Quick Manual Item Entry
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                      <input
                        type="text"
                        value={newGalleryUrl}
                        onChange={(e) => setNewGalleryUrl(e.target.value)}
                        placeholder="Image or PDF URL..."
                        className="sm:col-span-5 p-2 rounded-lg bg-black border border-zinc-700 text-white text-xs font-mono"
                      />
                      <input
                        type="text"
                        value={newGalleryTitle}
                        onChange={(e) => setNewGalleryTitle(e.target.value)}
                        placeholder="Title / Description (e.g. Compression Test Report)..."
                        className="sm:col-span-4 p-2 rounded-lg bg-black border border-zinc-700 text-white text-xs"
                      />
                      <select
                        value={newGalleryCategory}
                        onChange={(e) => setNewGalleryCategory(e.target.value as any)}
                        className="sm:col-span-2 p-2 rounded-lg bg-black border border-zinc-700 text-white text-xs"
                      >
                        <option value="exterior">Exterior</option>
                        <option value="interior">Interior</option>
                        <option value="engine">Engine</option>
                        <option value="underbody">Underbody</option>
                        <option value="documentation">Docs & Records</option>
                      </select>
                      <button
                        type="button"
                        onClick={handleAddGalleryImage}
                        className="sm:col-span-1 p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs cursor-pointer transition-colors flex items-center justify-center"
                        title="Add to gallery"
                      >
                        + Add
                      </button>
                    </div>
                  </div>

                  {/* Category Filter Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                    {[
                      { id: 'all', label: 'All', count: galleryImages.length },
                      { id: 'exterior', label: 'Exterior', count: galleryImages.filter(g => g.category === 'exterior').length },
                      { id: 'interior', label: 'Interior', count: galleryImages.filter(g => g.category === 'interior').length },
                      { id: 'engine', label: 'Engine Bay', count: galleryImages.filter(g => g.category === 'engine').length },
                      { id: 'underbody', label: 'Underbody', count: galleryImages.filter(g => g.category === 'underbody').length },
                      { id: 'documentation', label: 'Docs & Records', count: galleryImages.filter(g => g.category === 'documentation').length }
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setGalleryActiveFilter(tab.id)}
                        className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer flex-shrink-0 ${
                          galleryActiveFilter === tab.id
                            ? 'bg-zinc-200 text-zinc-950 shadow-sm'
                            : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-800'
                        }`}
                      >
                        <span>{tab.label}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                          galleryActiveFilter === tab.id ? 'bg-zinc-950 text-zinc-200' : 'bg-zinc-800 text-zinc-400'
                        }`}>
                          {tab.count}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Gallery Items Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {galleryImages
                      .map((img, originalIndex) => ({ img, originalIndex }))
                      .filter(({ img }) => galleryActiveFilter === 'all' || img.category === galleryActiveFilter)
                      .map(({ img, originalIndex }) => (
                        <div
                          key={img.id || originalIndex}
                          className="relative rounded-xl overflow-hidden border border-zinc-800 aspect-[4/3] bg-zinc-950 group shadow-sm flex flex-col justify-between"
                        >
                          {/* Image or PDF Document Preview */}
                          {img.isPdf ? (
                            <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-zinc-900">
                              <FileText className="w-8 h-8 text-red-400 mb-1" />
                              <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider">
                                PDF Document
                              </span>
                              <span className="text-[11px] text-zinc-400 line-clamp-2 mt-0.5 font-medium">
                                {img.title}
                              </span>
                            </div>
                          ) : (
                            <img
                              src={img.url}
                              alt={img.title || 'Vehicle photo'}
                              className="w-full h-full object-cover"
                            />
                          )}

                          {/* Top Controls Overlay: Category Selector + High-Vis Delete Button */}
                          <div className="absolute top-1.5 inset-x-1.5 flex items-center justify-between z-10">
                            <select
                              value={img.category || 'exterior'}
                              onChange={(e) => handleUpdateGalleryCategory(originalIndex, e.target.value as any)}
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/85 text-zinc-200 border border-zinc-700 backdrop-blur-xs cursor-pointer uppercase tracking-wider"
                            >
                              <option value="exterior">Exterior</option>
                              <option value="interior">Interior</option>
                              <option value="engine">Engine</option>
                              <option value="underbody">Underbody</option>
                              <option value="documentation">Docs</option>
                            </select>

                            <button
                              type="button"
                              onClick={() => setGalleryImages(galleryImages.filter((_, i) => i !== originalIndex))}
                              className="w-6 h-6 rounded bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-md cursor-pointer transition-colors opacity-90 group-hover:opacity-100"
                              title="Delete photo"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Bottom Caption Bar */}
                          <div className="absolute bottom-0 inset-x-0 bg-black/80 backdrop-blur-xs px-2 py-1 z-10">
                            <p className="text-[10px] text-zinc-300 truncate font-medium">
                              {img.title || img.caption || 'Vehicle Photo'}
                            </p>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </section>

              {/* SECTION 6: VIDEOS & DRIVING CHAPTERS */}
              <section id="sec-videos" className="bg-[#181d24] rounded-2xl border border-zinc-800 p-5 sm:p-6 space-y-6 scroll-mt-6">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2 text-zinc-100 font-bold text-base">
                    <Video className="w-5 h-5 text-red-500" />
                    <h3>6. Videos & Driving Chapters</h3>
                  </div>
                  <span className="text-[11px] text-zinc-400 font-mono">{videoChapters.length} Chapters</span>
                </div>

                <div className="space-y-4 text-xs">
                  {/* Master YouTube Playlist URL */}
                  <div>
                    <label className="block font-bold text-zinc-300 mb-1 flex items-center justify-between">
                      <span>YouTube Video / Playlist URL</span>
                      <span className="text-[10px] text-zinc-500 font-normal">Primary Playlist Anchor</span>
                    </label>
                    <input
                      type="text"
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      placeholder="https://www.youtube.com/playlist?list=... or watch?v=..."
                      className="w-full p-2.5 rounded-lg bg-black border border-zinc-700 text-white font-mono text-xs"
                    />
                  </div>

                  {/* Section Title & Subtitle */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-zinc-300 mb-1">Video Section Title</label>
                      <input
                        type="text"
                        value={videoTitle}
                        onChange={(e) => setVideoTitle(e.target.value)}
                        placeholder="e.g. Driving Footage & Dynamic Audio"
                        className="w-full p-2.5 rounded-lg bg-black border border-zinc-700 text-white font-bold text-xs"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-zinc-300 mb-1">Video Section Subtitle</label>
                      <input
                        type="text"
                        value={videoSubtitle}
                        onChange={(e) => setVideoSubtitle(e.target.value)}
                        placeholder="e.g. High-RPM acceleration and air-cooled soundtrack"
                        className="w-full p-2.5 rounded-lg bg-black border border-zinc-700 text-white text-xs"
                      />
                    </div>
                  </div>

                  {/* Batch Fetch Metadata Action Bar */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900 border border-zinc-800 flex-wrap gap-2">
                    <div className="text-[11px] text-zinc-400">
                      Auto-retrieve YouTube titles, high-res thumbnails, and durations.
                    </div>
                    <button
                      type="button"
                      onClick={handleFetchAllChapters}
                      disabled={isFetchingAllVideos || videoChapters.length === 0}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                        isFetchingAllVideos
                          ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                          : 'bg-amber-600 hover:bg-amber-500 text-white shadow-xs'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{isFetchingAllVideos ? 'Fetching All...' : 'Fetch All Video Metadata'}</span>
                    </button>
                  </div>

                  {metadataFetchSuccess && (
                    <div className="p-2.5 rounded-lg bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs font-semibold flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span>{metadataFetchSuccess}</span>
                    </div>
                  )}

                  {/* Video Chapters List */}
                  <div className="space-y-4 pt-2">
                    {videoChapters.map((chapter, vIdx) => (
                      <div
                        key={chapter.id || vIdx}
                        className="p-4 bg-zinc-900/90 border border-zinc-800 rounded-xl space-y-3"
                      >
                        {/* Chapter Header with Reordering and Delete */}
                        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                          <span className="font-bold text-zinc-200 text-xs flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-800 font-mono text-[10px]">
                              #{vIdx + 1}
                            </span>
                            <span className="truncate">{chapter.title || `Driving Chapter #${vIdx + 1}`}</span>
                          </span>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleMoveVideoChapter(vIdx, 'up')}
                              disabled={vIdx === 0}
                              className={`p-1 rounded ${vIdx === 0 ? 'text-zinc-700' : 'text-zinc-400 hover:text-white'}`}
                              title="Move chapter up"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveVideoChapter(vIdx, 'down')}
                              disabled={vIdx === videoChapters.length - 1}
                              className={`p-1 rounded ${vIdx === videoChapters.length - 1 ? 'text-zinc-700' : 'text-zinc-400 hover:text-white'}`}
                              title="Move chapter down"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setVideoChapters(videoChapters.filter((_, i) => i !== vIdx))}
                              className="text-zinc-500 hover:text-red-400 p-1 ml-1 cursor-pointer transition-colors"
                              title="Delete chapter"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Chapter Content Inputs */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                          {/* Thumbnail Box */}
                          <div className="sm:col-span-4 space-y-1.5">
                            <div className="w-full aspect-video rounded-lg bg-black border border-zinc-700 overflow-hidden relative group">
                              {chapter.thumbnailUrl ? (
                                <>
                                  <img
                                    src={chapter.thumbnailUrl}
                                    alt={chapter.title}
                                    className="w-full h-full object-cover"
                                  />
                                  <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono font-bold text-white">
                                    {chapter.duration || '00:00'}
                                  </div>
                                </>
                              ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 text-center p-2">
                                  <Film className="w-5 h-5 mb-1 opacity-50" />
                                  <span className="text-[10px]">No Thumbnail</span>
                                </div>
                              )}
                            </div>

                            <input
                              type="text"
                              value={chapter.thumbnailUrl || ''}
                              onChange={(e) => {
                                const copy = [...videoChapters];
                                copy[vIdx].thumbnailUrl = e.target.value;
                                setVideoChapters(copy);
                              }}
                              placeholder="Custom Thumbnail URL..."
                              className="w-full p-1.5 rounded bg-black border border-zinc-700 text-zinc-300 text-[11px] font-mono"
                            />
                          </div>

                          {/* Right Fields: URL, Metadata Button, Title, Duration, Description */}
                          <div className="sm:col-span-8 space-y-2">
                            {/* YouTube URL + Fetch Metadata Button */}
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={chapter.videoUrl || ''}
                                onChange={(e) => {
                                  const copy = [...videoChapters];
                                  copy[vIdx].videoUrl = e.target.value;
                                  setVideoChapters(copy);
                                }}
                                placeholder="YouTube URL or 11-char ID (e.g. dQw4w9WgXcQ)..."
                                className="flex-1 p-2 rounded-lg bg-black border border-zinc-700 text-white text-xs font-mono"
                              />
                              <button
                                type="button"
                                onClick={() => handleFetchChapterMetadata(vIdx)}
                                disabled={fetchingMetadataIdx === vIdx}
                                className={`px-2.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors flex-shrink-0 ${
                                  fetchingMetadataIdx === vIdx
                                    ? 'bg-zinc-700 text-zinc-400'
                                    : 'bg-red-800 hover:bg-red-700 text-white'
                                }`}
                                title="Auto-fetch title, thumbnail and duration from YouTube"
                              >
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>{fetchingMetadataIdx === vIdx ? 'Fetching...' : 'Fetch'}</span>
                              </button>
                            </div>

                            {/* Title & Duration */}
                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                              <div className="sm:col-span-3">
                                <input
                                  type="text"
                                  value={chapter.title}
                                  onChange={(e) => {
                                    const copy = [...videoChapters];
                                    copy[vIdx].title = e.target.value;
                                    setVideoChapters(copy);
                                  }}
                                  placeholder="Chapter Title"
                                  className="w-full p-2 rounded-lg bg-black border border-zinc-700 text-white text-xs font-bold"
                                />
                              </div>
                              <div className="sm:col-span-1">
                                <input
                                  type="text"
                                  value={chapter.duration || ''}
                                  onChange={(e) => {
                                    const copy = [...videoChapters];
                                    copy[vIdx].duration = e.target.value;
                                    setVideoChapters(copy);
                                  }}
                                  placeholder="03:45"
                                  className="w-full p-2 rounded-lg bg-black border border-zinc-700 text-white text-xs font-mono"
                                />
                              </div>
                            </div>

                            {/* Description */}
                            <textarea
                              rows={2}
                              value={chapter.description || ''}
                              onChange={(e) => {
                                const copy = [...videoChapters];
                                copy[vIdx].description = e.target.value;
                                setVideoChapters(copy);
                              }}
                              placeholder="Chapter description and audio notes..."
                              className="w-full p-2 rounded-lg bg-black border border-zinc-700 text-zinc-300 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => {
                        const newCh: VideoChapter = {
                          id: `vid-${Date.now()}`,
                          title: `Driving Chapter #${videoChapters.length + 1}`,
                          duration: '03:30',
                          videoUrl: '',
                          description: 'High-RPM acceleration and dynamic audio recording.'
                        };
                        setVideoChapters(prev => [...prev, newCh]);
                      }}
                      className="w-full py-2.5 rounded-xl border border-dashed border-zinc-700 hover:border-zinc-500 text-zinc-300 font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>+ Add Video Chapter</span>
                    </button>
                  </div>
                </div>
              </section>

              {/* SECTION 7: AUCTION FINANCIALS & SCHEDULE */}
              <section id="sec-financials" className="bg-[#181d24] rounded-2xl border border-zinc-800 p-5 sm:p-6 space-y-6 scroll-mt-6">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2 text-zinc-100 font-bold text-base">
                    <DollarSign className="w-5 h-5 text-emerald-400" />
                    <h3>7. Auction Financials & Schedule (CAD $)</h3>
                  </div>
                  <span className="text-[11px] text-zinc-400 font-mono">CAD Standard • 0% Buyer Fee</span>
                </div>

                <div className="space-y-4 text-xs">
                  {/* Financial Fields: Starting Bid, Minimum Increment, Reserve */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-bold text-zinc-300 mb-1">
                        Starting Bid (CAD $)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={startingBid}
                        onChange={(e) => setStartingBid(Number(e.target.value))}
                        className="w-full p-2.5 rounded-lg bg-black border border-zinc-700 text-white font-mono font-bold text-xs"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-zinc-300 mb-1">
                        Minimum Increment (CAD $)
                      </label>
                      <input
                        type="number"
                        min={50}
                        step={50}
                        value={minimumIncrement}
                        onChange={(e) => setMinimumIncrement(Number(e.target.value))}
                        className="w-full p-2.5 rounded-lg bg-black border border-zinc-700 text-white font-mono font-bold text-xs"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-zinc-300 mb-1">
                        Reserve Amount (CAD $) (0 = No Reserve)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={500}
                        value={reserveAmount}
                        onChange={(e) => setReserveAmount(Number(e.target.value))}
                        className="w-full p-2.5 rounded-lg bg-black border border-zinc-700 text-white font-mono font-bold text-xs"
                      />
                    </div>
                  </div>

                  {/* Auction Lifecycle Status Dropdown */}
                  <div className="pt-2 border-t border-zinc-800">
                    <label className="block font-bold text-zinc-300 mb-1">
                      Auction Lifecycle Status
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as any)}
                      className="w-full p-2.5 rounded-lg bg-black border border-zinc-700 text-white font-bold text-xs cursor-pointer"
                    >
                      <option value="upcoming">Upcoming (Preview Mode - Countdown to Start)</option>
                      <option value="active">Active (Accepting Live Bids)</option>
                      <option value="ended">Ended (Bidding Closed)</option>
                      <option value="sold">Sold (Final Settlement Completed)</option>
                    </select>
                  </div>

                  {/* Auction Start Time & End Time with Quick-Action Pills */}
                  <div className="pt-2 border-t border-zinc-800 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block font-bold text-zinc-300">
                            Auction Start Time (Local)
                          </label>
                          <button
                            type="button"
                            onClick={() => setStartTimeInput(formatForInput(Date.now()))}
                            className="text-[10px] font-bold text-red-400 hover:text-red-300 cursor-pointer"
                          >
                            Set to Now
                          </button>
                        </div>
                        <input
                          type="datetime-local"
                          value={startTimeInput}
                          onChange={(e) => setStartTimeInput(e.target.value)}
                          className="w-full p-2.5 rounded-lg bg-black border border-zinc-700 text-white text-xs font-mono"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block font-bold text-zinc-300">
                            Auction End Time (Local)
                          </label>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEndTimeInput(formatForInput(Date.now() + 3 * 86400000))}
                              className="text-[10px] font-bold text-zinc-400 hover:text-zinc-200 cursor-pointer bg-zinc-800 px-1.5 py-0.5 rounded"
                            >
                              +3 Days
                            </button>
                            <button
                              type="button"
                              onClick={() => setEndTimeInput(formatForInput(Date.now() + 7 * 86400000))}
                              className="text-[10px] font-bold text-zinc-400 hover:text-zinc-200 cursor-pointer bg-zinc-800 px-1.5 py-0.5 rounded"
                            >
                              +7 Days
                            </button>
                          </div>
                        </div>
                        <input
                          type="datetime-local"
                          value={endTimeInput}
                          onChange={(e) => setEndTimeInput(e.target.value)}
                          className="w-full p-2.5 rounded-lg bg-black border border-zinc-700 text-white text-xs font-mono"
                        />
                      </div>
                    </div>

                    {/* Anti-Sniping Simulation Sandbox Button */}
                    <div className="pt-2 flex items-center justify-between flex-wrap gap-2 p-3 rounded-xl bg-red-950/40 border border-red-900/60">
                      <div>
                        <span className="font-bold text-red-300 text-xs flex items-center gap-1.5">
                          <Flame className="w-3.5 h-3.5 text-red-400" />
                          <span>Anti-Sniping Engine Test Sandbox</span>
                        </span>
                        <p className="text-[11px] text-zinc-400">
                          Instantly advances auction clock to 110 seconds remaining to test 2-minute soft close reset.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await setAuctionEndingSoon(auction.id, 110);
                            setMessage({
                              type: 'success',
                              text: 'Auction end time adjusted to 110s remaining! Anti-sniping countdown active.'
                            });
                            setTimeout(() => setMessage(null), 4000);
                          } catch (e: any) {
                            setMessage({
                              type: 'error',
                              text: `Failed to simulate anti-sniping: ${e.message}`
                            });
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg bg-red-800 hover:bg-red-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors shadow-sm"
                      >
                        <Flame className="w-3.5 h-3.5" />
                        <span>Simulate Final 2 Minutes</span>
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </main>
          </div>
        </div>

        {/* =================================================================== */}
        {/* RIGHT PANE: REAL-TIME LIVE PUBLIC PREVIEW */}
        {/* =================================================================== */}
        <div className={`bg-[#f7f8fa] text-zinc-900 flex flex-col overflow-y-auto ${
          viewMode === 'form' 
            ? 'hidden' 
            : viewMode === 'preview' 
              ? 'w-full flex-1' 
              : 'hidden lg:flex lg:w-[40%] flex-1'
        }`}>
          {/* Simulated Browser Bar with Viewport Switcher */}
          <div className="sticky top-0 z-20 bg-white border-b border-zinc-200 px-4 py-2 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-mono text-zinc-500 truncate">
                Preview: https://wailtail.ca/lot/{auction.id}
              </span>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Responsive Viewport Switcher */}
              <div className="flex items-center bg-zinc-100 p-0.5 rounded-lg border border-zinc-200 text-xs">
                <button
                  type="button"
                  onClick={() => setPreviewViewport('desktop')}
                  className={`px-2 py-1 rounded flex items-center gap-1 font-semibold transition-all cursor-pointer ${
                    previewViewport === 'desktop' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                  title="Desktop Preview Viewport"
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Desktop</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewViewport('mobile')}
                  className={`px-2 py-1 rounded flex items-center gap-1 font-semibold transition-all cursor-pointer ${
                    previewViewport === 'mobile' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-900'
                  }`}
                  title="Mobile Viewport Simulation (390px)"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Mobile</span>
                </button>
              </div>

              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200 hidden sm:inline">
                Live Preview
              </span>
            </div>
          </div>

          {/* Live Render Content Container */}
          <div className={`p-4 sm:p-8 space-y-8 w-full transition-all ${
            previewViewport === 'desktop'
              ? 'max-w-5xl mx-auto'
              : 'max-w-[420px] mx-auto my-6 border-4 border-zinc-800 rounded-[38px] shadow-2xl bg-[#f7f8fa] overflow-hidden p-4 space-y-6'
          }`}>
            {/* 1. Live Header & Public Bid Bar Simulation */}
            <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider bg-red-700 text-white">
                    {highlightsBadge || '1978 911 SC'}
                  </span>
                  <span className="text-[11px] font-mono text-zinc-400">
                    {year} {make} {model}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-medium">
                  <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                  <span>{formattedLocation || 'Vancouver, BC, Canada'}</span>
                </div>
              </div>

              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-900 font-serif">
                {title || '1978 Porsche 911 SC Coupe'}
              </h1>
              <p className="text-sm font-medium text-zinc-600">
                {subtitle || '3.0L Flat-Six • 5-Speed 915'}
              </p>

              {/* Live Bidding & Countdown Status Strip */}
              <div className="p-4 bg-zinc-900 rounded-xl text-white flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <div className="p-2.5 rounded-lg bg-red-600/20 text-red-400 border border-red-500/30">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">
                      {status === 'upcoming' ? 'Auction Starts' : status === 'ended' ? 'Auction Status' : 'Time Remaining'}
                    </div>
                    <div className="text-base font-bold font-mono text-white">
                      {formatAuctionCountdown(
                        new Date(startTimeInput).getTime(),
                        new Date(endTimeInput).getTime(),
                        status
                      ).formatted || (status === 'upcoming' ? 'Upcoming' : 'Active')}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-3 sm:pt-0 border-zinc-800">
                  <div className="text-right">
                    <div className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">
                      {status === 'upcoming' ? 'Starting Bid' : 'Current High Bid'}
                    </div>
                    <div className="text-lg font-black font-mono text-emerald-400">
                      ${Number(startingBid).toLocaleString()} CAD
                    </div>
                  </div>

                  <div className="px-3 py-1.5 rounded-lg bg-zinc-800 text-xs font-bold text-zinc-300 border border-zinc-700">
                    {Number(reserveAmount) > 0 ? (
                      Number(startingBid) >= Number(reserveAmount) ? (
                        <span className="text-emerald-400">Reserve Met</span>
                      ) : (
                        <span className="text-amber-400">Reserve Set</span>
                      )
                    ) : (
                      <span className="text-zinc-300">No Reserve</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Core Specs Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-zinc-100 text-xs">
                <div>
                  <span className="text-zinc-400 block text-[10px] uppercase font-bold">Odometer</span>
                  <span className="font-bold text-zinc-800">{mileage || '126,200'} {distanceUnit}</span>
                </div>
                <div>
                  <span className="text-zinc-400 block text-[10px] uppercase font-bold">VIN</span>
                  <span className="font-mono font-bold text-zinc-800 break-all sm:truncate block" title={vin || '9118200142'}>
                    {vin || '9118200142'}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 block text-[10px] uppercase font-bold">Transmission</span>
                  <span className="font-bold text-zinc-800 truncate block">
                    {drivetrain === 'Other' && customDrivetrain ? customDrivetrain : drivetrain}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 block text-[10px] uppercase font-bold">Registration</span>
                  <span className="font-bold text-emerald-700 truncate block">
                    {titleStatus === 'Other / Custom' && customTitleStatus ? customTitleStatus : titleStatus}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Hero Media Carousel */}
            <div className="rounded-2xl overflow-hidden border border-zinc-200 shadow-sm bg-zinc-900">
              <HeroMediaCarousel
                images={heroImages.length > 0 ? heroImages : ['https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1920&q=85']}
                onOpenLightbox={(idx) => setPreviewLightboxIndex(idx)}
                onScrollToVideo={() => {}}
                onScrollToGallery={() => {}}
              />
            </div>

            {/* 3. Section 2 & 3: Overview Prose Narrative & Synchronized Vehicle Highlights */}
            <section id="overview" className="bg-white rounded-2xl border border-zinc-200 p-6 sm:p-8 shadow-sm">
              <div className={`flex flex-col ${viewMode === 'preview' && previewViewport === 'desktop' ? 'xl:flex-row' : ''} gap-8`}>
                {/* Left: Summary Prose and Optional Featured Overview Image */}
                <div className="flex-1 space-y-4 min-w-0">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-red-700">
                    <FileText className="w-4 h-4" />
                    <span>{overviewHeading || 'Listing Overview'}</span>
                  </div>

                  <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight font-serif">
                    {title || 'Lot Overview'}
                  </h2>

                  {/* Optional Overview Target Image */}
                  {overviewImage?.url && overviewImage.url.trim() !== '' && (
                    <div 
                      onClick={() => setPreviewLightboxUrl(overviewImage.url)}
                      className="group relative rounded-xl overflow-hidden bg-zinc-100 border border-zinc-200 cursor-pointer shadow-sm my-4"
                    >
                      <img
                        src={overviewImage.url}
                        alt={overviewImage.alt || 'Listing Overview Image'}
                        className="w-full h-64 sm:h-80 object-cover group-hover:scale-[1.02] transition-transform duration-300"
                        referrerPolicy="no-referrer"
                      />
                      {overviewImage.caption && (
                        <div className="p-3 bg-zinc-900/90 text-zinc-200 text-xs flex items-center justify-between">
                          <span>{overviewImage.caption}</span>
                          <span className="text-[10px] text-zinc-400 font-mono">Click to inspect</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="text-sm sm:text-base text-zinc-700 space-y-3 leading-relaxed">
                    {overviewParagraphsText.split('\n\n').filter(Boolean).map((p, pIdx) => (
                      <p key={pIdx}>{p}</p>
                    ))}
                  </div>
                </div>

                {/* Right: Quick Specifications Sidebar Card (#specs) */}
                <div id="specs" className={`w-full ${viewMode === 'preview' && previewViewport === 'desktop' ? 'xl:w-80' : ''} bg-zinc-50 rounded-xl p-5 border border-zinc-200 space-y-3.5 flex-shrink-0 text-xs self-start`}>
                  <h3 className="font-bold text-zinc-900 uppercase tracking-wider text-[11px] pb-2 border-b border-zinc-200 flex items-center justify-between">
                    <span>Vehicle Highlights</span>
                    <span className="text-red-700 font-mono font-bold">
                      {highlightsBadge || '1978 911'}
                    </span>
                  </h3>

                  <div className="space-y-2">
                    {compiledOverviewSpecs.map((spec, sIdx) => (
                      <div key={sIdx} className="flex justify-between py-1 border-b border-zinc-200/60 last:border-0">
                        <span className="text-zinc-500 font-medium">{spec.label}:</span>
                        <span className="font-bold text-zinc-800 text-right ml-2">{spec.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Private auction badge */}
                  <div className="pt-2 border-t border-zinc-200">
                    <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span><strong>Zero Buyer Fees:</strong> Direct offline settlement with the owner.</span>
                    </div>
                  </div>

                  {/* Contact Consignor Button */}
                  <div className="pt-1">
                    <button
                      type="button"
                      className="w-full py-2.5 px-3 rounded-lg bg-red-700 hover:bg-red-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
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

            {/* 4. Section 4: Showcase Chapters */}
            {showcaseChapters.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-700">
                  <BookOpen className="w-4 h-4" />
                  <span>Showcase Chapters ({showcaseChapters.length})</span>
                </div>
                <InlineShowcaseSection
                  sections={showcaseChapters}
                  onOpenLightboxWithUrl={(url) => setPreviewLightboxUrl(url)}
                />
              </div>
            )}

            {/* 5. Section 6: Video & Driving Chapters */}
            {(videoChapters.length > 0 || youtubeUrl) && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-700">
                  <Video className="w-4 h-4" />
                  <span>Driving Footage & Video Chapters</span>
                </div>
                <YouTubePlaylistSection
                  playlistUrl={youtubeUrl}
                  videoTitle={videoTitle}
                  videoSubtitle={videoSubtitle}
                  chapters={videoChapters}
                />
              </div>
            )}

            {/* 6. Section 5: Categorized Photo Gallery Grid */}
            {galleryImages.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-700">
                  <ImageIcon className="w-4 h-4" />
                  <span>Full Categorized Photo Gallery ({galleryImages.length} items)</span>
                </div>
                <PhotoGalleryGrid
                  images={galleryImages}
                  selectedImageIndex={previewLightboxIndex}
                  onOpenLightbox={(idx) => setPreviewLightboxIndex(idx)}
                  onCloseLightbox={() => setPreviewLightboxIndex(null)}
                />
              </div>
            )}

            {/* 7. Section 7: Auction Financials, Status & Anti-Sniping Rules Card */}
            <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-900">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  <span>Auction Financials & Scheduling Rules</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200">
                  Status: {status}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200">
                  <span className="text-zinc-500 block text-[10px] uppercase font-bold">Starting Bid</span>
                  <span className="text-base font-black text-emerald-700 font-mono">
                    ${Number(startingBid).toLocaleString()} CAD
                  </span>
                  <p className="text-[10px] text-zinc-400 mt-0.5">Initial opening bid required</p>
                </div>

                <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200">
                  <span className="text-zinc-500 block text-[10px] uppercase font-bold">Minimum Increment</span>
                  <span className="text-base font-black text-zinc-900 font-mono">
                    ${Number(minimumIncrement).toLocaleString()} CAD
                  </span>
                  <p className="text-[10px] text-zinc-400 mt-0.5">Step size per qualifying bid</p>
                </div>

                <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200">
                  <span className="text-zinc-500 block text-[10px] uppercase font-bold">Reserve Price</span>
                  <span className="text-base font-black text-zinc-900 font-mono">
                    {Number(reserveAmount) > 0 ? `$${Number(reserveAmount).toLocaleString()} CAD` : 'No Reserve'}
                  </span>
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    {Number(reserveAmount) > 0 ? 'Confidential reserve threshold' : 'Car sells to the highest bidder'}
                  </p>
                </div>
              </div>

              <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
                <Flame className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-bold">Anti-Sniping Engine (2-Minute Soft-Close Guarantee):</span>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    Any qualifying bid placed when less than 2 minutes (120 seconds) remain on the auction clock will automatically reset the remaining countdown to 2 minutes, ensuring all bidders have a fair opportunity to respond.
                  </p>
                </div>
              </div>

              <div className="pt-2 flex flex-wrap items-center justify-between text-xs text-zinc-500 gap-2 border-t border-zinc-100">
                <span>Start: <strong>{new Date(startTimeInput).toLocaleString('en-CA')}</strong></span>
                <span>End: <strong>{new Date(endTimeInput).toLocaleString('en-CA')}</strong></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* IMPORT JSON MODAL */}
      {/* =================================================================== */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[#181d24] border border-zinc-700 rounded-2xl shadow-2xl p-6 space-y-4 text-zinc-100">
            <div className="flex items-center justify-between border-b border-zinc-700 pb-3">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Upload className="w-4 h-4 text-blue-400" />
                <span>Import Listing JSON (ListingDraftSchema)</span>
              </h3>
              <button onClick={() => setShowImportModal(false)} className="text-zinc-400 hover:text-white">✕</button>
            </div>

            <p className="text-xs text-zinc-400">
              Paste a JSON payload matching the standard ListingDraftSchema interface. This will populate Sections 1, 2, 3, 4, and 7.
            </p>

            <textarea
              rows={12}
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              placeholder="Paste ListingDraftSchema JSON here..."
              className="w-full p-3 rounded-xl bg-black border border-zinc-700 text-xs font-mono text-zinc-200 focus:outline-none focus:border-blue-500"
            />

            {importError && (
              <div className="p-2.5 rounded-lg bg-red-950/80 border border-red-800 text-red-300 text-xs font-semibold">
                {importError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyImportJson}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white"
              >
                Apply & Populate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* + NEW LISTING WORKFLOW MODAL */}
      {/* =================================================================== */}
      {showNewListingModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#181d24] border border-zinc-700 rounded-2xl shadow-2xl p-6 space-y-4 text-zinc-100">
            <div className="flex items-start gap-3">
              <div className="p-3 rounded-full bg-emerald-950 text-emerald-400 flex-shrink-0 border border-emerald-800/80">
                <Plus className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold">Create New Vehicle Listing</h3>
                <p className="text-xs text-zinc-300 mt-1">
                  Create a new distinct vehicle listing draft in Firestore without overwriting existing inventory.
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateNewListing} className="space-y-4 pt-1">
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                  Listing Title / Vehicle Lot Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newListingTitle}
                  onChange={(e) => setNewListingTitle(e.target.value)}
                  placeholder="e.g. 1989 Porsche 911 Speedster"
                  className="w-full bg-[#111418] border border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
                <p className="text-[11px] text-zinc-400 mt-1.5">
                  Populated with clean vehicle placeholders and default CAD financials ($1,000 start, $250 increment, 7-day duration).
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  disabled={creatingListing}
                  onClick={() => {
                    setShowNewListingModal(false);
                    setNewListingTitle('');
                  }}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingListing || !newListingTitle.trim()}
                  className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-md ${
                    creatingListing || !newListingTitle.trim()
                      ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer active:scale-95'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{creatingListing ? 'Creating...' : 'Create Listing'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* IMAGE PICKER MODAL (Choose from existing gallery / hero photos) */}
      {/* =================================================================== */}
      {pickerTarget && (
        <div 
          onClick={() => setPickerTarget(null)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 animate-in fade-in"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl bg-[#1a1f26] rounded-2xl shadow-2xl border border-zinc-700 p-6 flex flex-col max-h-[85vh] overflow-hidden text-zinc-100"
          >
            <div className="flex items-center justify-between pb-4 border-b border-zinc-700">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-red-500" />
                <h3 className="font-bold text-white text-base">Select Photograph from Listing Gallery</h3>
              </div>
              <button
                type="button"
                onClick={() => setPickerTarget(null)}
                className="p-1 rounded text-zinc-400 hover:text-white cursor-pointer"
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
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <select
                value={pickerFilterCategory}
                onChange={(e) => setPickerFilterCategory(e.target.value)}
                className="p-1.5 rounded-lg border border-zinc-700 text-xs font-medium bg-zinc-900 text-zinc-200"
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
              {[
                ...heroImages.map((hUrl, idx) => ({ id: `hero-${idx}`, url: hUrl, title: `Hero Photo #${idx + 1}`, category: 'exterior' as const })),
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
                    className="group relative rounded-xl overflow-hidden border border-zinc-700 hover:border-red-500 bg-zinc-900 cursor-pointer aspect-[4/3] shadow-sm hover:scale-[1.02] transition-all"
                  >
                    <img
                      src={item.url}
                      alt={item.title}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-between text-white text-xs">
                      <span className="font-bold text-[11px] line-clamp-2">{item.title}</span>
                      <span className="self-end px-2 py-0.5 rounded bg-red-700 text-[10px] font-bold">Select Photo</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* PREVIEW SINGLE-PHOTO LIGHTBOX MODAL */}
      {/* =================================================================== */}
      {previewLightboxUrl && (
        <div 
          onClick={() => setPreviewLightboxUrl(null)}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 animate-in fade-in"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-5xl max-h-[90vh] flex flex-col items-center"
          >
            <button
              type="button"
              onClick={() => setPreviewLightboxUrl(null)}
              className="absolute -top-10 right-0 text-white hover:text-zinc-300 p-1 cursor-pointer flex items-center gap-1 text-xs font-semibold"
            >
              <X className="w-5 h-5" />
              <span>Close</span>
            </button>
            <img 
              src={previewLightboxUrl} 
              alt="Preview Zoom" 
              className="max-h-[85vh] max-w-full object-contain rounded-xl shadow-2xl border border-zinc-700" 
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      )}
    </div>
  );
};
