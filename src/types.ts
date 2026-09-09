export interface Auction {
  id: string;
  title: string;
  subtitle: string;
  headline?: string;
  siteLogo?: string;
  siteName?: string;
  siteTagline?: string;
  make?: string;
  model?: string;
  generation?: string;
  year?: string | number;
  vin: string;
  mileage: string;
  location: string;
  locationCity?: string;
  locationProvince?: string;
  locationCountry?: string;
  sellerName: string;
  sellerEmail?: string;
  sellerPhone?: string;
  sellerId?: string;
  engine?: string;
  drivetrain?: string;
  exteriorColor?: string;
  interior?: string;
  titleStatus?: string;
  currency?: 'CAD' | 'USD';
  distanceUnit?: 'km' | 'mi';
  leadHeroImage?: string;
  heroImages?: string[];
  highlightsBadge?: string;
  watchCount?: number;
  startTime: number;
  endTime: number;
  startingBid: number;
  minimumIncrement: number;
  currentBid: number;
  reserveAmount: number; // Hidden from public
  isReserveMet: boolean;
  bidCount: number;
  highBidderId?: string;
  highBidderName?: string;
  highBidderEmail?: string;
  watchlist?: string[];
  status: 'upcoming' | 'active' | 'ended' | 'sold' | 'reserve_not_met' | 'preview';
  createdAt: number;
  updatedAt: number;
}

export interface Bid {
  id: string;
  auctionId: string;
  amount: number;
  bidderId: string;
  bidderName: string;
  bidderEmail: string;
  timestamp: number;
  antiSniped?: boolean;
}

export interface Comment {
  id: string;
  auctionId: string;
  userId: string;
  userName: string;
  userEmail?: string;
  userBadge?: 'Seller' | 'Verified Bidder' | 'High Bidder' | 'Admin' | 'Member';
  text: string;
  timestamp: number;
  upvotes: number;
  upvotedBy?: string[];
  replyToId?: string;
  isBid?: boolean;
  bidAmount?: number;
  isEdited?: boolean;
  editedAt?: number;
}

export type UserRole = 'ADMIN' | 'SELLER' | 'BIDDER';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  phone?: string;
  role?: 'admin' | 'seller' | 'bidder' | UserRole;
  isEmailVerified: boolean;
  registeredAt: number;
  totalBidsPlaced?: number;
  highestBidPlaced?: number;
  bannedFromBidding?: boolean;
  isBanned?: boolean;
  bannedAt?: number;
  banReason?: string;
  watchlist?: string[];
}

export interface BidderProfile extends UserProfile {
  isBanned?: boolean;
}

export interface User extends UserProfile {
  isBanned?: boolean;
}

export interface ShowcaseImage {
  url: string;
  caption: string;
  alt: string;
  aspect?: 'wide' | 'standard' | 'portrait';
}

export interface ShowcaseSection {
  id: string;
  title: string;
  tagline: string;
  paragraphs: string[];
  specs?: { label: string; value: string }[];
  bulletPoints?: string[];
  images: ShowcaseImage[];
}

export type ShowcaseChapterCategory = 'EXTERIOR' | 'POWERTRAIN' | 'INTERIOR' | 'CHASSIS' | 'CUSTOM';

export interface ShowcaseSpecCard {
  id: string;
  key: string;        // e.g., "Horsepower"
  value: string;      // e.g., "180 hp @ 5,500 RPM"
  isCustomKey: boolean;
}

export interface ShowcaseChapter {
  id: string;
  category: 'EXTERIOR' | 'POWERTRAIN' | 'INTERIOR' | 'CHASSIS' | 'CUSTOM';
  title: string;        // Locked for predefined categories; editable if 'CUSTOM'
  subtitle: string;
  narrative: string;
  photoUrl: string;
  photoCaption: string;
  highlights: string[];
  specCards: Array<{
    id: string;
    key: string;        // e.g., "Horsepower"
    value: string;      // e.g., "180 hp @ 5,500 RPM"
    isCustomKey: boolean;
  }>;
}

export const PREDEFINED_CHAPTER_TITLES: Record<Exclude<ShowcaseChapterCategory, 'CUSTOM'>, string> = {
  EXTERIOR: 'Exterior Highlights',
  POWERTRAIN: 'Powertrain',
  INTERIOR: 'Cabin & Cockpit',
  CHASSIS: 'Chassis & Suspension'
};

export const CHAPTER_SPEC_PRESETS: Record<ShowcaseChapterCategory, string[]> = {
  POWERTRAIN: ['Horsepower', 'Torque', 'Displacement', 'Engine Code', 'Transmission', 'Drivetrain'],
  EXTERIOR: ['Body Style', 'Color', 'Paint Code', 'Aero', 'Wheels', 'Glass/Trim'],
  INTERIOR: ['Upholstery', 'Steering Wheel', 'Instrumentation', 'Audio', 'Trim Accents'],
  CHASSIS: ['Suspension', 'Brakes', 'Steering', 'Frame/Subframe'],
  CUSTOM: [
    'Body Style', 'Color', 'Paint Code', 'Aero', 'Wheels', 'Glass/Trim',
    'Horsepower', 'Torque', 'Displacement', 'Engine Code', 'Transmission', 'Drivetrain',
    'Upholstery', 'Steering Wheel', 'Instrumentation', 'Audio', 'Trim Accents',
    'Suspension', 'Brakes', 'Steering', 'Frame/Subframe'
  ]
};

