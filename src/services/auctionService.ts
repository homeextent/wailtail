import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  runTransaction,
  addDoc,
  getDocs,
  deleteDoc,
  writeBatch,
  arrayUnion,
  arrayRemove,
  DocumentReference,
  increment,
  serverTimestamp
} from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { db, auth } from '../firebase';
import { storage } from './firebase';
import { 
  Auction, 
  Bid, 
  Comment, 
  UserProfile, 
  UserRole, 
  MediaConfiguration, 
  SellerInquiry, 
  ConsignmentApplication,
  UserActivitySummary,
  UserBidActivity,
  UserWonAuction,
  UserSellerListing,
  UserConsignmentItem,
  PlatformPromoSettings,
  PromoCardConfig,
  LotHeaderBannerConfig,
  PromoAudience
} from '../types';
import { mediaConfig as DEFAULT_MEDIA_CONFIG, BLANK_MEDIA_CONFIG } from '../mediaConfig';
export { DEFAULT_MEDIA_CONFIG, BLANK_MEDIA_CONFIG };
import { sendBidPlacedEmail, sendOutbidAlertEmail, sendSellerInquiryEmail } from './emailService';

export const MAIN_AUCTION_ID = 'wailtail-1978-porsche-911';
export const MEDIA_CONFIG_DOC_ID = 'main-media-config';
export const GLOBAL_BRANDING_STORAGE_KEY = 'wailtail_global_branding';
export const ANTI_SNIPING_WINDOW_MS = 2 * 60 * 1000; // 2 minutes in ms
export const ANTI_SNIPING_EXTENSION_MS = 2 * 60 * 1000; // 2 minutes extension

export interface GlobalBrandingSettings {
  siteLogo?: string;
  siteName?: string;
  siteTagline?: string;
  defaultStartingBid?: number;
  defaultMinIncrement?: number;
  currency?: string;
  updatedAt?: number;
}

/**
 * Synchronously retrieves stored global branding from localStorage with robust try/catch fallback.
 */
export function getStoredGlobalBranding(): { siteLogo: string; siteName: string; siteTagline: string } {
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
    console.warn('Failed to parse cached global branding from localStorage:', err);
  }
  return {
    siteLogo: '',
    siteName: 'wailtail',
    siteTagline: 'Single-Car Auctions'
  };
}

/**
 * Helper to prevent mutations from hanging indefinitely
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs = 8000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Operation timed out. Saved locally.')), timeoutMs)
    )
  ]);
}

/**
 * Compresses heavy Base64 data URLs via HTML5 Canvas to prevent exceeding Firestore's 1MB document limit.
 */
export function compressImageDataUrl(dataUrl: string, maxDim = 1200, quality = 0.75): Promise<string> {
  return new Promise((resolve) => {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/') || dataUrl.startsWith('data:image/svg')) {
      resolve(dataUrl);
      return;
    }
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } else {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Uploads a Base64 data URL to Firebase Cloud Storage and returns its public HTTPS download URL.
 */
export async function uploadImageToStorage(
  auctionId: string,
  dataUrl: string,
  folder = 'gallery'
): Promise<string> {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return dataUrl; // Return existing HTTPS URLs as-is
  }
  try {
    const targetId = auctionId?.trim() || 'common';
    const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}.jpg`;
    const storageRef = ref(storage, `auctions/${targetId}/${folder}/${filename}`);
    await uploadString(storageRef, dataUrl, 'data_url');
    return await getDownloadURL(storageRef);
  } catch (err) {
    console.warn('Cloud Storage upload fallback to compressed data URL:', err);
    return dataUrl;
  }
}

/**
 * Remove undefined values to prevent Firestore serialization crashes
 */
function sanitizePayload(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizePayload);
  const clean: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      clean[key] = sanitizePayload(val);
    }
  }
  return clean;
}

export const BLANK_AUCTION: Auction = {
  id: '',
  title: '',
  subtitle: '',
  headline: '',
  make: '',
  model: '',
  year: '' as any,
  vin: '',
  mileage: '',
  distanceUnit: 'km',
  highlightsBadge: '',
  watchCount: 0,
  location: '',
  sellerName: '',
  engine: '',
  drivetrain: '',
  exteriorColor: '',
  titleStatus: '',
  currency: 'CAD',
  leadHeroImage: '',
  heroImages: [],
  startTime: Date.now(),
  endTime: Date.now() + 7 * 24 * 60 * 60 * 1000,
  startingBid: 1000,
  minimumIncrement: 250,
  currentBid: 0,
  reserveAmount: 0,
  isReserveMet: true,
  bidCount: 0,
  highBidderId: '',
  highBidderName: '',
  highBidderEmail: '',
  status: 'upcoming',
  createdAt: Date.now(),
  updatedAt: Date.now()
};

export const DEFAULT_AUCTION: Auction = {
  id: MAIN_AUCTION_ID,
  title: "1978 Porsche 911 Turbo-Look Coupe 'Whale Tail'",
  subtitle: "3.0L Flat-Six / 5-Speed 915 Manual / Staggered 16″ Fuchs / European H4s / Steel Flares",
  headline: "1978 Porsche 911 Turbo-Look Coupe 'Whale Tail'",
  make: "Porsche",
  model: "911 Turbo-Look Coupe",
  year: 1978,
  vin: "9118201492",
  mileage: "126,200 km",
  distanceUnit: 'km',
  highlightsBadge: "1978 911",
  watchCount: 18,
  location: "Vancouver, BC / Calgary, AB",
  sellerName: "wailtail",
  engine: "3.0L Flat-Six CIS",
  drivetrain: "5-Speed 915 Manual",
  exteriorColor: "Guards Red / Whale Tail",
  titleStatus: "Clean Registration",
  currency: 'CAD',
  leadHeroImage: DEFAULT_MEDIA_CONFIG.heroImages[0],
  heroImages: DEFAULT_MEDIA_CONFIG.heroImages,
  startTime: Date.now() - 3 * 24 * 60 * 60 * 1000, // Started 3 days ago
  endTime: Date.now() + 4 * 24 * 60 * 60 * 1000, // 4 days remaining
  startingBid: 15000,
  minimumIncrement: 250,
  currentBid: 48500,
  reserveAmount: 60000, // Hidden from public view
  isReserveMet: false,
  bidCount: 14,
  highBidderId: "bidder_porschefan911",
  highBidderName: "Klaus_RSR",
  highBidderEmail: "klaus.rsr@example.com",
  status: 'active',
  createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
  updatedAt: Date.now() - 30 * 60 * 1000
};

export const INITIAL_BIDS: Omit<Bid, 'id'>[] = [
  {
    auctionId: MAIN_AUCTION_ID,
    amount: 15000,
    bidderId: "user_initial_1",
    bidderName: "VintageAirCooled",
    bidderEmail: "vintage@example.com",
    timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000 + 3600000,
    antiSniped: false
  },
  {
    auctionId: MAIN_AUCTION_ID,
    amount: 22500,
    bidderId: "user_initial_2",
    bidderName: "StuttgartBound",
    bidderEmail: "stuttgart@example.com",
    timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000,
    antiSniped: false
  },
  {
    auctionId: MAIN_AUCTION_ID,
    amount: 35000,
    bidderId: "user_initial_3",
    bidderName: "WhaleTailCollector",
    bidderEmail: "collector@example.com",
    timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000,
    antiSniped: false
  },
  {
    auctionId: MAIN_AUCTION_ID,
    amount: 45000,
    bidderId: "user_initial_4",
    bidderName: "911SC_Enthusiast",
    bidderEmail: "sc911@example.com",
    timestamp: Date.now() - 12 * 60 * 60 * 1000,
    antiSniped: false
  },
  {
    auctionId: MAIN_AUCTION_ID,
    amount: 48500,
    bidderId: "bidder_porschefan911",
    bidderName: "Klaus_RSR",
    bidderEmail: "klaus.rsr@example.com",
    timestamp: Date.now() - 30 * 60 * 1000,
    antiSniped: false
  }
];

export const INITIAL_COMMENTS: Omit<Comment, 'id'>[] = [
  {
    auctionId: MAIN_AUCTION_ID,
    userId: "seller_wailtail",
    userName: "wailtail (Seller)",
    userBadge: "Seller",
    text: "Welcome everyone to the auction! Delighted to offer this 1978 Turbo-look whale tail coupe here. I am available throughout the auction to answer any questions about the 3.0L CIS build, compression numbers, suspension setup, or arrange shipping logistics.",
    timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000 + 1800000,
    upvotes: 18,
    upvotedBy: []
  },
  {
    auctionId: MAIN_AUCTION_ID,
    userId: "comm_user_1",
    userName: "AirCooledAutobahn",
    userBadge: "Verified Bidder",
    text: "Magnificent stance on those 16-inch Fuchs with the widebody rear arches. Can the seller confirm if the Carrera hydraulic chain tensioner upgrade was done with OEM Porsche kits, and how the 915 gearbox feels shifting into 2nd gear cold?",
    timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000 + 7200000,
    upvotes: 9,
    upvotedBy: []
  },
  {
    auctionId: MAIN_AUCTION_ID,
    userId: "seller_wailtail",
    userName: "wailtail (Seller)",
    userBadge: "Seller",
    text: "@AirCooledAutobahn Yes, OEM Porsche hydraulic tensioners were installed during the engine refresh with pressure-fed lines. The 915 transmission shifts crisp and clean with no crunch going into 2nd gear warm or cold, thanks to fresh brass synchros and Swepco 201 gear lube.",
    timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000 + 10800000,
    upvotes: 14,
    upvotedBy: []
  },
  {
    auctionId: MAIN_AUCTION_ID,
    userId: "comm_user_2",
    userName: "CarreraClub911",
    userBadge: "Member",
    text: "The YouTube cold start and driving video in the playlist sounds glorious through the Dansk stainless exhaust. Best of luck to the bidders and seller!",
    timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000 + 3600000,
    upvotes: 7,
    upvotedBy: []
  }
];

/**
 * Initializes auction in Firestore if it doesn't exist yet
 */
export async function initializeAuctionIfNotExists(): Promise<Auction | null> {
  try {
    const auctionRef = doc(db, 'auctions', MAIN_AUCTION_ID);
    const snap = await getDoc(auctionRef);

    if (snap.exists()) {
      const data = snap.data() as Auction;
      return data;
    }

    return null;
  } catch (error) {
    console.warn('Auction initialized in local/offline fallback mode:', error);
    return null;
  }
}

/**
 * Subscribe to real-time updates on the auction document
 */
export function subscribeToAuction(
  auctionId: string,
  callback: (auction: Auction | null) => void
) {
  const targetId = auctionId?.trim() || MAIN_AUCTION_ID;
  const auctionRef = doc(db, 'auctions', targetId);
  return onSnapshot(auctionRef, (snap) => {
    if (snap.exists()) {
      const data = snap.data() as Auction;
      if (data.siteLogo !== undefined || data.siteName || data.siteTagline) {
        try {
          const cached = getStoredGlobalBranding();
          localStorage.setItem(GLOBAL_BRANDING_STORAGE_KEY, JSON.stringify({
            siteLogo: data.siteLogo !== undefined ? data.siteLogo : cached.siteLogo,
            siteName: data.siteName || cached.siteName,
            siteTagline: data.siteTagline || cached.siteTagline
          }));
        } catch {
          // ignore
        }
      }
      callback(data);
    } else {
      callback(null);
    }
  }, (err) => {
    console.error('Error listening to auction:', err);
  });
}

/**
 * Subscribe to real-time updates on a user's profile document
 */
export function subscribeToUserProfile(
  uid: string,
  callback: (profile: UserProfile | null) => void
) {
  if (!uid) {
    callback(null);
    return () => {};
  }
  const userRef = doc(db, 'users', uid);
  return onSnapshot(
    userRef,
    (snap) => {
      if (snap.exists()) {
        callback({
          uid: snap.id,
          ...snap.data()
        } as UserProfile);
      } else {
        callback(null);
      }
    },
    (err) => {
      console.error('Error listening to user profile:', err);
    }
  );
}

/**
 * Subscribe to all vehicle listings in Firestore
 */
export function subscribeToAllAuctions(
  callback: (auctions: Auction[]) => void
) {
  const auctionsCol = collection(db, 'auctions');
  return onSnapshot(auctionsCol, (snapshot) => {
    if (snapshot.empty) {
      callback([]);
      return;
    }
    const list: Auction[] = snapshot.docs.map((d) => {
      const data = d.data() as Auction;
      const lotId = d.id;
      // Resolve heroImages with robust fallback
      let heroImgs: string[] = Array.isArray(data.heroImages) ? data.heroImages : [];
      if (heroImgs.length === 0 && lotId === MAIN_AUCTION_ID) {
        heroImgs = DEFAULT_MEDIA_CONFIG.heroImages;
      }
      if (heroImgs.length === 0) {
        try {
          const cached = localStorage.getItem(`wailtail_custom_media_${lotId}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed.heroImages) && parsed.heroImages.length > 0) {
              heroImgs = parsed.heroImages;
            }
          }
        } catch {
          // ignore
        }
      }
      const leadHero = data.leadHeroImage || heroImgs[0] || '';
      return {
        ...data,
        id: lotId,
        heroImages: heroImgs,
        leadHeroImage: leadHero
      };
    });

    callback(list);
  }, (err) => {
    console.warn('Error fetching all auctions:', err);
    callback([]);
  });
}

/**
 * Generate a new distinct vehicle document/ID in Firestore populated with
 * clean empty text fields and empty image/video arrays (no image/text leaks from other listings)
 * and default CAD financials ($1,000 starting bid, $250 increment, 7-day duration).
 */