export interface GalleryImage {
  id: string;
  url: string;
  thumbnailUrl?: string;
  category: 'exterior' | 'interior' | 'engine' | 'underside' | 'documentation' | 'detail';
  title: string;
  caption?: string;
  isPdf?: boolean;
  fileSize?: string;
}

export interface VideoChapter {
  id?: string;
  title: string;
  description?: string;
  videoUrl?: string;
  duration?: string;
  thumbnailUrl?: string;
}

export interface MediaConfiguration {
  siteLogo?: string;
  siteName?: string;
  siteTagline?: string;
  highlightsBadge?: string;
  distanceUnit?: 'km' | 'mi';
  vehicleName: string;
  overviewHeading?: string;
  overviewParagraphs?: string[];
  overviewImage?: ShowcaseImage;
  overviewSpecs?: { label: string; value: string }[];
  heroImages: string[];
  youtubePlaylistUrl: string;
  videoTitle?: string;
  videoSubtitle?: string;
  videoChapters?: VideoChapter[];
  inlineShowcase: ShowcaseSection[];
  showcaseChapters?: ShowcaseChapter[];
  fullGallery: GalleryImage[];
}

export interface SellerInquiry {
  id: string;
  auctionId: string;
  senderId: string;
  senderName: string;
  senderEmail: string;
  senderPhone?: string;
  topic: string;
  message: string;
  timestamp: number;
  status: 'new' | 'read' | 'replied';
}

export interface EmailNotification {
  id?: string;
  to: string;
  type: 'bid_confirmation' | 'outbid_alert' | 'auction_won' | 'seller_inquiry';
  subject: string;
  html: string;
  text: string;
  timestamp: number;
  status: 'sent' | 'queued' | 'simulated';
  metadata?: Record<string, any>;
}

export interface ListingDraftSchema {
  // Section 1: Vehicle Identity & Header Specs
  title: string;
  subtitle: string;
  year: number | string;
  make: string;
  model: string;
  generation?: string;
  vin: string;
  mileage: number | string;
  distanceUnit: 'km' | 'mi';
  location: string;
  engine: string;
  gearbox: string;
  exteriorColor: string;
  interior: string;
  titleStatus: string;
  sellerName: string;
  highlightsBadge: string;

  // Section 2: Overview Narrative & Provenance
  overviewHeading: string;
  overviewNarrative: string[];

  // Section 3: Technical Specifications Table
  specifications: Array<{
    label: string;
    value: string;
  }>;

  // Section 4: Showcase Chapters 01–04
  showcaseChapters: Array<{
    chapterNumber: string;
    title: string;
    subtitle: string;
    featureBullets: string[];
    bottomAttributeCards: Array<{
      label: string;
      value: string;
    }>;
  }>;

  // Section 7: Financial Defaults & Auction Rules (CAD)
  financials: {
    currency: 'CAD';
    startingBid: number;
    minimumIncrement: number;
    reserveAmount: number;
    durationDays: number;
  };
}

export interface ConsignmentApplication {
  id?: string;
  year: string | number;
  make: string;
  model: string;
  generation?: string;
  vin?: string;
  mileage?: string;
  transmission?: string;
  location?: string;
  locationCity?: string;
  locationProvince?: string;
  locationCountry?: string;
  reserveExpectation?: string;
  sellerName: string;
  sellerEmail: string;
  sellerPhone: string;
  notes?: string;
  submittedAt: number;
  status?: 'pending' | 'reviewed' | 'approved' | 'declined' | 'rejected';
  convertedAuctionId?: string;
  registeredUserId?: string;
  isRegisteredUser?: boolean;
  registeredUserRole?: string;
}

export interface UserBidActivity {
  auctionId: string;
  auctionTitle: string;
  auctionHeroImage: string;
  currentHighBid: number;
  userHighestBid: number;
  status: 'LEADING' | 'OUTBID';
  endTime: number;
  bidCount: number;
  currency: string;
  isReserveMet?: boolean;
}

export interface UserWonAuction {
  auctionId: string;
  auctionTitle: string;
  auctionHeroImage: string;
  winningBid: number;
  currency: string;
  endTime: number;
  sellerName: string;
  sellerEmail?: string;
  sellerPhone?: string;
  location?: string;
  vin?: string;
}

export interface UserSellerListing {
  auctionId: string;
  title: string;
  heroImage: string;
  status: Auction['status'];
  currentBid: number;
  bidCount: number;
  currency: string;
  draftEditUrl: string;
  endTime: number;
  startTime?: number;
}

export interface UserConsignmentItem {
  id: string;
  year: string | number;
  make: string;
  model: string;
  generation?: string;
  submittedAt: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVIEWED' | string;
  convertedAuctionId?: string;
  reserveExpectation?: string;
  location?: string;
}

export interface UserActivitySummary {
  activeBids: UserBidActivity[];
  wonAuctions: UserWonAuction[];
  sellerListings: UserSellerListing[];
  consignments: UserConsignmentItem[];
}