export async function createNewListing(title: string): Promise<Auction> {
  const cleanTitle = title.trim() || 'New Vehicle Listing';
  const slug = cleanTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30) || 'lot';
  const newId = `lot-${slug}-${Date.now().toString(36)}`;

  const newAuction: Auction = {
    id: newId,
    title: cleanTitle,
    subtitle: '',
    headline: '',
    make: '',
    model: '',
    year: '' as any,
    vin: '',
    mileage: '',
    distanceUnit: 'km',
    leadHeroImage: '',
    heroImages: [],
    highlightsBadge: '',
    watchCount: 0,
    location: '',
    sellerName: '',
    engine: '',
    drivetrain: '',
    exteriorColor: '',
    interior: '',
    titleStatus: '',
    currency: 'CAD',
    startTime: Date.now(),
    endTime: Date.now() + 7 * 24 * 60 * 60 * 1000,
    startingBid: 1000,
    minimumIncrement: 250,
    currentBid: 0,
    reserveAmount: 0,
    isReserveMet: true,
    bidCount: 0,
    highBidderId: '',
    highBidderName: '',
    highBidderEmail: '',
    status: 'upcoming',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  try {
    const docRef = doc(db, 'auctions', newId);
    await setDoc(docRef, sanitizePayload(newAuction));

    // Also initialize a completely clean media config for this specific auction with empty arrays
    const mediaRef = doc(db, 'settings', `media-${newId}`);
    const cleanMediaConfig: MediaConfiguration = {
      vehicleName: cleanTitle,
      heroImages: [],
      overviewHeading: '',
      overviewParagraphs: [],
      overviewImage: {
        url: '',
        caption: '',
        alt: ''
      },
      overviewSpecs: [],
      inlineShowcase: [],
      fullGallery: [],
      youtubePlaylistUrl: '',
      videoTitle: '',
      videoSubtitle: '',
      videoChapters: []
    };
    await setDoc(mediaRef, sanitizePayload(cleanMediaConfig));
  } catch (err) {
    console.warn('Saved new auction locally:', err);
  }

  return newAuction;
}

/**
 * Submit Seller Consignment Application
 */
export async function submitConsignmentApplication(
  app: Omit<ConsignmentApplication, 'id' | 'submittedAt' | 'status'>
): Promise<string> {
  // Query Firestore bidders or users collections by email prior to creating consignment document
  let registeredUserId: string | undefined = undefined;
  let isRegisteredUser = false;
  let registeredUserRole = 'GUEST';

  const cleanEmail = (app.sellerEmail || '').trim().toLowerCase();
  if (cleanEmail) {
    try {
      // 1. Check 'users' collection by email
      const usersCol = collection(db, 'users');
      const userQ = query(usersCol, where('email', '==', cleanEmail));
      const userSnap = await getDocs(userQ);
      if (!userSnap.empty) {
        const userDoc = userSnap.docs[0];
        const data = userDoc.data();
        registeredUserId = data?.uid || userDoc.id;
        isRegisteredUser = true;
        registeredUserRole = (data?.role || 'BIDDER').toUpperCase();
      } else {
        // 2. Check 'bidders' collection by email
        const biddersCol = collection(db, 'bidders');
        const bidderQ = query(biddersCol, where('email', '==', cleanEmail));
        const bidderSnap = await getDocs(bidderQ);
        if (!bidderSnap.empty) {
          const bidderDoc = bidderSnap.docs[0];
          const data = bidderDoc.data();
          registeredUserId = data?.uid || bidderDoc.id;
          isRegisteredUser = true;
          registeredUserRole = (data?.role || 'BIDDER').toUpperCase();
        }
      }
    } catch (err) {
      console.warn('Could not query users/bidders for consignment email lookup:', err);
    }
  }

  const payload: ConsignmentApplication = {
    ...app,
    submittedAt: Date.now(),
    status: 'pending',
    isRegisteredUser,
    registeredUserRole,
    ...(registeredUserId ? { registeredUserId } : {})
  };

  let createdId = `consignment-${Date.now()}`;
  try {
    const colRef = collection(db, 'consignment_applications');
    const docRef = await addDoc(colRef, sanitizePayload(payload));
    createdId = docRef.id;

    // Dual-write to legacy 'consignments' collection for backwards compatibility
    try {
      const legacyRef = doc(db, 'consignments', createdId);
      await setDoc(legacyRef, sanitizePayload(payload));
    } catch {
      // Silently continue if legacy write fails
    }
  } catch (err) {
    console.warn('Saved consignment locally fallback:', err);
  }

  // Non-blocking serverless email notification with 5000ms timeout
  (async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      await fetch('/api/send-consignment-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...payload,
          applicationId: createdId
        }),
        signal: controller.signal
      }).catch((fetchErr) => {
        console.warn('Non-blocking consignment email dispatch failed:', fetchErr);
      }).finally(() => {
        clearTimeout(timeoutId);
      });
    } catch (emailErr) {
      console.warn('Non-blocking consignment email error:', emailErr);
    }
  })();

  return createdId;
}

/**
 * Admin: Subscribe to consignment applications
 */
export function subscribeToConsignments(
  callback: (apps: ConsignmentApplication[]) => void
) {
  const colRef = collection(db, 'consignment_applications');
  const q = query(colRef, orderBy('submittedAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      // Check legacy consignments collection if consignment_applications is empty
      const legacyCol = collection(db, 'consignments');
      const legacyQ = query(legacyCol, orderBy('submittedAt', 'desc'));
      getDocs(legacyQ).then((legacySnap) => {
        const legacyList = legacySnap.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as ConsignmentApplication[];
        callback(legacyList);
      }).catch(() => callback([]));
      return;
    }
    const list: ConsignmentApplication[] = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    })) as ConsignmentApplication[];
    callback(list);
  }, (err) => {
    console.warn('Error fetching consignment_applications, falling back to consignments:', err);
    const legacyCol = collection(db, 'consignments');
    const legacyQ = query(legacyCol, orderBy('submittedAt', 'desc'));
    onSnapshot(legacyQ, (legacySnap) => {
      const list = legacySnap.docs.map(d => ({ id: d.id, ...d.data() })) as ConsignmentApplication[];
      callback(list);
    });
  });
}

/**
 * Resolves all matching document references for a user across both 'users' and 'bidders' collections.
 * Handles exact UID matches, document ID matches, and fallback email queries to prevent stale state.
 */
export async function resolveUserAndBidderDocuments(userId: string): Promise<{
  userDocRefs: DocumentReference[];
  bidderDocRefs: DocumentReference[];
  userData?: Partial<UserProfile>;
  resolvedUid: string;
}> {
  const cleanId = userId?.trim();
  if (!cleanId) throw new Error('User ID is required.');

  const userDocRefs = new Map<string, DocumentReference>();
  const bidderDocRefs = new Map<string, DocumentReference>();
  let mergedData: any = null;

  // 1. Direct doc reference in 'users'
  const directUserRef = doc(db, 'users', cleanId);
  try {
    const directUserSnap = await getDoc(directUserRef);
    if (directUserSnap.exists()) {
      userDocRefs.set(directUserRef.path, directUserRef);
      mergedData = { ...directUserSnap.data() };
    }
  } catch (err) {
    console.warn('Direct user doc fetch check failed:', err);
  }

  // 2. Query 'users' by field 'uid'
  try {
    const userQ = query(collection(db, 'users'), where('uid', '==', cleanId));
    const userSnap = await getDocs(userQ);
    userSnap.forEach((d) => {
      userDocRefs.set(d.ref.path, d.ref);
      if (!mergedData) mergedData = { ...d.data() };
      else mergedData = { ...d.data(), ...mergedData };
    });
  } catch (err) {
    console.warn('Users uid query check failed:', err);
  }

  // 3. Direct doc reference in 'bidders'
  const directBidderRef = doc(db, 'bidders', cleanId);
  try {
    const directBidderSnap = await getDoc(directBidderRef);
    if (directBidderSnap.exists()) {
      bidderDocRefs.set(directBidderRef.path, directBidderRef);
      if (!mergedData) mergedData = { ...directBidderSnap.data() };
      else mergedData = { ...directBidderSnap.data(), ...mergedData };
    }
  } catch (err) {
    console.warn('Direct bidder doc fetch check failed:', err);
  }

  // 4. Query 'bidders' by field 'uid'
  try {
    const bidderQ = query(collection(db, 'bidders'), where('uid', '==', cleanId));
    const bidderSnap = await getDocs(bidderQ);
    bidderSnap.forEach((d) => {
      bidderDocRefs.set(d.ref.path, d.ref);
      if (!mergedData) mergedData = { ...d.data() };
      else mergedData = { ...d.data(), ...mergedData };
    });
  } catch (err) {
    console.warn('Bidders uid query check failed:', err);
  }

  // 5. Cross-collection email check if mergedData contains email
  const cleanEmail = (mergedData?.email || '').trim().toLowerCase();
  if (cleanEmail) {
    if (userDocRefs.size === 0) {
      try {
        const uEmailQ = query(collection(db, 'users'), where('email', '==', cleanEmail));
        const uEmailSnap = await getDocs(uEmailQ);
        uEmailSnap.forEach((d) => {
          userDocRefs.set(d.ref.path, d.ref);
          mergedData = { ...d.data(), ...mergedData };
        });
      } catch (err) {
        console.warn('Users email query check failed:', err);
      }
    }
    if (bidderDocRefs.size === 0) {
      try {
        const bEmailQ = query(collection(db, 'bidders'), where('email', '==', cleanEmail));
        const bEmailSnap = await getDocs(bEmailQ);
        bEmailSnap.forEach((d) => {
          bidderDocRefs.set(d.ref.path, d.ref);
          mergedData = { ...d.data(), ...mergedData };
        });
      } catch (err) {
        console.warn('Bidders email query check failed:', err);
      }
    }
  }

  // Fallback defaults to ensure canonical targets exist even if document was absent
  if (userDocRefs.size === 0) {
    userDocRefs.set(directUserRef.path, directUserRef);
  }
  if (bidderDocRefs.size === 0) {
    bidderDocRefs.set(directBidderRef.path, directBidderRef);
  }

  const resolvedUid = mergedData?.uid || cleanId;

  return {
    userDocRefs: Array.from(userDocRefs.values()),
    bidderDocRefs: Array.from(bidderDocRefs.values()),
    userData: mergedData ? { uid: resolvedUid, ...mergedData } : { uid: resolvedUid },
    resolvedUid
  };
}

/**
 * Admin: Approve a consignment application, promote user to 'seller', and provision a blank assigned lot.
 */
export async function approveConsignmentAndPromoteSeller(
  applicationId: string,
  userUid?: string,
  vehicleTitle?: string
): Promise<Auction> {
  // 1. Update consignment application status in both collections
  try {
    const appRef = doc(db, 'consignment_applications', applicationId);
    await updateDoc(appRef, {
      status: 'approved',
      reviewedAt: Date.now()
    });
  } catch (err) {
    console.warn('Could not update consignment_applications doc status:', err);
  }
  try {
    const legacyRef = doc(db, 'consignments', applicationId);
    await updateDoc(legacyRef, {
      status: 'approved',
      reviewedAt: Date.now()
    });
  } catch {
    // Ignore legacy doc status failure
  }

  // 2. Promote user to 'seller' role if userUid exists and not admin
  if (userUid) {
    try {
      const { userDocRefs, bidderDocRefs, userData } = await resolveUserAndBidderDocuments(userUid);
      const currentRole = (userData?.role || '').toUpperCase();
      if (currentRole !== 'ADMIN') {
        const batch = writeBatch(db);
        const payload = {
          uid: userUid,
          ...(userData?.email ? { email: userData.email } : {}),
          ...(userData?.displayName ? { displayName: userData.displayName } : {}),
          role: 'seller',
          updatedAt: Date.now()
        };
        for (const ref of userDocRefs) {
          batch.set(ref, payload, { merge: true });
        }
        for (const ref of bidderDocRefs) {
          batch.set(ref, payload, { merge: true });
        }
        await batch.commit();
      }
    } catch (err) {
      console.warn('Could not promote user to seller:', err);
    }
  }

  // 3. Provision a blank assigned lot
  const lotTitle = vehicleTitle || 'Consigned Vehicle Lot';
  const newLot = await createNewListing(lotTitle);
  return newLot;
}

/**
 * Safely parse numeric reserve amount from text expectations (e.g. "Around 50k", "$50,000", "No Reserve")
 */
export function parseReserveAmount(reserveExpectation?: string | number | null): number {
  if (reserveExpectation == null) return 0;
  if (typeof reserveExpectation === 'number') {
    return isNaN(reserveExpectation) ? 0 : Math.max(0, reserveExpectation);
  }
  const str = String(reserveExpectation).trim();
  if (!str) return 0;
  if (/no\s*reserve/i.test(str)) return 0;

  // Suffix check like '50k' or '50 k'
  const kMatch = str.match(/(\d+(?:\.\d+)?)\s*k\b/i);
  if (kMatch) {
    const val = parseFloat(kMatch[1]) * 1000;
    return isNaN(val) ? 0 : Math.max(0, Math.round(val));
  }

  const cleaned = str.replace(/[^0-9.]/g, '');
  if (!cleaned) return 0;
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : Math.max(0, Math.round(parsed));
}

/**
 * 1-Click Consignment Approval & Draft Conversion
 * Converts incoming consignment submissions directly into pre-populated vehicle listing drafts.
 */
export async function convertConsignmentToDraftListing(consignmentId: string): Promise<string> {
  const cleanId = consignmentId?.trim();
  if (!cleanId) {
    throw new Error('Consignment ID is required for conversion.');
  }

  // 1. Fetch target consignment application
  const appRef = doc(db, 'consignment_applications', cleanId);
  let appSnap = await getDoc(appRef);

  if (!appSnap.exists()) {
    const legacyRef = doc(db, 'consignments', cleanId);
    appSnap = await getDoc(legacyRef);
  }

  if (!appSnap.exists()) {
    throw new Error(`Consignment application with ID "${cleanId}" not found.`);
  }

  const app = appSnap.data() as ConsignmentApplication;

  // 2. Prepare taxonomy, title, location, identification & financial parameters
  const yearStr = app.year != null ? String(app.year).trim() : '';
  const makeStr = (app.make || '').trim();
  const modelStr = (app.model || '').trim();
  const genStr = (app.generation || '').trim();

  const titleParts = [yearStr, makeStr, modelStr].filter(Boolean);
  const fullTitle = titleParts.length > 0 ? titleParts.join(' ') : 'Consigned Vehicle Listing';

  const highlightsBadge = [yearStr, makeStr, modelStr, genStr].filter(Boolean).map(s => String(s).trim()).filter(Boolean).join(' ');

  const city = (app.locationCity || '').trim();
  const province = (app.locationProvince || '').trim();
  const country = (app.locationCountry || '').trim();
  const structuredParts = [city, province, country].filter(Boolean);
  const locationCombined = structuredParts.length > 0
    ? structuredParts.join(', ')
    : (app.location || '').trim();

  const reserve = parseReserveAmount(app.reserveExpectation);

  const slug = fullTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30) || 'consigned-lot';
  const newAuctionId = `lot-${slug}-${Date.now().toString(36)}`;

  const now = Date.now();
  const newAuction: Auction = {
    id: newAuctionId,
    title: fullTitle,
    subtitle: genStr,
    headline: '',
    year: app.year,
    make: makeStr,
    model: modelStr,
    generation: genStr,
    vin: (app.vin || '').trim(),
    mileage: (app.mileage || '').trim(),
    distanceUnit: 'km',
    location: locationCombined,
    locationCity: city || undefined,
    locationProvince: province || undefined,
    locationCountry: country || undefined,
    sellerName: (app.sellerName || '').trim(),
    sellerEmail: (app.sellerEmail || '').trim(),
    sellerPhone: (app.sellerPhone || '').trim(),
    engine: '',
    drivetrain: '',
    exteriorColor: '',
    interior: '',
    titleStatus: 'Clean Registration',
    currency: 'CAD',
    startTime: now,
    endTime: now + 7 * 24 * 60 * 60 * 1000,
    startingBid: 1000,
    minimumIncrement: 250,
    currentBid: 0,
    reserveAmount: reserve,
    isReserveMet: reserve <= 0,
    bidCount: 0,
    highBidderId: '',
    highBidderName: '',
    highBidderEmail: '',
    highlightsBadge: highlightsBadge,
    watchCount: 0,
    status: 'preview',
    createdAt: now,
    updatedAt: now
  };

  const cleanMediaConfig: MediaConfiguration = {
    vehicleName: fullTitle,
    heroImages: [],
    overviewHeading: '',
    overviewParagraphs: [],
    overviewImage: {
      url: '',
      caption: '',
      alt: ''
    },
    overviewSpecs: [],
    inlineShowcase: [],
    fullGallery: [],
    youtubePlaylistUrl: '',
    videoTitle: '',
    videoSubtitle: '',
    videoChapters: []
  };

  // 3. Atomically create Auction document, media config & update consignment application status
  const batch = writeBatch(db);
  batch.set(doc(db, 'auctions', newAuctionId), sanitizePayload(newAuction));
  batch.set(doc(db, 'settings', `media-${newAuctionId}`), sanitizePayload(cleanMediaConfig));

  const targetAppRef = doc(db, 'consignment_applications', cleanId);
  batch.set(targetAppRef, {
    status: 'approved',
    convertedAuctionId: newAuctionId,
    reviewedAt: now
  }, { merge: true });

  const legacyRef = doc(db, 'consignments', cleanId);
  batch.set(legacyRef, {
    status: 'approved',
    convertedAuctionId: newAuctionId,
    reviewedAt: now
  }, { merge: true });

  // Promote consignor user to 'seller' if registered user exists and current role is 'BIDDER' or 'GUEST', preserving 'ADMIN'
  let targetUserId = app.registeredUserId;
  let targetRole = (app.registeredUserRole || 'GUEST').toUpperCase();

  if (!targetUserId && app.sellerEmail) {
    try {
      const cleanEmail = app.sellerEmail.trim().toLowerCase();
      const userQ = query(collection(db, 'users'), where('email', '==', cleanEmail));
      const userSnap = await getDocs(userQ);
      if (!userSnap.empty) {
        const uDoc = userSnap.docs[0];
        targetUserId = uDoc.data()?.uid || uDoc.id;
        targetRole = (uDoc.data()?.role || 'BIDDER').toUpperCase();
      } else {
        const bidderQ = query(collection(db, 'bidders'), where('email', '==', cleanEmail));
        const bidderSnap = await getDocs(bidderQ);
        if (!bidderSnap.empty) {
          const bDoc = bidderSnap.docs[0];
          targetUserId = bDoc.data()?.uid || bDoc.id;
          targetRole = (bDoc.data()?.role || 'BIDDER').toUpperCase();
        }
      }
    } catch (err) {
      console.warn('Could not resolve user for consignment seller promotion:', err);
    }
  }

  if (targetUserId && targetRole !== 'ADMIN') {
    try {
      const { userDocRefs, bidderDocRefs, userData } = await resolveUserAndBidderDocuments(targetUserId);
      const payload = {
        uid: targetUserId,
        ...(userData?.email ? { email: userData.email } : {}),
        ...(userData?.displayName ? { displayName: userData.displayName } : {}),
        role: 'seller',
        updatedAt: now
      };
      for (const ref of userDocRefs) {
        batch.set(ref, payload, { merge: true });
      }
      for (const ref of bidderDocRefs) {
        batch.set(ref, payload, { merge: true });
      }
    } catch (err) {
      console.warn('Could not resolve user doc refs for seller upgrade:', err);
      batch.set(doc(db, 'users', targetUserId), { role: 'seller', updatedAt: now }, { merge: true });
      batch.set(doc(db, 'bidders', targetUserId), { role: 'seller', updatedAt: now }, { merge: true });
    }
  }

  await batch.commit();
  return newAuctionId;
}

/**
 * Admin: Update status of a consignment application in consignment_applications.
 */
export async function updateConsignmentStatus(
  appId: string,
  status: 'pending' | 'approved' | 'rejected' | 'reviewed'
): Promise<void> {
  const cleanId = appId?.trim();
  if (!cleanId) {
    throw new Error('Consignment application ID is required.');
  }

  const updateData: Record<string, any> = {
    status,
    updatedAt: Date.now()
  };
  if (status === 'reviewed' || status === 'approved' || status === 'rejected') {
    updateData.reviewedAt = Date.now();
  }

  const appRef = doc(db, 'consignment_applications', cleanId);
  try {
    await updateDoc(appRef, updateData);
  } catch (err) {
    // If consignment_applications doc fails, fallback to legacy
    const legacyRef = doc(db, 'consignments', cleanId);
    try {
      await updateDoc(legacyRef, updateData);
      return;
    } catch {
      throw err;
    }
  }

  // Dual-update legacy 'consignments' collection if present
  try {
    const legacyRef = doc(db, 'consignments', cleanId);
    await updateDoc(legacyRef, updateData);
  } catch {
    // Ignore legacy doc error
  }
}

/**
 * Admin: Atomically delete a target consignment application document from consignment_applications.
 */
export async function deleteConsignmentApplication(appId: string, cascadeDeleteAuction = false): Promise<void> {
  const cleanId = appId?.trim();
  if (!cleanId) {
    throw new Error('Consignment application ID is required for deletion.');
  }

  let convertedAuctionId: string | undefined;
  if (cascadeDeleteAuction) {
    try {
      const appSnap = await getDoc(doc(db, 'consignment_applications', cleanId));
      if (appSnap.exists()) {
        convertedAuctionId = appSnap.data()?.convertedAuctionId;
      } else {
        const legacySnap = await getDoc(doc(db, 'consignments', cleanId));
        if (legacySnap.exists()) {
          convertedAuctionId = legacySnap.data()?.convertedAuctionId;
        }
      }
    } catch (e) {
      console.warn('Could not read convertedAuctionId for cascade deletion:', e);
    }
  }

  const appRef = doc(db, 'consignment_applications', cleanId);
  await deleteDoc(appRef);

  // Dual-delete from legacy 'consignments' collection if present
  try {
    const legacyRef = doc(db, 'consignments', cleanId);
    await deleteDoc(legacyRef);
  } catch {
    // Ignore legacy doc error
  }

  if (cascadeDeleteAuction && convertedAuctionId) {
    await deleteListing(convertedAuctionId, false);
  }
}

/**
 * Admin: Batch delete consignment applications using Firestore writeBatch with chunking (500 ops max).
 */
export async function batchDeleteConsignments(
  appIds: string[],
  cascadeDeleteAuctions = false
): Promise<number> {
  const validIds = appIds.map(id => id?.trim()).filter(Boolean) as string[];
  if (validIds.length === 0) return 0;

  const auctionIdsToDelete: string[] = [];
  if (cascadeDeleteAuctions) {
    try {
      for (let i = 0; i < validIds.length; i += 30) {
        const chunk = validIds.slice(i, i + 30);
        const promises = chunk.map(async id => {
          const snap = await getDoc(doc(db, 'consignment_applications', id));
          if (snap.exists() && snap.data()?.convertedAuctionId) {
            return snap.data().convertedAuctionId as string;
          }
          return null;
        });
        const results = await Promise.all(promises);
        results.forEach(id => {
          if (id) auctionIdsToDelete.push(id);
        });
      }
    } catch (err) {
      console.warn('Failed to resolve convertedAuctionIds during batchDeleteConsignments:', err);
    }
  }

  const CHUNK_SIZE = 150;
  for (let i = 0; i < validIds.length; i += CHUNK_SIZE) {
    const chunk = validIds.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const id of chunk) {
      batch.delete(doc(db, 'consignment_applications', id));
      batch.delete(doc(db, 'consignments', id));
    }
    await batch.commit();
  }

  if (cascadeDeleteAuctions && auctionIdsToDelete.length > 0) {
    await batchDeleteAuctions(auctionIdsToDelete, false);
  }

  return validIds.length;
}

/**
 * Admin: Batch update consignment application statuses using writeBatch with chunking (500 max).
 */
export async function batchUpdateConsignmentStatus(
  appIds: string[],
  status: ConsignmentApplication['status']
): Promise<number> {
  const validIds = appIds.map(id => id?.trim()).filter(Boolean) as string[];
  if (validIds.length === 0) return 0;

  const now = Date.now();
  const updateData: Record<string, any> = {
    status,
    updatedAt: now
  };
  if (status === 'reviewed' || status === 'approved' || status === 'rejected') {
    updateData.reviewedAt = now;
  }

  const CHUNK_SIZE = 200;
  for (let i = 0; i < validIds.length; i += CHUNK_SIZE) {
    const chunk = validIds.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const id of chunk) {
      batch.set(doc(db, 'consignment_applications', id), updateData, { merge: true });
      batch.set(doc(db, 'consignments', id), updateData, { merge: true });
    }
    await batch.commit();
  }
  return validIds.length;
}

/**
 * Fetch a single consignment application by ID with legacy fallback.
 */
export async function getConsignmentApplication(appId: string): Promise<ConsignmentApplication | null> {
  const cleanId = appId?.trim();
  if (!cleanId) return null;
  try {
    const appRef = doc(db, 'consignment_applications', cleanId);
    let appSnap = await getDoc(appRef);
    if (!appSnap.exists()) {
      const legacyRef = doc(db, 'consignments', cleanId);
      appSnap = await getDoc(legacyRef);
    }
    if (appSnap.exists()) {
      return { id: appSnap.id, ...appSnap.data() } as ConsignmentApplication;
    }
    return null;
  } catch (err) {
    console.warn('Could not fetch consignment application by ID:', err);
    return null;
  }
}

/**
 * Permanently delete a vehicle lot document, all child/root bid documents, media configuration,
 * and related data from Firestore using chunked batch writes (max 400 per batch).
 * Guarantees zero orphaned bid or media records remain in Firestore upon lot deletion.
 */
export async function deleteListing(auctionId: string, cascadeDeleteConsignment = false): Promise<void> {
  const targetId = auctionId?.trim();
  if (!targetId) return;

  const docRefsMap = new Map<string, DocumentReference>();

  // 1. Root auction document
  const auctionRef = doc(db, 'auctions', targetId);
  docRefsMap.set(auctionRef.path, auctionRef);

  // 2. Media configuration references (settings doc, subcollection media docs)
  const settingsMediaRef = doc(db, 'settings', `media-${targetId}`);
  const subMediaConfigRef = doc(db, 'auctions', targetId, 'media', 'config');
  docRefsMap.set(settingsMediaRef.path, settingsMediaRef);
  docRefsMap.set(subMediaConfigRef.path, subMediaConfigRef);

  try {
    const mediaSubColSnap = await getDocs(collection(db, 'auctions', targetId, 'media'));
    mediaSubColSnap.docs.forEach(d => docRefsMap.set(d.ref.path, d.ref));
  } catch (err) {
    console.warn(`Could not query media subcollection for lot ${targetId}:`, err);
  }

  // 3. Child bid documents in subcollection auctions/{auctionId}/bids
  try {
    const subBidsSnap = await getDocs(collection(db, 'auctions', targetId, 'bids'));
    subBidsSnap.docs.forEach(d => docRefsMap.set(d.ref.path, d.ref));
  } catch (err) {
    console.warn(`Could not query subcollection bids for lot ${targetId}:`, err);
  }

  // 4. Root bids collection documents matching auctionId
  try {
    const rootBidsSnap = await getDocs(query(collection(db, 'bids'), where('auctionId', '==', targetId)));
    rootBidsSnap.docs.forEach(d => docRefsMap.set(d.ref.path, d.ref));
  } catch (err) {
    console.warn(`Could not query root bids for lot ${targetId}:`, err);
  }

  // 5. Associated comments matching auctionId (e.g. bid comments & public feed)
  try {
    const commentsSnap = await getDocs(query(collection(db, 'comments'), where('auctionId', '==', targetId)));
    commentsSnap.docs.forEach(d => docRefsMap.set(d.ref.path, d.ref));
  } catch (err) {
    console.warn(`Could not query comments for lot ${targetId}:`, err);
  }

  // 6. Optional cascade delete for consignment applications
  if (cascadeDeleteConsignment) {
    try {
      const q = query(collection(db, 'consignment_applications'), where('convertedAuctionId', '==', targetId));
      const snap = await getDocs(q);
      snap.forEach(d => {
        const appRef = doc(db, 'consignment_applications', d.id);
        const legacyRef = doc(db, 'consignments', d.id);
        docRefsMap.set(appRef.path, appRef);
        docRefsMap.set(legacyRef.path, legacyRef);
      });
    } catch (e) {
      console.warn('Could not cascade delete consignment for listing:', e);
    }
  }

  // 7. Atomically commit deletions chunked in groups of 400 (Firestore limit is 500)
  const allDocRefs = Array.from(docRefsMap.values());
  const CHUNK_SIZE = 400;
  for (let i = 0; i < allDocRefs.length; i += CHUNK_SIZE) {
    const chunk = allDocRefs.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const ref of chunk) {
      batch.delete(ref);
    }
    await batch.commit();
  }

  localStorage.removeItem(`wailtail_custom_media_${targetId}`);
  localStorage.removeItem('wailtail_custom_media');
  localStorage.removeItem('wailtail_active_lot');
}

/**
 * Admin: Batch delete auctions and cascadingly purge associated bids, media, and consignments.
 */
export async function batchDeleteAuctions(
  auctionIds: string[],
  cascadeDeleteConsignments = false
): Promise<number> {
  const validIds = auctionIds.map(id => id?.trim()).filter(Boolean) as string[];
  if (validIds.length === 0) return 0;

  for (const auctionId of validIds) {
    await deleteListing(auctionId, cascadeDeleteConsignments);
  }

  return validIds.length;
}

/**
 * Admin: Batch update auction lot statuses using writeBatch with chunking (500 max).
 */
export async function batchUpdateAuctionStatus(
  auctionIds: string[],
  status: Auction['status']
): Promise<number> {
  const validIds = auctionIds.map(id => id?.trim()).filter(Boolean) as string[];
  if (validIds.length === 0) return 0;

  const now = Date.now();
  const updateData: Record<string, any> = {
    status,
    updatedAt: now
  };

  const CHUNK_SIZE = 400;
  for (let i = 0; i < validIds.length; i += CHUNK_SIZE) {
    const chunk = validIds.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const id of chunk) {
      batch.set(doc(db, 'auctions', id), updateData, { merge: true });
    }
    await batch.commit();
  }
  return validIds.length;
}

/**
 * Duplicate an existing listing into a clean copy draft.
 */
export async function duplicateListing(
  sourceAuctionOrId: Auction | string,
  sourceMediaConfig?: MediaConfiguration
): Promise<Auction> {
  let sourceAuction: Auction;
  if (typeof sourceAuctionOrId === 'string') {
    try {
      const docRef = doc(db, 'auctions', sourceAuctionOrId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        sourceAuction = snap.data() as Auction;
      } else {
        sourceAuction = { ...BLANK_AUCTION, id: sourceAuctionOrId };
      }
    } catch {
      sourceAuction = { ...BLANK_AUCTION, id: sourceAuctionOrId };
    }
  } else {
    sourceAuction = sourceAuctionOrId;
  }

  const cleanTitle = `${sourceAuction.title || 'Vehicle Listing'} (Copy)`;
  const slug = cleanTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 25) || 'lot';
  const newId = `lot-${slug}-${Date.now().toString(36)}`;

  const duplicatedAuction: Auction = {
    ...sourceAuction,
    id: newId,
    title: cleanTitle,
    headline: sourceAuction.headline ? `${sourceAuction.headline} (Copy)` : cleanTitle,
    status: 'upcoming',
    currentBid: 0,
    bidCount: 0,
    highBidderId: '',
    highBidderName: '',
    highBidderEmail: '',
    watchCount: 0,
    startTime: Date.now(),
    endTime: Date.now() + 7 * 24 * 60 * 60 * 1000,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  try {
    const docRef = doc(db, 'auctions', newId);
    await setDoc(docRef, sanitizePayload(duplicatedAuction));

    if (sourceMediaConfig) {
      const mediaRef = doc(db, 'settings', `media-${newId}`);
      await setDoc(mediaRef, sanitizePayload({
        ...sourceMediaConfig,
        vehicleName: cleanTitle
      }));
    }
  } catch (err) {
    console.warn('Saved duplicated auction locally:', err);
  }

  return duplicatedAuction;
}

/**
 * Subscribe to real-time bid updates (ordered descending by amount / timestamp)
 */
export function subscribeToBids(
  auctionId: string,
  callback: (bids: Bid[]) => void
) {
  const q = query(
    collection(db, 'bids'),
    where('auctionId', '==', auctionId),
    orderBy('amount', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const bids: Bid[] = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data()
    })) as Bid[];
    callback(bids);
  }, (err) => {
    console.error('Error listening to bids:', err);
  });
}

/**
 * Subscribe to real-time comments (ordered by timestamp)
 */
export function subscribeToComments(
  auctionId: string,
  callback: (comments: Comment[]) => void
) {
  const q = query(
    collection(db, 'comments'),
    where('auctionId', '==', auctionId),
    orderBy('timestamp', 'asc')
  );

  return onSnapshot(q, (snapshot) => {
    const comments: Comment[] = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data()
    })) as Comment[];
    callback(comments);
  }, (err) => {
    console.error('Error listening to comments:', err);
  });
}

/**
 * Place a Bid with Anti-Sniping Protection
 */
export async function placeBidWithAntiSnipe(
  auctionId: string,
  amount: number,
  bidder: {
    uid: string;
    displayName: string;
    email: string;
  }
): Promise<{ success: boolean; message?: string; antiSniped?: boolean; newEndTime?: number }> {
  if (!auth.currentUser) {
    throw new Error("Please log in to place a bid");
  }

  const auctionRef = doc(db, 'auctions', auctionId);

  return await runTransaction(db, async (transaction) => {
    const auctionSnap = await transaction.get(auctionRef);
    if (!auctionSnap.exists()) {
      throw new Error("Auction does not exist.");
    }

    const auctionData = auctionSnap.data() as Auction;
    const now = Date.now();

    // Check if bidder has been revoked or banned by administrator
    if (bidder.uid) {
      const userRef = doc(db, 'users', bidder.uid);
      const userSnap = await transaction.get(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data() as UserProfile;
        if (userData.bannedFromBidding) {
          throw new Error("Your bidding privileges have been revoked by the auction administrator.");
        }
      }
    }

    // Check if auction is active
    if (now < auctionData.startTime) {
      throw new Error("Auction has not started yet.");
    }
    if (now > auctionData.endTime || auctionData.status === 'ended') {
      throw new Error("Auction has already ended.");
    }

    // Minimum required bid validation
    const minRequired = auctionData.currentBid > 0 
      ? auctionData.currentBid + auctionData.minimumIncrement 
      : auctionData.startingBid;

    if (amount < minRequired) {
      throw new Error(`Bid must be at least $${minRequired.toLocaleString()}.`);
    }

    // Check reserve status
    const isReserveMet = amount >= auctionData.reserveAmount || auctionData.isReserveMet;

    // Capture previous lead bidder for outbid alert
    const prevHighBidderEmail = auctionData.highBidderEmail;
    const prevHighBidderName = auctionData.highBidderName;
    const prevHighBidderId = auctionData.highBidderId;
    const prevAmount = auctionData.currentBid;

    // Anti-sniping logic:
    // If a bid is placed within the final 2 minutes, extend the countdown timer back to 2 minutes
    let newEndTime = auctionData.endTime;
    let antiSniped = false;
    const remainingTime = auctionData.endTime - now;

    if (remainingTime <= ANTI_SNIPING_WINDOW_MS) {
      newEndTime = now + ANTI_SNIPING_EXTENSION_MS;
      antiSniped = true;
    }

    // Update auction doc
    transaction.update(auctionRef, {
      currentBid: amount,
      bidCount: (auctionData.bidCount || 0) + 1,
      highBidderId: bidder.uid,
      highBidderName: bidder.displayName,
      highBidderEmail: bidder.email,
      isReserveMet,
      endTime: newEndTime,
      updatedAt: now
    });

    // Create bid record in bids collection
    const newBidRef = doc(collection(db, 'bids'));
    const bidRecord: Bid = {
      id: newBidRef.id,
      auctionId,
      amount,
      bidderId: bidder.uid,
      bidderName: bidder.displayName,
      bidderEmail: bidder.email,
      timestamp: now,
      antiSniped
    };
    transaction.set(newBidRef, bidRecord);

    // Also add an automated comment entry in public comment feed for live bid tracking
    const newCommentRef = doc(collection(db, 'comments'));
    const bidComment: Comment = {
      id: newCommentRef.id,
      auctionId,
      userId: bidder.uid,
      userName: bidder.displayName,
      userBadge: 'Verified Bidder',
      text: `Bid placed for $${amount.toLocaleString()}${antiSniped ? ' (Timer extended +2:00 via Anti-Sniping)' : ''}`,
      timestamp: now,
      upvotes: 0,
      upvotedBy: [],
      isBid: true,
      bidAmount: amount
    };
    transaction.set(newCommentRef, bidComment);

    // Dispatched after transaction resolves successfully
    setTimeout(() => {
      // 1. Transactional Email to new high bidder
      if (bidder.email) {
        sendBidPlacedEmail({
          toEmail: bidder.email,
          bidderName: bidder.displayName,
          bidAmount: amount,
          vehicleTitle: auctionData.title || "Wailtail Single-Car Auction",
          auctionId,
          isReserveMet,
          endTime: newEndTime,
          antiSniped
        }).catch(err => console.warn('Transactional email send error:', err));
      }

      // 2. Outbid alert email to previous high bidder
      if (prevHighBidderEmail && prevHighBidderId && prevHighBidderId !== bidder.uid) {
        sendOutbidAlertEmail({
          toEmail: prevHighBidderEmail,
          bidderName: prevHighBidderName || "Registered Bidder",
          previousBidAmount: prevAmount,
          newBidAmount: amount,
          vehicleTitle: auctionData.title || "Wailtail Single-Car Auction",
          auctionId,
          endTime: newEndTime
        }).catch(err => console.warn('Outbid alert email error:', err));
      }
    }, 100);

    return {
      success: true,
      antiSniped,
      newEndTime: antiSniped ? newEndTime : undefined
    };
  });
}

export const placeBid = placeBidWithAntiSnipe;

/**
 * Remove or Ban a Bidder (Moderation)
 * Clears their active bids from the bid log and revokes bidding privileges.
 */
export async function banOrRemoveBidder(userId: string, auctionId: string): Promise<void> {
  // 1. Mark user as banned in 'users' collection
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      bannedFromBidding: true,
      bannedAt: Date.now()
    });
  } catch (err) {
    console.warn('Could not update user doc for ban:', err);
  }

  // 2. Delete all bids from 'bids' collection placed by this user for this auction
  try {
    const bidsCol = collection(db, 'bids');
    const bidsSnap = await getDocs(query(bidsCol, where('bidderId', '==', userId), where('auctionId', '==', auctionId)));
    const batch = writeBatch(db);
    bidsSnap.docs.forEach(d => batch.delete(d.ref));

    // 3. Delete bid comments placed by this user
    const commentsCol = collection(db, 'comments');
    const commentsSnap = await getDocs(query(commentsCol, where('userId', '==', userId), where('isBid', '==', true)));
    commentsSnap.docs.forEach(d => batch.delete(d.ref));

    await batch.commit();

    // 4. Recalculate high bidder and current bid from remaining bids
    const remainingBidsSnap = await getDocs(query(bidsCol, where('auctionId', '==', auctionId), orderBy('amount', 'desc')));
    const auctionRef = doc(db, 'auctions', auctionId);
    const auctionSnap = await getDoc(auctionRef);
    const auctionData = auctionSnap.exists() ? (auctionSnap.data() as Auction) : null;
    const reserveAmount = auctionData?.reserveAmount || 0;

    if (remainingBidsSnap.empty) {
      await updateDoc(auctionRef, {
        currentBid: auctionData?.startingBid || 0,
        bidCount: 0,
        highBidderId: '',
        highBidderName: '',
        highBidderEmail: '',
        isReserveMet: false,
        updatedAt: Date.now()
      });
    } else {
      const highestRemaining = remainingBidsSnap.docs[0].data() as Bid;
      await updateDoc(auctionRef, {
        currentBid: highestRemaining.amount,
        bidCount: remainingBidsSnap.docs.length,
        highBidderId: highestRemaining.bidderId,
        highBidderName: highestRemaining.bidderName,
        highBidderEmail: highestRemaining.bidderEmail,
        isReserveMet: highestRemaining.amount >= reserveAmount,
        updatedAt: Date.now()
      });
    }
  } catch (err) {
    console.error('Error during bidder purge:', err);
    throw err;
  }
}

/**
 * Administratively retract a bid (Option B soft retraction).
 * Preserves the historical bid document in the audit trail with retraction metadata,
 * while atomically recalculating auction telemetry (currentBid, bidCount, highBidder, reserve status).
 */
export async function retractBid(
  auctionId: string,
  bidId: string,
  reason: string,
  adminUserId: string,
  adminDisplayName?: string
): Promise<{ success: boolean; message?: string }> {
  if (!reason || !reason.trim()) {
    throw new Error('A valid reason for retraction is required.');
  }
  if (!bidId || !bidId.trim()) {
    throw new Error('bidId is required to retract a bid.');
  }

  const cleanReason = reason.trim();
  const cleanAuctionId = auctionId?.trim() || '';
  const topBidRef = doc(db, 'bids', bidId.trim());
  const subBidRef = cleanAuctionId ? doc(db, 'auctions', cleanAuctionId, 'bids', bidId.trim()) : null;
  const auctionRef = cleanAuctionId ? doc(db, 'auctions', cleanAuctionId) : null;

  return await runTransaction(db, async (transaction) => {
    // 1. Transactional reads must precede writes
    const auctionSnap = auctionRef ? await transaction.get(auctionRef) : null;
    const topBidSnap = await transaction.get(topBidRef);
    const subBidSnap = subBidRef ? await transaction.get(subBidRef) : null;

    let targetBidRef = topBidSnap.exists() ? topBidRef : (subBidSnap?.exists() && subBidRef ? subBidRef : null);
    let bidSnap = topBidSnap.exists() ? topBidSnap : (subBidSnap?.exists() ? subBidSnap : null);

    // If targetBidRef not resolved yet, check if topBidSnap has auctionId
    if (!targetBidRef && topBidSnap.exists()) {
      targetBidRef = topBidRef;
      bidSnap = topBidSnap;
    }

    const parentAuctionExists = auctionSnap?.exists() ?? false;
    const now = Date.now();
    const retractionAuditPayload = {
      status: 'retracted' as const,
      retractedAt: now,
      retractionReason: cleanReason,
      retractedBy: adminUserId || 'admin',
      retractedByName: adminDisplayName || adminUserId || 'admin'
    };

    // -------------------------------------------------------------
    // ORPHANED BID FALLBACK SCENARIO (PARENT AUCTION DOES NOT EXIST)
    // -------------------------------------------------------------
    if (!parentAuctionExists) {
      if (bidSnap && targetBidRef) {
        const bidData = bidSnap.data() as Bid;
        if (bidData.status === 'retracted') {
          throw new Error('This bid has already been retracted.');
        }

        // Bypass lot high-bid/count recalculation logic, update bid document status
        transaction.set(targetBidRef, retractionAuditPayload, { merge: true });

        // If bid exists in both root and subcollection, update both paths
        if (topBidSnap.exists() && targetBidRef.path !== topBidRef.path) {
          transaction.set(topBidRef, retractionAuditPayload, { merge: true });
        }
        if (subBidSnap?.exists() && subBidRef && targetBidRef.path !== subBidRef.path) {
          transaction.set(subBidRef, retractionAuditPayload, { merge: true });
        }

        return {
          success: true,
          message: 'Orphaned bid record marked as retracted (parent lot does not exist).'
        };
      } else {
        // Unresolvable bid record: delete references directly if possible or resolve cleanly
        try {
          transaction.delete(topBidRef);
          if (subBidRef) transaction.delete(subBidRef);
        } catch {
          // ignore
        }
        return {
          success: true,
          message: 'Orphaned bid was unresolvable and references purged.'
        };
      }
    }

    // -------------------------------------------------------------
    // ACTIVE LOT SCENARIO (PARENT AUCTION EXISTS)
    // -------------------------------------------------------------
    if (!bidSnap || !targetBidRef) {
      throw new Error(`Bid record "${bidId}" does not exist.`);
    }

    const bidData = bidSnap.data() as Bid;
    if (bidData.status === 'retracted') {
      throw new Error('This bid has already been retracted.');
    }

    // Query remaining bids for this auction across top-level 'bids' and 'auctions/{auctionId}/bids'
    const topBidsSnap = await getDocs(
      query(collection(db, 'bids'), where('auctionId', '==', cleanAuctionId))
    );
    const collectedBids: Bid[] = topBidsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Bid));

    try {
      const subBidsSnap = await getDocs(
        collection(db, 'auctions', cleanAuctionId, 'bids')
      );
      subBidsSnap.docs.forEach(d => {
        if (!collectedBids.some(b => b.id === d.id)) {
          collectedBids.push({ id: d.id, ...d.data() } as Bid);
        }
      });
    } catch {
      // Subcollection fallback
    }

    // Filter remaining active bids:
    // Exclude the bid currently being retracted
    // Exclude any bid where status === 'retracted' (legacy documents where status is undefined are treated as 'active')
    const remainingActiveBids = collectedBids
      .filter(b => b.id !== bidId && b.status !== 'retracted')
      .sort((a, b) => {
        if (b.amount !== a.amount) return b.amount - a.amount;
        return (b.timestamp || 0) - (a.timestamp || 0);
      });

    // Mark target bid record with status: 'retracted', retractedAt, retractionReason, retractedBy
    transaction.set(targetBidRef, retractionAuditPayload, { merge: true });

    // If bid was stored in top-level, also update subcollection doc if it exists
    if (topBidSnap.exists() && targetBidRef.path !== topBidRef.path) {
      transaction.set(topBidRef, retractionAuditPayload, { merge: true });
    }
    if (subBidSnap?.exists() && subBidRef && targetBidRef.path !== subBidRef.path) {
      transaction.set(subBidRef, retractionAuditPayload, { merge: true });
    }

    // Recalculate root document auctions/{auctionId} telemetry
    const auctionData = auctionSnap!.data() as Auction;
    const startingBid = Number(auctionData.startingBid) || 0;
    const reserveAmount = Number(auctionData.reserveAmount) || 0;

    if (remainingActiveBids.length > 0) {
      const highestActiveBid = remainingActiveBids[0];
      const currentBid = highestActiveBid.amount;
      const bidCount = remainingActiveBids.length;
      const isReserveMet = currentBid >= reserveAmount;

      transaction.update(auctionRef!, {
        currentBid,
        bidCount,
        isReserveMet,
        highBidderId: highestActiveBid.bidderId || '',
        highBidderName: highestActiveBid.bidderName || '',
        highBidderEmail: highestActiveBid.bidderEmail || '',
        updatedAt: now
      });
    } else {
      // Zero active bids remain: reset currentBid = startingBid, bidCount = 0, isReserveMet = false
      transaction.update(auctionRef!, {
        currentBid: startingBid,
        bidCount: 0,
        isReserveMet: false,
        highBidderId: '',
        highBidderName: '',
        highBidderEmail: '',
        updatedAt: now
      });
    }

    return {
      success: true,
      message: 'Bid successfully retracted and auction telemetry recalculated.'
    };
  });
}

/**
 * Unban a Bidder / Restore Bidding Privileges
 */
export async function unbanBidder(userId: string): Promise<void> {
  await setUserBannedStatus(userId, false);
}

/**
 * Admin: Update user role (supports 3-way matrix: 'ADMIN' | 'SELLER' | 'BIDDER')
 * Persists updates atomically across Firestore 'users' and 'bidders' collections.
 */
export async function updateUserRole(userId: string, newRole: UserRole | string): Promise<void> {
  if (!userId) throw new Error('User ID is required to update role.');
  const normalizedRole = newRole.toLowerCase() as 'admin' | 'seller' | 'bidder';
  const { userDocRefs, bidderDocRefs, userData, resolvedUid } = await resolveUserAndBidderDocuments(userId);

  const batch = writeBatch(db);
  const payload = {
    uid: resolvedUid,
    ...(userData?.email ? { email: userData.email } : {}),
    ...(userData?.displayName ? { displayName: userData.displayName } : {}),
    role: normalizedRole,
    updatedAt: Date.now()
  };

  for (const ref of userDocRefs) {
    batch.set(ref, payload, { merge: true });
  }
  for (const ref of bidderDocRefs) {
    batch.set(ref, payload, { merge: true });
  }

  await batch.commit();
}

/**
 * Admin: Set user banned status (ban/unban)
 * Persists updates atomically across Firestore 'users' and 'bidders' collections.
 */
export async function setUserBannedStatus(userId: string, isBanned: boolean): Promise<void> {
  if (!userId) throw new Error('User ID is required to update banned status.');
  const { userDocRefs, bidderDocRefs, userData, resolvedUid } = await resolveUserAndBidderDocuments(userId);

  const batch = writeBatch(db);
  const payload = {
    uid: resolvedUid,
    ...(userData?.email ? { email: userData.email } : {}),
    ...(userData?.displayName ? { displayName: userData.displayName } : {}),
    isBanned,
    bannedFromBidding: isBanned,
    bannedAt: isBanned ? Date.now() : null,
    updatedAt: Date.now()
  };

  for (const ref of userDocRefs) {
    batch.set(ref, payload, { merge: true });
  }
  for (const ref of bidderDocRefs) {
    batch.set(ref, payload, { merge: true });
  }

  await batch.commit();
}

/**
 * Admin: Set user email verified status
 * Persists updates atomically across Firestore 'users' and 'bidders' collections.
 */
export async function setUserEmailVerified(userId: string, isVerified: boolean): Promise<void> {
  if (!userId) throw new Error('User ID is required to update email verification.');
  const { userDocRefs, bidderDocRefs, userData, resolvedUid } = await resolveUserAndBidderDocuments(userId);

  const batch = writeBatch(db);
  const payload = {
    uid: resolvedUid,
    ...(userData?.email ? { email: userData.email } : {}),
    ...(userData?.displayName ? { displayName: userData.displayName } : {}),
    isEmailVerified: isVerified,
    updatedAt: Date.now()
  };

  for (const ref of userDocRefs) {
    batch.set(ref, payload, { merge: true });
  }
  for (const ref of bidderDocRefs) {
    batch.set(ref, payload, { merge: true });
  }

  await batch.commit();
}

/**
 * Permanent User Deletion Service
 * Atomically deletes matching user documents from both 'users' and 'bidders' Firestore collections.
 */
export async function deleteUserRecord(userId: string): Promise<void> {
  const cleanId = userId?.trim();
  if (!cleanId) throw new Error('User ID is required for deletion.');

  const { userDocRefs, bidderDocRefs } = await resolveUserAndBidderDocuments(cleanId);
  const batch = writeBatch(db);

  for (const ref of userDocRefs) {
    batch.delete(ref);
  }
  for (const ref of bidderDocRefs) {
    batch.delete(ref);
  }

  await batch.commit();
}

/**
 * Member Email Lookup Service
 * Query Firestore users / bidders by normalized lowercase email address and return account metadata.
 */
export async function checkUserAccountByEmail(
  email: string
): Promise<{ exists: boolean; role?: UserRole; name?: string } | null> {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { exists: false };
  }

  try {
    // 1. Query 'users' collection
    const usersCol = collection(db, 'users');
    const userQ = query(usersCol, where('email', '==', cleanEmail));
    const userSnap = await getDocs(userQ);

    if (!userSnap.empty) {
      const data = userSnap.docs[0].data();
      const rawRole = (data?.role || 'BIDDER').toUpperCase();
      const role: UserRole = rawRole === 'ADMIN' ? 'ADMIN' : rawRole === 'SELLER' ? 'SELLER' : 'BIDDER';
      const name = data?.displayName || data?.name || '';
      return { exists: true, role, name };
    }

    // 2. Query 'bidders' collection
    const biddersCol = collection(db, 'bidders');
    const bidderQ = query(biddersCol, where('email', '==', cleanEmail));
    const bidderSnap = await getDocs(bidderQ);

    if (!bidderSnap.empty) {
      const data = bidderSnap.docs[0].data();
      const rawRole = (data?.role || 'BIDDER').toUpperCase();
      const role: UserRole = rawRole === 'ADMIN' ? 'ADMIN' : rawRole === 'SELLER' ? 'SELLER' : 'BIDDER';
      const name = data?.displayName || data?.name || '';
      return { exists: true, role, name };
    }

    return { exists: false };
  } catch (err) {
    console.warn('Error looking up user account by email:', err);
    return null;
  }
}

/**
 * Toggle Watchlist Count
 */
export async function toggleWatchAuction(auctionId: string, isWatching: boolean): Promise<number> {
  try {
    const auctionRef = doc(db, 'auctions', auctionId);
    const snap = await getDoc(auctionRef);
    const currentCount = snap.exists() ? (snap.data().watchCount ?? 18) : 18;
    const newCount = Math.max(0, isWatching ? currentCount + 1 : currentCount - 1);
    await updateDoc(auctionRef, { watchCount: newCount });
    return newCount;
  } catch (err) {
    console.warn('Failed to update watch count on server:', err);
    return isWatching ? 19 : 18;
  }
}

/**
 * Toggle a lot in the user's personal saved watchlist array in Firestore (users/{uid}).
 */
export async function toggleWatchlistLot(
  userId: string,
  auctionId: string
): Promise<{ isWatching: boolean; watchlist: string[] }> {
  const cleanUid = userId?.trim();
  const cleanAuctionId = auctionId?.trim();
  if (!cleanUid || !cleanAuctionId) {
    throw new Error('User ID and Auction ID are required to toggle watchlist.');
  }

  const userRef = doc(db, 'users', cleanUid);
  const snap = await getDoc(userRef);
  let currentList: string[] = [];

  if (snap.exists()) {
    const data = snap.data() as UserProfile;
    currentList = Array.isArray(data.watchlist) ? data.watchlist : [];
  }

  const isCurrentlyWatching = currentList.includes(cleanAuctionId);
  const nextIsWatching = !isCurrentlyWatching;

  if (isCurrentlyWatching) {
    try {
      await updateDoc(userRef, {
        watchlist: arrayRemove(cleanAuctionId)
      });
    } catch {
      await setDoc(userRef, { watchlist: currentList.filter(id => id !== cleanAuctionId) }, { merge: true });
    }

    try {
      const bidderRef = doc(db, 'bidders', cleanUid);
      const bSnap = await getDoc(bidderRef);
      if (bSnap.exists()) {
        await updateDoc(bidderRef, { watchlist: arrayRemove(cleanAuctionId) });
      }
    } catch {
      // ignore
    }
  } else {
    try {
      await updateDoc(userRef, {
        watchlist: arrayUnion(cleanAuctionId)
      });
    } catch {
      await setDoc(userRef, { watchlist: [...currentList, cleanAuctionId] }, { merge: true });
    }

    try {
      const bidderRef = doc(db, 'bidders', cleanUid);
      const bSnap = await getDoc(bidderRef);
      if (bSnap.exists()) {
        await updateDoc(bidderRef, { watchlist: arrayUnion(cleanAuctionId) });
      }
    } catch {
      // ignore
    }
  }

  // Synchronize auction aggregate watchCount
  try {
    await toggleWatchAuction(cleanAuctionId, nextIsWatching);
  } catch (err) {
    console.warn('Failed to sync auction watchCount:', err);
  }

  const updatedWatchlist = nextIsWatching
    ? [...currentList.filter(id => id !== cleanAuctionId), cleanAuctionId]
    : currentList.filter(id => id !== cleanAuctionId);

  return { isWatching: nextIsWatching, watchlist: updatedWatchlist };
}

/**
 * Fetch all saved vehicle auctions in a user's watchlist array.
 */
export async function fetchUserWatchlist(userId: string): Promise<Auction[]> {
  const cleanUid = userId?.trim();
  if (!cleanUid) return [];

  try {
    const userRef = doc(db, 'users', cleanUid);
    const snap = await getDoc(userRef);
    let watchlistIds: string[] = [];

    if (snap.exists()) {
      const data = snap.data() as UserProfile;
      watchlistIds = Array.isArray(data.watchlist) ? data.watchlist : [];
    } else {
      const bidderRef = doc(db, 'bidders', cleanUid);
      const bSnap = await getDoc(bidderRef);
      if (bSnap.exists()) {
        const bData = bSnap.data() as UserProfile;
        watchlistIds = Array.isArray(bData.watchlist) ? bData.watchlist : [];
      }
    }

    if (!watchlistIds || watchlistIds.length === 0) {
      return [];
    }

    const auctionPromises = watchlistIds.map(async (lotId) => {
      try {
        const lotRef = doc(db, 'auctions', lotId);
        const lotSnap = await getDoc(lotRef);
        if (lotSnap.exists()) {
          const data = lotSnap.data() as Auction;
          let heroImgs: string[] = Array.isArray(data.heroImages) ? data.heroImages : [];
          if (heroImgs.length === 0 && lotId === MAIN_AUCTION_ID) {
            heroImgs = DEFAULT_MEDIA_CONFIG.heroImages;
          }
          const leadHero = data.leadHeroImage || heroImgs[0] || '';
          return {
            ...data,
            id: lotSnap.id,
            heroImages: heroImgs,
            leadHeroImage: leadHero
          } as Auction;
        }
      } catch (err) {
        console.warn(`Failed to fetch watchlisted auction "${lotId}":`, err);
      }
      return null;
    });

    const results = await Promise.all(auctionPromises);
    return results.filter((a): a is Auction => a !== null);
  } catch (err) {
    console.error('Error fetching user watchlist:', err);
    return [];
  }
}

/**
 * Submit Seller Inquiry (Contact Seller)
 */
export async function submitSellerInquiry(inquiry: {
  auctionId: string;
  senderId: string;
  senderName: string;
  senderEmail: string;
  senderPhone?: string;
  topic: string;
  message: string;
  vehicleTitle: string;
  sellerEmail?: string;
}): Promise<void> {
  try {
    const inquiriesCol = collection(db, 'inquiries');
    await addDoc(inquiriesCol, {
      auctionId: inquiry.auctionId,
      senderId: inquiry.senderId,
      senderName: inquiry.senderName,
      senderEmail: inquiry.senderEmail,
      senderPhone: inquiry.senderPhone || '',
      topic: inquiry.topic,
      message: inquiry.message,
      timestamp: Date.now(),
      status: 'new'
    });
  } catch (err) {
    console.warn('Failed to save inquiry to Firestore:', err);
  }

  // Dispatch email notification to seller
  const targetSellerEmail = inquiry.sellerEmail || 'jeremy@theinnovativegroup.ca';
  await sendSellerInquiryEmail({
    sellerEmail: targetSellerEmail,
    senderName: inquiry.senderName,
    senderEmail: inquiry.senderEmail,
    senderPhone: inquiry.senderPhone,
    topic: inquiry.topic,
    message: inquiry.message,
    vehicleTitle: inquiry.vehicleTitle
  }).catch(err => console.warn('Inquiry email notice:', err));
}

export const submitInquiry = submitSellerInquiry;


/**
 * Post a public Q&A comment
 */
export async function postComment(
  auctionId: string,
  commentData: {
    userId: string;
    userName: string;
    userEmail?: string;
    userBadge?: 'Seller' | 'Verified Bidder' | 'High Bidder' | 'Admin' | 'Member';
    text: string;
    replyToId?: string;
  }
) {
  const commentsCol = collection(db, 'comments');
  
  // Construct object with only defined values to prevent Firestore undefined errors
  const payload: Record<string, any> = {
    auctionId,
    userId: commentData.userId,
    userName: commentData.userName,
    userBadge: commentData.userBadge || 'Member',
    text: commentData.text,
    timestamp: Date.now(),
    upvotes: 0,
    upvotedBy: []
  };

  if (commentData.userEmail) {
    payload.userEmail = commentData.userEmail;
  }
  if (commentData.replyToId) {
    payload.replyToId = commentData.replyToId;
  }

  return await addDoc(commentsCol, payload);
}

/**
 * Edit a previously posted comment (Author or Admin)
 */
export async function editComment(commentId: string, newText: string): Promise<void> {
  const commentRef = doc(db, 'comments', commentId);
  await updateDoc(commentRef, {
    text: newText.trim(),
    isEdited: true,
    editedAt: Date.now()
  });
}

/**
 * Delete a comment (Author or Admin)
 */
export async function deleteComment(commentId: string): Promise<void> {
  const commentRef = doc(db, 'comments', commentId);
  await deleteDoc(commentRef);
}

/**
 * Admin: Clear all existing bids and reset the auction bidding log to starting bid
 */
export async function clearAllBidsAndReset(auctionId: string, resetStartingBid?: number): Promise<void> {
  const auctionRef = doc(db, 'auctions', auctionId);
  const auctionSnap = await getDoc(auctionRef);
  const starting = resetStartingBid !== undefined ? resetStartingBid : (auctionSnap.exists() ? (auctionSnap.data().startingBid || 15000) : 15000);

  // 1. Delete all bids in bids collection
  const bidsCol = collection(db, 'bids');
  const bidsSnap = await getDocs(bidsCol);
  const batch = writeBatch(db);
  bidsSnap.docs.forEach((d) => {
    batch.delete(d.ref);
  });
  await batch.commit();

  // 2. Also remove any automated bid comments from comments collection if present
  const commentsCol = collection(db, 'comments');
  const commentsSnap = await getDocs(commentsCol);
  const commentBatch = writeBatch(db);
  commentsSnap.docs.forEach((d) => {
    if (d.data().isBid === true) {
      commentBatch.delete(d.ref);
    }
  });
  await commentBatch.commit();

  // 3. Reset auction doc state
  await updateDoc(auctionRef, {
    currentBid: 0,
    bidCount: 0,
    highBidderId: '',
    highBidderName: '',
    highBidderEmail: '',
    isReserveMet: false,
    updatedAt: Date.now()
  });
}

/**
 * Upvote/Like a comment
 */
export async function toggleUpvoteComment(commentId: string, userId: string) {
  const commentRef = doc(db, 'comments', commentId);
  const snap = await getDoc(commentRef);
  if (!snap.exists()) return;

  const data = snap.data() as Comment;
  const upvotedBy = data.upvotedBy || [];
  const hasUpvoted = upvotedBy.includes(userId);

  if (hasUpvoted) {
    await updateDoc(commentRef, {
      upvotes: Math.max(0, (data.upvotes || 1) - 1),
      upvotedBy: arrayRemove(userId)
    });
  } else {
    await updateDoc(commentRef, {
      upvotes: (data.upvotes || 0) + 1,
      upvotedBy: arrayUnion(userId)
    });
  }
}

/**
 * Admin: Update auction configuration (dates, reserve, minimum increment, etc.)
 */
export async function updateAuctionConfig(
  auctionId: string,
  updates: Partial<Auction>
): Promise<void> {
  const targetId = auctionId?.trim() || MAIN_AUCTION_ID;
  const auctionRef = doc(db, 'auctions', targetId);
  const cleanUpdates = sanitizePayload({
    ...updates,
    updatedAt: Date.now()
  });

  await withTimeout(
    setDoc(auctionRef, cleanUpdates, { merge: true }),
    8000
  );
}

/**
 * Admin: Save media configuration to Firestore (keyed by auctionId if provided)
 */
export async function saveMediaConfig(config: MediaConfiguration, auctionId?: string): Promise<void> {
  const targetAuctionId = auctionId?.trim() || MAIN_AUCTION_ID;
  const docId = (targetAuctionId !== MAIN_AUCTION_ID) ? `media-${targetAuctionId}` : MEDIA_CONFIG_DOC_ID;
  const mediaRef = doc(db, 'settings', docId);

  // Compress and upload any high-res Base64 images in hero and gallery arrays to Firebase Storage before persisting
  const compressedHero = await Promise.all((config.heroImages || []).map(async img => {
    const comp = await compressImageDataUrl(img);
    return await uploadImageToStorage(targetAuctionId, comp, 'hero');
  }));
  const compressedGallery = await Promise.all((config.fullGallery || []).map(async item => {
    const comp = await compressImageDataUrl(item.url);
    const url = await uploadImageToStorage(targetAuctionId, comp, item.category || 'gallery');
    return {
      ...item,
      url
    };
  }));

  const cleanConfig = sanitizePayload({
    ...config,
    heroImages: compressedHero,
    fullGallery: compressedGallery,
    updatedAt: Date.now()
  });

  await withTimeout(
    setDoc(mediaRef, cleanConfig, { merge: true }),
    8000
  );

  // Synchronize branding properties to localStorage if configured
  if (config.siteLogo !== undefined || config.siteName || config.siteTagline) {
    try {
      const cached = getStoredGlobalBranding();
      localStorage.setItem(GLOBAL_BRANDING_STORAGE_KEY, JSON.stringify({
        siteLogo: config.siteLogo !== undefined ? config.siteLogo : cached.siteLogo,
        siteName: config.siteName || cached.siteName,
        siteTagline: config.siteTagline || cached.siteTagline
      }));
    } catch {
      // ignore
    }
  }

  if (config.heroImages && Array.isArray(config.heroImages)) {
    try {
      const auctionRef = doc(db, 'auctions', targetAuctionId);
      const leadHero = config.heroImages[0] || '';
      // Only write leadHeroImage to root auction doc to prevent exceeding Firestore's 1MB document limit
      await setDoc(auctionRef, sanitizePayload({
        leadHeroImage: leadHero,
        updatedAt: Date.now()
      }), { merge: true });
    } catch (err) {
      console.warn('Could not sync lead hero image to root auction doc:', err);
    }
  }
}

/**
 * Persists global branding settings both to Firestore /settings/global and synchronously to localStorage.
 */
export async function saveGlobalBranding(branding: Partial<GlobalBrandingSettings>): Promise<void> {
  const current = getStoredGlobalBranding();
  const brandingData = {
    siteLogo: branding.siteLogo !== undefined ? branding.siteLogo : current.siteLogo,
    siteName: branding.siteName !== undefined ? branding.siteName : current.siteName,
    siteTagline: branding.siteTagline !== undefined ? branding.siteTagline : current.siteTagline,
    ...(branding.defaultStartingBid !== undefined ? { defaultStartingBid: branding.defaultStartingBid } : {}),
    ...(branding.defaultMinIncrement !== undefined ? { defaultMinIncrement: branding.defaultMinIncrement } : {}),
    ...(branding.currency ? { currency: branding.currency } : {}),
    updatedAt: Date.now()
  };

  try {
    localStorage.setItem(GLOBAL_BRANDING_STORAGE_KEY, JSON.stringify({
      siteLogo: brandingData.siteLogo,
      siteName: brandingData.siteName,
      siteTagline: brandingData.siteTagline
    }));
  } catch (err) {
    console.warn('Failed to save global branding to localStorage:', err);
  }

  try {
    const globalRef = doc(db, 'settings', 'global');
    await withTimeout(setDoc(globalRef, sanitizePayload(brandingData), { merge: true }), 8000);
  } catch (err) {
    console.warn('Failed to save global branding to Firestore:', err);
  }
}

/**
 * Subscribe to real-time updates on /settings/global and synchronize with localStorage.
 */
export function subscribeToGlobalBranding(
  callback: (branding: GlobalBrandingSettings | null) => void
) {
  const globalRef = doc(db, 'settings', 'global');
  return onSnapshot(globalRef, (snap) => {
    if (snap.exists()) {
      const data = snap.data() as GlobalBrandingSettings;
      try {
        const brandingToStore = {
          siteLogo: data.siteLogo ?? '',
          siteName: data.siteName || 'wailtail',
          siteTagline: data.siteTagline || 'Single-Car Auctions'
        };
        localStorage.setItem(GLOBAL_BRANDING_STORAGE_KEY, JSON.stringify(brandingToStore));
      } catch (e) {
        console.warn('Could not sync global branding to localStorage:', e);
      }
      callback(data);
    } else {
      callback(null);
    }
  }, (err) => {
    console.warn('Error listening to global branding settings:', err);
  });
}

/**
 * Subscribe to real-time media configuration
 */
export function subscribeToMediaConfig(
  callback: (config: MediaConfiguration | null) => void,
  auctionId?: string
) {
  const targetAuctionId = auctionId?.trim() || MAIN_AUCTION_ID;
  const docId = (targetAuctionId !== MAIN_AUCTION_ID) ? `media-${targetAuctionId}` : MEDIA_CONFIG_DOC_ID;
  const mediaRef = doc(db, 'settings', docId);
  return onSnapshot(mediaRef, (snap) => {
    if (snap.exists()) {
      const data = snap.data() as MediaConfiguration;
      if (data.siteLogo !== undefined || data.siteName || data.siteTagline) {
        try {
          const cached = getStoredGlobalBranding();
          localStorage.setItem(GLOBAL_BRANDING_STORAGE_KEY, JSON.stringify({
            siteLogo: data.siteLogo !== undefined ? data.siteLogo : cached.siteLogo,
            siteName: data.siteName || cached.siteName,
            siteTagline: data.siteTagline || cached.siteTagline
          }));
        } catch {
          // ignore
        }
      }
      callback(data);
    } else {
      callback(null);
    }
  }, (err) => {
    console.warn('Error listening to media config in Firestore:', err);
  });
}

/**
 * Initialize Media Config in Firestore if not present
 */
export async function initializeMediaConfigIfNotExists(auctionId?: string): Promise<MediaConfiguration> {
  const targetId = auctionId?.trim() || MAIN_AUCTION_ID;
  const docId = (targetId !== MAIN_AUCTION_ID) ? `media-${targetId}` : MEDIA_CONFIG_DOC_ID;
  try {
    const mediaRef = doc(db, 'settings', docId);
    const snap = await getDoc(mediaRef);
    if (snap.exists()) {
      return snap.data() as MediaConfiguration;
    }
    // Return blank or default in memory without writing sample data to Firestore
    return (targetId !== MAIN_AUCTION_ID) ? BLANK_MEDIA_CONFIG : DEFAULT_MEDIA_CONFIG;
  } catch (err) {
    console.warn('Using local fallback media configuration:', err);
    return (targetId !== MAIN_AUCTION_ID) ? BLANK_MEDIA_CONFIG : DEFAULT_MEDIA_CONFIG;
  }
}

/**
 * Admin: Subscribe to all registered bidders for registry view
 */
export function subscribeToAllBidders(
  callback: (users: UserProfile[]) => void
) {
  const q = query(collection(db, 'users'), orderBy('registeredAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const list: UserProfile[] = snapshot.docs.map((d) => {
      const data = d.data();
      return {
        uid: (data as any)?.uid || d.id,
        ...data
      };
    }) as UserProfile[];
    callback(list);
  }, (err) => {
    console.error('Error fetching registered bidders:', err);
  });
}

/**
 * Admin: Bulk purge all listings, media configurations, and local cache.
 * Executes batch deletions across all auctions documents and media/config subcollections.
 */
export async function purgeAllListings(): Promise<void> {
  try {
    const batch = writeBatch(db);
    
    // 1. Fetch and purge all auctions
    const auctionsSnap = await getDocs(collection(db, 'auctions'));
    auctionsSnap.docs.forEach(d => batch.delete(d.ref));
    
    // 2. Fetch and purge all media settings
    const settingsSnap = await getDocs(collection(db, 'settings'));
    settingsSnap.docs.forEach(d => batch.delete(d.ref));

    // 3. Purge all media subcollections (recursive)
    for (const auctionDoc of auctionsSnap.docs) {
      batch.delete(doc(db, 'auctions', auctionDoc.id, 'media', 'config'));
      const mediaSubColSnap = await getDocs(collection(db, 'auctions', auctionDoc.id, 'media'));
      mediaSubColSnap.docs.forEach(d => batch.delete(d.ref));
    }
    
    await batch.commit();

    // 4. Clear localStorage
    localStorage.clear();
  } catch (err) {
    console.error('Error during bulk purge:', err);
    throw err;
  }
}

/**
 * Admin helper: Reset auction to test duration (e.g. 2 minutes left for anti-sniping test)
 */
export async function setAuctionEndingSoon(auctionId: string, secondsFromNow = 110) {
  const auctionRef = doc(db, 'auctions', auctionId);
  await updateDoc(auctionRef, {
    startTime: Date.now() - 3600000,
    endTime: Date.now() + secondsFromNow * 1000,
    status: 'active',
    updatedAt: Date.now()
  });
}

export interface ExtractedVideoChapter {
  id: string;
  title: string;
  description: string;
  videoUrl: string;
  thumbnailUrl?: string;
}

/**
 * Fetches YouTube playlist videos via the serverless proxy endpoint (/api/youtube-playlist)
 * and deduplicates against existing video chapters.
 */
export async function fetchYouTubePlaylistVideos(
  playlistUrl: string,
  existingChapters: Array<{ videoUrl?: string } | string> = []
): Promise<ExtractedVideoChapter[]> {
  const match = playlistUrl.match(/[?&]list=([^&]+)/);
  let playlistId = match && match[1] ? match[1].trim() : '';
  if (!playlistId && /^[a-zA-Z0-9_-]{10,}$/.test(playlistUrl.trim())) {
    playlistId = playlistUrl.trim();
  }

  if (!playlistId) {
    throw new Error("Invalid YouTube Playlist URL. Ensure the link contains a 'list=...' parameter.");
  }

  const response = await fetch(`/api/youtube-playlist?playlistId=${encodeURIComponent(playlistId)}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.error || 'Could not auto-import playlist. Please verify the playlist is Public or add video URLs manually.');
  }

  const data = await response.json();
  if (!data || !data.success || !Array.isArray(data.videos)) {
    throw new Error(data?.error || 'Failed to fetch playlist videos from API.');
  }

  const parsedChapters: ExtractedVideoChapter[] = data.videos;

  // Chapter Deduplication: Filter out video IDs that already exist in active video chapters
  const existingIds = new Set<string>();
  for (const ch of existingChapters) {
    const url = typeof ch === 'string' ? ch : ch.videoUrl;
    if (!url) continue;
    const matchId = url.match(/(?:v=|youtu\.be\/|\/embed\/|\/v\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
    if (matchId && matchId[1]) {
      existingIds.add(matchId[1]);
    } else if (/^[a-zA-Z0-9_-]{11}$/.test(url.trim())) {
      existingIds.add(url.trim());
    }
  }

  const uniqueChapters: ExtractedVideoChapter[] = [];
  for (const chapter of parsedChapters) {
    if (!chapter.videoUrl) continue;
    const vMatch = chapter.videoUrl.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    const videoId = vMatch ? vMatch[1] : '';
    if (videoId) {
      if (existingIds.has(videoId)) {
        continue;
      }
      existingIds.add(videoId);
    }
    uniqueChapters.push({
      id: chapter.id,
      title: chapter.title,
      description: chapter.description,
      videoUrl: chapter.videoUrl,
      thumbnailUrl: chapter.thumbnailUrl
    });
  }

  return uniqueChapters;
}

export interface FetchPaginatedBiddersParams {
  page: number;
  pageSize: number;
  searchQuery?: string;
  roleFilter?: string; // 'ALL' | 'ADMIN' | 'SELLER' | 'BIDDER'
  banFilter?: string;  // 'ALL' | 'BANNED' | 'VERIFIED'
}

export interface FetchPaginatedConsignmentsParams {
  page: number;
  pageSize: number;
  searchQuery?: string;
  statusFilter?: string; // 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Admin: Fetch paginated bidders with search and filtering
 */
export async function fetchPaginatedBidders({
  page = 1,
  pageSize = 10,
  searchQuery = '',
  roleFilter = 'ALL',
  banFilter = 'ALL'
}: FetchPaginatedBiddersParams): Promise<PaginatedResult<UserProfile>> {
  try {
    const usersSnap = await getDocs(query(collection(db, 'users'), orderBy('registeredAt', 'desc')));
    let list: UserProfile[] = usersSnap.docs.map((d) => {
      const data = d.data();
      return {
        uid: (data as any)?.uid || d.id,
        ...data
      } as UserProfile;
    });

    // Also check bidders collection to merge any unique records
    try {
      const biddersSnap = await getDocs(collection(db, 'bidders'));
      const existingUids = new Set(list.map(u => u.uid));
      biddersSnap.docs.forEach((d) => {
        const data = d.data();
        const uid = (data as any)?.uid || d.id;
        if (!existingUids.has(uid)) {
          existingUids.add(uid);
          list.push({ uid, ...data } as UserProfile);
        }
      });
    } catch (e) {
      // ignore bidders collection error if it doesn't exist
    }

    // Filter by searchQuery (name, email, phone, uid)
    const cleanSearch = searchQuery.trim().toLowerCase();
    if (cleanSearch) {
      list = list.filter((user) => {
        const name = (user.displayName || '').toLowerCase();
        const email = (user.email || '').toLowerCase();
        const phone = (user.phone || '').toLowerCase();
        const uid = (user.uid || '').toLowerCase();
        return name.includes(cleanSearch) || email.includes(cleanSearch) || phone.includes(cleanSearch) || uid.includes(cleanSearch);
      });
    }

    // Filter by role
    if (roleFilter && roleFilter !== 'ALL') {
      const targetRole = roleFilter.toUpperCase();
      list = list.filter((user) => {
        const currentRole = (user.role || 'BIDDER').toUpperCase();
        return currentRole === targetRole;
      });
    }

    // Filter by status (Banned or Verified)
    if (banFilter && banFilter !== 'ALL') {
      const targetBan = banFilter.toUpperCase();
      if (targetBan === 'BANNED') {
        list = list.filter((user) => Boolean(user.isBanned || user.bannedFromBidding));
      } else if (targetBan === 'VERIFIED') {
        list = list.filter((user) => Boolean(user.isEmailVerified));
      }
    }

    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const clampedPage = Math.max(1, Math.min(page, totalPages));
    const start = (clampedPage - 1) * pageSize;
    const items = list.slice(start, start + pageSize);

    return {
      items,
      total,
      page: clampedPage,
      pageSize,
      totalPages
    };
  } catch (err) {
    console.error('Error fetching paginated bidders:', err);
    throw err;
  }
}

/**
 * Admin: Fetch paginated consignment applications with search and filtering
 */
export async function fetchPaginatedConsignments({
  page = 1,
  pageSize = 10,
  searchQuery = '',
  statusFilter = 'ALL'
}: FetchPaginatedConsignmentsParams): Promise<PaginatedResult<ConsignmentApplication>> {
  try {
    let list: ConsignmentApplication[] = [];
    const colRef = collection(db, 'consignment_applications');
    const q = query(colRef, orderBy('submittedAt', 'desc'));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      // Fallback to legacy 'consignments'
      try {
        const legacyCol = collection(db, 'consignments');
        const legacyQ = query(legacyCol, orderBy('submittedAt', 'desc'));
        const legacySnap = await getDocs(legacyQ);
        list = legacySnap.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as ConsignmentApplication[];
      } catch (e) {
        list = [];
      }
    } else {
      list = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as ConsignmentApplication[];
    }

    // Filter by searchQuery across make, model, VIN, and consignor email/name
    const cleanSearch = searchQuery.trim().toLowerCase();
    if (cleanSearch) {
      list = list.filter((app) => {
        const make = (app.make || '').toLowerCase();
        const model = (app.model || '').toLowerCase();
        const vin = (app.vin || '').toLowerCase();
        const email = (app.sellerEmail || '').toLowerCase();
        const name = (app.sellerName || '').toLowerCase();
        const generation = (app.generation || '').toLowerCase();
        const year = String(app.year || '').toLowerCase();
        const appId = (app.id || '').toLowerCase();
        return (
          appId.includes(cleanSearch) ||
          make.includes(cleanSearch) ||
          model.includes(cleanSearch) ||
          vin.includes(cleanSearch) ||
          email.includes(cleanSearch) ||
          name.includes(cleanSearch) ||
          generation.includes(cleanSearch) ||
          year.includes(cleanSearch)
        );
      });
    }

    // Filter by status
    if (statusFilter && statusFilter.toUpperCase() !== 'ALL') {
      const targetStatus = statusFilter.toUpperCase();
      list = list.filter((app) => {
        const appStatus = (app.status || 'pending').toUpperCase();
        if (targetStatus === 'REJECTED') {
          return appStatus === 'REJECTED' || appStatus === 'DECLINED';
        }
        return appStatus === targetStatus;
      });
    }

    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const clampedPage = Math.max(1, Math.min(page, totalPages));
    const start = (clampedPage - 1) * pageSize;
    const items = list.slice(start, start + pageSize);

    return {
      items,
      total,
      page: clampedPage,
      pageSize,
      totalPages
    };
  } catch (err) {
    console.error('Error fetching paginated consignments:', err);
    throw err;
  }
}

/**
 * Aggregates unified user activity across four vectors:
 * 1. Active & Historical Bids (LEADING vs OUTBID)
 * 2. Won Auctions (Reserve satisfied, CAD price, Seller contact details)
 * 3. Seller Listings (Telemetry, Bid count, Draft edit deep links)
 * 4. Consignment Submissions (Status, Converted draft auction ID)
 */
export async function fetchUserActivitySummary(
  userId: string,
  userEmail: string
): Promise<UserActivitySummary> {
  const cleanEmail = (userEmail || '').trim().toLowerCase();
  const summary: UserActivitySummary = {
    activeBids: [],
    wonAuctions: [],
    sellerListings: [],
    consignments: []
  };

  if (!userId && !cleanEmail) {
    return summary;
  }

  try {
    // 1. Fetch all auctions to join with bids and seller listings
    const auctionsSnap = await getDocs(collection(db, 'auctions'));
    let allAuctions: Auction[] = auctionsSnap.docs.map((d) => {
      const data = d.data() as Auction;
      const lotId = d.id;
      let heroImgs: string[] = Array.isArray(data.heroImages) ? data.heroImages : [];
      if (heroImgs.length === 0 && lotId === MAIN_AUCTION_ID) {
        heroImgs = DEFAULT_MEDIA_CONFIG.heroImages;
      }
      const leadHero = data.leadHeroImage || heroImgs[0] || '';
      return {
        ...data,
        id: lotId,
        heroImages: heroImgs,
        leadHeroImage: leadHero
      };
    });

    // If Firestore auctions collection is empty or missing MAIN_AUCTION_ID, add default if it exists
    if (!allAuctions.some((a) => a.id === MAIN_AUCTION_ID)) {
      try {
        const mainDoc = await getDoc(doc(db, 'auctions', MAIN_AUCTION_ID));
        if (mainDoc.exists()) {
          const mData = mainDoc.data() as Auction;
          allAuctions.push({
            ...mData,
            id: MAIN_AUCTION_ID,
            leadHeroImage: mData.leadHeroImage || mData.heroImages?.[0] || DEFAULT_MEDIA_CONFIG.heroImages[0]
          });
        }
      } catch {
        // ignore
      }
    }

    const auctionMap = new Map<string, Auction>(allAuctions.map((a) => [a.id, a]));

    // 2. Query user bids across all auctions
    const userBids: Bid[] = [];
    if (userId) {
      try {
        const bidsSnap = await getDocs(
          query(collection(db, 'bids'), where('bidderId', '==', userId))
        );
        userBids.push(...(bidsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Bid[]));
      } catch (err) {
        console.warn('Could not query bids by bidderId:', err);
      }
    }

    if (cleanEmail) {
      try {
        const bidsByEmailSnap = await getDocs(
          query(collection(db, 'bids'), where('bidderEmail', '==', cleanEmail))
        );
        const existingIds = new Set(userBids.map((b) => b.id));
        bidsByEmailSnap.docs.forEach((d) => {
          if (!existingIds.has(d.id)) {
            userBids.push({ id: d.id, ...d.data() } as Bid);
            existingIds.add(d.id);
          }
        });
      } catch (err) {
        console.warn('Could not query bids by bidderEmail:', err);
      }
    }

    // Map user bids by auctionId to find highest bid placed by user
    const userAuctionBids = new Map<string, { maxBid: number; count: number }>();
    for (const b of userBids) {
      if (!b.auctionId) continue;
      const current = userAuctionBids.get(b.auctionId) || { maxBid: 0, count: 0 };
      userAuctionBids.set(b.auctionId, {
        maxBid: Math.max(current.maxBid, Number(b.amount) || 0),
        count: current.count + 1
      });
    }

    // Also include any auctions where the user is registered as highBidderId or highBidderEmail
    for (const auction of allAuctions) {
      const isHighBidder =
        (userId && auction.highBidderId === userId) ||
        (cleanEmail && auction.highBidderEmail?.toLowerCase() === cleanEmail);
      if (isHighBidder && !userAuctionBids.has(auction.id)) {
        userAuctionBids.set(auction.id, {
          maxBid: auction.currentBid || auction.startingBid || 0,
          count: 1
        });
      }
    }

    const now = Date.now();

    // 3. Process Active Bids & Won Auctions
    for (const [auctionId, bidInfo] of userAuctionBids.entries()) {
      const auction = auctionMap.get(auctionId);
      if (!auction) continue;

      const isEnded =
        auction.status === 'ended' ||
        auction.status === 'sold' ||
        (auction.endTime > 0 && now >= auction.endTime);

      const isWinningBidder =
        (userId && auction.highBidderId === userId) ||
        (cleanEmail && auction.highBidderEmail?.toLowerCase() === cleanEmail);

      const isReserveSatisfied =
        auction.isReserveMet ||
        (auction.reserveAmount ? auction.currentBid >= auction.reserveAmount : true);

      if (isEnded) {
        // Check if Won Auction (holds winning bid and reserve met or sold)
        if (isWinningBidder && (isReserveSatisfied || auction.status === 'sold')) {
          summary.wonAuctions.push({
            auctionId: auction.id,
            auctionTitle: auction.title || 'Collector Vehicle Lot',
            auctionHeroImage: auction.leadHeroImage || auction.heroImages?.[0] || '',
            winningBid: auction.currentBid || bidInfo.maxBid || 0,
            currency: auction.currency || 'CAD',
            endTime: auction.endTime || now,
            sellerName: auction.sellerName || 'Verified Consignor',
            sellerEmail: auction.sellerEmail || '',
            sellerPhone: auction.sellerPhone || '',
            location:
              [auction.locationCity, auction.locationProvince, auction.locationCountry]
                .filter(Boolean)
                .join(', ') ||
              auction.location ||
              'Canada',
            vin: auction.vin || ''
          });
        }
      } else {
        // Active auction bid
        const isLeading =
          isWinningBidder ||
          (auction.currentBid > 0 && bidInfo.maxBid >= auction.currentBid);

        summary.activeBids.push({
          auctionId: auction.id,
          auctionTitle: auction.title || 'Collector Vehicle Lot',
          auctionHeroImage: auction.leadHeroImage || auction.heroImages?.[0] || '',
          currentHighBid: auction.currentBid || auction.startingBid || 0,
          userHighestBid: bidInfo.maxBid,
          status: isLeading ? 'LEADING' : 'OUTBID',
          endTime: auction.endTime || (now + 7 * 24 * 60 * 60 * 1000),
          bidCount: auction.bidCount || 0,
          currency: auction.currency || 'CAD',
          isReserveMet: auction.isReserveMet
        });
      }
    }

    // Sort active bids by urgency (endTime ascending)
    summary.activeBids.sort((a, b) => a.endTime - b.endTime);
    // Sort won auctions by recent completion (endTime descending)
    summary.wonAuctions.sort((a, b) => b.endTime - a.endTime);

    // 4. Query Seller Listings
    for (const auction of allAuctions) {
      const isOwner =
        (cleanEmail &&
          auction.sellerEmail &&
          auction.sellerEmail.trim().toLowerCase() === cleanEmail) ||
        (userId && auction.sellerId === userId);

      if (isOwner) {
        summary.sellerListings.push({
          auctionId: auction.id,
          title: auction.title || 'Untitled Listing',
          heroImage: auction.leadHeroImage || auction.heroImages?.[0] || '',
          status: auction.status || 'preview',
          currentBid: auction.currentBid || auction.startingBid || 0,
          bidCount: auction.bidCount || 0,
          currency: auction.currency || 'CAD',
          draftEditUrl: `/dashboard/listings/${auction.id}/edit`,
          endTime: auction.endTime || now,
          startTime: auction.startTime
        });
      }
    }
    // Sort seller listings by start/end time descending
    summary.sellerListings.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));

    // 5. Query Consignment Submissions
    const consignmentsList: ConsignmentApplication[] = [];
    if (userId) {
      try {
        const qUser = query(
          collection(db, 'consignment_applications'),
          where('registeredUserId', '==', userId)
        );
        const snapUser = await getDocs(qUser);
        consignmentsList.push(
          ...(snapUser.docs.map((d) => ({ id: d.id, ...d.data() })) as ConsignmentApplication[])
        );
      } catch (err) {
        console.warn('Error querying consignment_applications by registeredUserId:', err);
      }
    }

    if (cleanEmail) {
      try {
        const qEmail = query(
          collection(db, 'consignment_applications'),
          where('sellerEmail', '==', cleanEmail)
        );
        const snapEmail = await getDocs(qEmail);
        const existingIds = new Set(consignmentsList.map((c) => c.id));
        snapEmail.docs.forEach((d) => {
          if (!existingIds.has(d.id)) {
            consignmentsList.push({ id: d.id, ...d.data() } as ConsignmentApplication);
            existingIds.add(d.id);
          }
        });
      } catch (err) {
        console.warn('Error querying consignment_applications by sellerEmail:', err);
      }
    }

    // Fallback to legacy 'consignments' collection if empty
    if (consignmentsList.length === 0) {
      try {
        const legacySnap = await getDocs(collection(db, 'consignments'));
        const matched = legacySnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as ConsignmentApplication))
          .filter(
            (c) =>
              (userId && c.registeredUserId === userId) ||
              (cleanEmail && c.sellerEmail?.toLowerCase() === cleanEmail)
          );
        consignmentsList.push(...matched);
      } catch {
        // ignore
      }
    }

    summary.consignments = consignmentsList.map((c) => {
      let normalizedStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVIEWED' | string = 'PENDING';
      const rawStatus = (c.status || 'pending').toLowerCase();
      if (rawStatus === 'approved') normalizedStatus = 'APPROVED';
      else if (rawStatus === 'rejected' || rawStatus === 'declined') normalizedStatus = 'REJECTED';
      else if (rawStatus === 'reviewed') normalizedStatus = 'REVIEWED';
      else normalizedStatus = 'PENDING';

      return {
        id: c.id || '',
        year: c.year,
        make: c.make,
        model: c.model,
        generation: c.generation,
        submittedAt: c.submittedAt || now,
        status: normalizedStatus,
        convertedAuctionId: c.convertedAuctionId,
        reserveExpectation: c.reserveExpectation,
        location:
          [c.locationCity, c.locationProvince, c.locationCountry].filter(Boolean).join(', ') ||
          c.location
      };
    });

    summary.consignments.sort((a, b) => b.submittedAt - a.submittedAt);
  } catch (err) {
    console.error('Error executing fetchUserActivitySummary:', err);
  }

  return summary;
}

export const DEFAULT_PROMO_SETTINGS: PlatformPromoSettings = {
  enabled: true,
  lotHeaderBanner: {
    enabled: true,
    badgeText: 'LAUNCH SPECIAL',
    text: 'Zero buyer premiums & $0 seller fees for our inaugural catalog launch.',
    ctaText: 'Consign Vehicle',
    ctaAction: 'consignment_modal',
    targetAudience: 'all',
    clickCount: 0
  },
  cards: [
    {
      id: 'promo-zero-seller-fees',
      enabled: true,
      badgeText: 'FOUNDERS OFFER',
      headline: '$0 Seller Fees & Zero Buyer Premiums',
      copy: 'To celebrate the launch of Wailtail, consignors pay $0 listing fees and buyers pay 0% premium on all inaugural lots.',
      ctaText: 'Consign Your Vehicle',
      ctaAction: 'consignment_modal',
      accentColor: 'amber',
      targetAudience: 'all',
      clickCount: 0
    },
    {
      id: 'promo-early-access-membership',
      enabled: true,
      badgeText: 'INNER CIRCLE',
      headline: 'Register for Early Bidding Access',
      copy: 'Join Wailtail to get real-time outbid notifications, direct access to sellers, and custom watchlist tracking.',
      ctaText: 'Create Free Account',
      ctaAction: 'auth_modal',
      accentColor: 'emerald',
      targetAudience: 'guests_only',
      clickCount: 0
    }
  ]
};

/**
 * Evaluates whether a promotion schedule window is currently active.
 * Safely parses ISO date strings, timestamp strings, or epoch numbers.
 * Empty, null, or undefined date bounds evaluate as active (true).
 */
export function isPromoScheduleActive(
  startDate?: string | number | null,
  expiresAt?: string | number | null,
  now = Date.now()
): boolean {
  if (startDate !== undefined && startDate !== null && startDate !== '') {
    let startMs: number;
    if (typeof startDate === 'number') {
      startMs = startDate;
    } else {
      const parsed = Date.parse(startDate);
      startMs = !isNaN(parsed) ? parsed : Number(startDate);
    }
    if (!isNaN(startMs) && now < startMs) {
      return false;
    }
  }

  if (expiresAt !== undefined && expiresAt !== null && expiresAt !== '') {
    let expireMs: number;
    if (typeof expiresAt === 'number') {
      expireMs = expiresAt;
    } else {
      const parsed = Date.parse(expiresAt);
      expireMs = !isNaN(parsed) ? parsed : Number(expiresAt);
    }
    if (!isNaN(expireMs) && now > expireMs) {
      return false;
    }
  }

  return true;
}

/**
 * Evaluates whether a promotion matches the target audience against active userProfile / authentication state.
 * Empty, null, or undefined audience evaluates as 'all' (true).
 */
export function isPromoAudienceMatch(
  targetAudience?: PromoAudience | string | null,
  isAuthenticated?: boolean | UserProfile | null
): boolean {
  if (!targetAudience || targetAudience === 'all') return true;
  const isAuthed = Boolean(isAuthenticated);
  if (targetAudience === 'guests_only') return !isAuthed;
  if (targetAudience === 'authenticated_only') return isAuthed;
  return true;
}

/**
 * Real-time onSnapshot listener on doc(db, 'settings', 'promotions') with fallback initializers.
 */
export function subscribeToPromoSettings(callback: (settings: PlatformPromoSettings) => void): () => void {
  const promoRef = doc(db, 'settings', 'promotions');
  return onSnapshot(
    promoRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const rawBanner = data.lotHeaderBanner || {};
        const settings: PlatformPromoSettings = {
          enabled: typeof data.enabled === 'boolean' ? data.enabled : DEFAULT_PROMO_SETTINGS.enabled,
          lotHeaderBanner: {
            ...DEFAULT_PROMO_SETTINGS.lotHeaderBanner,
            ...rawBanner,
            enabled: typeof rawBanner.enabled === 'boolean' ? rawBanner.enabled : DEFAULT_PROMO_SETTINGS.lotHeaderBanner.enabled,
            targetAudience: rawBanner.targetAudience || DEFAULT_PROMO_SETTINGS.lotHeaderBanner.targetAudience
          },
          cards: Array.isArray(data.cards) ? data.cards : DEFAULT_PROMO_SETTINGS.cards
        };
        callback(settings);
      } else {
        callback(DEFAULT_PROMO_SETTINGS);
      }
    },
    (err) => {
      console.warn('Failed to listen to promo settings in Firestore, using defaults:', err);
      callback(DEFAULT_PROMO_SETTINGS);
    }
  );
}

/**
 * Persists settings array and toggles to Firestore settings/promotions.
 */
export async function savePromoSettings(settings: PlatformPromoSettings): Promise<void> {
  const promoRef = doc(db, 'settings', 'promotions');
  await setDoc(promoRef, settings, { merge: true });
}

/**
 * Uses Firestore increment(1) to update atomic click counters in decoupled 'promo_analytics' collection.
 * Isolated in non-blocking try/catch logic to ensure telemetry failures never degrade user navigation.
 */
export async function recordPromoClick(promoId: string, isBanner?: boolean): Promise<void> {
  try {
    const targetId = promoId || (isBanner ? 'lot_header_banner' : '');
    if (!targetId) return;

    const analyticsRef = doc(db, 'promo_analytics', targetId);
    await setDoc(
      analyticsRef,
      {
        clickCount: increment(1),
        lastClickedAt: serverTimestamp()
      },
      { merge: true }
    );
  } catch (err) {
    // Silently swallow telemetry error to guarantee uninterrupted guest navigation
    console.warn('Silent promo telemetry failover:', err);
  }
}

/**
 * Real-time listener querying the promo_analytics collection.
 * Returns a key-value map of { [promoId]: clickCount }.
 */
export function subscribeToPromoAnalytics(
  callback: (analyticsMap: Record<string, number>) => void
): () => void {
  const colRef = collection(db, 'promo_analytics');
  return onSnapshot(
    colRef,
    (snapshot) => {
      const analyticsMap: Record<string, number> = {};
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        analyticsMap[docSnap.id] = typeof data?.clickCount === 'number' ? data.clickCount : 0;
      });
      callback(analyticsMap);
    },
    (err) => {
      console.warn('Failed to listen to promo analytics in Firestore:', err);
      callback({});
    }
  );
}

