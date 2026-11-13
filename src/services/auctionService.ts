import { startVisiblePolling } from './visiblePolling';
import { isDesignatedAdminEmail } from '../config/adminConfig';
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
  getDocs,
  deleteDoc,
  writeBatch,
  DocumentReference
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../firebase';
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
async function memberAction(body: Record<string, unknown>): Promise<any> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to continue.');
  const response = await fetch('/api/auction-member-actions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify(body)
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || 'Unable to complete this request.');
  return result;
}

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
export async function uploadImageToStorage(auctionId: string, dataUrl: string, folder = 'gallery'): Promise<string> {
  if (!dataUrl?.startsWith('data:')) return dataUrl;
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to upload images.');
  const response = await fetch('/api/admin-upload-auction-image', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify({ auctionId: ['branding', 'promotions'].includes(folder) ? 'common' : auctionId, dataUrl })
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || typeof result?.url !== 'string') throw new Error(result?.error || 'Image upload failed.');
  return result.url;
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

export function slugifyTitle(title: string): string {
  const slug = (title || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'vehicle-listing';
}

export function generateShortHash(length = 8): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
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
  currentBid: 1000,
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
      // The document path is authoritative, including legacy lots without an embedded ID.
      const data = { ...snap.data(), id: snap.id } as Auction;
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
export function subscribeToPublicAuctions(callback: (auctions: Auction[]) => void) {
  return pollPublicAuctions('/api/public-auctions', (result) => callback(result?.auctions ?? []));
}

type PublicAuctionResponse = {
  branding?: GlobalBrandingSettings;
  auctions?: Auction[];
  auction?: Auction;
  media?: MediaConfiguration | null;
  bids?: Bid[];
  comments?: Comment[];
};

export function subscribeToPublicAuction(
  auctionId: string,
  callback: (auction: Auction | null, detail: PublicAuctionResponse | null) => void
) {
  return pollPublicAuctions(`/api/public-auctions?auctionId=${encodeURIComponent(auctionId)}`,
    (result) => callback(result?.auction ?? null, result));
}

function pollPublicAuctions(
  url: string,
  callback: (result: PublicAuctionResponse | null) => void
) {
  let received = false;
  return startVisiblePolling(async signal => {
    try {
      const user = url.includes('?auctionId=') ? auth.currentUser : null;
      const token = user ? await user.getIdToken() : null;
      if (signal.aborted) return;
      const response = await fetch(url, {
        signal,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      if (signal.aborted) return;
      if (response.status === 404) {
        callback(null);
      } else {
        if (!response.ok) throw new Error(`Public auction request failed: ${response.status}`);
        const result = await response.json();
        if (!signal.aborted) callback(result);
      }
      received = true;
    } catch (error) {
      if (!signal.aborted) {
        console.error('Public auction request failed:', error);
        if (!received) callback(null);
      }
    }
  }, url.includes('?auctionId=') ? 5000 : 30_000);
}

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
  const user = auth.currentUser;
  if (!user) throw new Error('Administrator authentication required.');
  const response = await fetch('/api/admin-create-auction', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await user.getIdToken()}`
    },
    body: JSON.stringify({ title: title.trim() })
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.auction) {
    throw new Error(response.status < 500 && typeof result?.error === 'string'
      ? result.error : 'Unable to create the listing.');
  }
  return result.auction;
}

/**
 * Non-blocking client-side helper to dispatch a consignment receipt email to a seller.
 */
export async function sendConsignmentReceiptEmail(
  applicationData: Partial<ConsignmentApplication> & Record<string, any>
): Promise<boolean> {
  const cleanEmail = (applicationData?.sellerEmail || applicationData?.email || '').trim().toLowerCase();
  if (!cleanEmail) return false;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('/api/send-consignment-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth.currentUser ? { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` } : {})
      },
      body: JSON.stringify({
        ...applicationData,
        type: 'consignment_receipt',
        sellerEmail: cleanEmail
      }),
      signal: controller.signal
    }).catch((fetchErr: any) => {
      console.warn('Non-blocking consignment receipt email dispatch failed:', fetchErr);
      return null;
    }).finally(() => {
      clearTimeout(timeoutId);
    });

    return Boolean(res && res.ok);
  } catch (err: any) {
    console.warn('Non-blocking consignment receipt email error:', err);
    return false;
  }
}

const inFlightWelcomeEmails = new Set<string>();

/**
 * Non-blocking client-side helper to dispatch a welcome email to a new bidder.
 * Guards idempotency by checking users/{uid}.welcomeEmailSent in Firestore.
 */
export async function sendWelcomeBidderEmail(
  uidOrEmail: string,
  emailOrDisplayName?: string,
  displayNameParam?: string
): Promise<boolean> {
  // Support both (uid, email, displayName) and legacy (email, displayName)
  let uid = '';
  let cleanEmail = '';
  let displayName = '';

  if (uidOrEmail && uidOrEmail.includes('@')) {
    cleanEmail = uidOrEmail.trim().toLowerCase();
    displayName = (emailOrDisplayName || '').trim();
  } else {
    uid = (uidOrEmail || '').trim();
    cleanEmail = (emailOrDisplayName || '').trim().toLowerCase();
    displayName = (displayNameParam || '').trim();
  }

  // Check users/{uid} in Firestore: if userDoc.welcomeEmailSent === true, return immediately without sending.
  if (uid) {
    if (inFlightWelcomeEmails.has(uid)) {
      console.log(`[Welcome Email] Skipped: Already sent for ${uid}`);
      return false;
    }
    try {
      const userRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const uData = userSnap.data();
        if (uData?.welcomeEmailSent === true) {
          console.log(`[Welcome Email] Skipped: Already sent for ${uid}`);
          return false;
        }
        if (!cleanEmail && uData?.email) {
          cleanEmail = uData.email.trim().toLowerCase();
        }
        if (!displayName && uData?.displayName) {
          displayName = uData.displayName.trim();
        }
      }
    } catch (err) {
      console.warn(`[Welcome Email] Error checking welcomeEmailSent for ${uid}:`, err);
    }
  }

  if (!cleanEmail || !cleanEmail.includes('@')) {
    console.warn('[Welcome Email] Invalid or missing email address:', cleanEmail);
    return false;
  }

  if (uid) {
    inFlightWelcomeEmails.add(uid);
  }

  const resolvedDisplayName = displayName || cleanEmail.split('@')[0] || 'Member';
  console.log(`[Welcome Email] Dispatching welcome email to ${cleanEmail}${uid ? ` (uid: ${uid})` : ''}...`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    let res: Response | null = null;
    try {
      res = await fetch('/api/send-consignment-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        ...(auth.currentUser ? { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` } : {})
        },
        body: JSON.stringify({
          type: 'welcome_bidder',
          email: cleanEmail,
          displayName: resolvedDisplayName
        }),
        signal: controller.signal
      });
    } catch (fetchErr: any) {
      console.warn(`[Welcome Email] Error dispatching email: ${fetchErr?.message || fetchErr}`);
    } finally {
      clearTimeout(timeoutId);
    }

    if (res) {
      console.log(`[Welcome Email] HTTP ${res.status}: Dispatch ${res.ok ? 'completed' : 'failed'} for ${cleanEmail}`);
    }

    const isSuccess = Boolean(res && res.ok);

    // Upon successful dispatch to /api/send-consignment-email, atomically write welcomeEmailSent: true to both users/{uid} and bidders/{uid} in Firestore.
    if (isSuccess) {
      console.log(`[Welcome Email] SUCCESS: Dispatched welcome bidder email to ${cleanEmail}.`);
      if (uid) {
        const now = Date.now();
        try {
          const batch = writeBatch(db);
          batch.set(doc(db, 'users', uid), { welcomeEmailSent: true, updatedAt: now }, { merge: true });
          batch.set(doc(db, 'bidders', uid), { welcomeEmailSent: true, updatedAt: now }, { merge: true });
          await batch.commit();
        } catch (batchErr) {
          console.warn(`[Welcome Email] Error writing welcomeEmailSent to users/${uid} and bidders/${uid}:`, batchErr);
          try {
            await setDoc(doc(db, 'users', uid), { welcomeEmailSent: true, updatedAt: now }, { merge: true });
          } catch {}
          try {
            await setDoc(doc(db, 'bidders', uid), { welcomeEmailSent: true, updatedAt: now }, { merge: true });
          } catch {}
        }
        console.log(`[Welcome Email] welcomeEmailSent sentinel recorded for ${cleanEmail} (${uid}).`);
      }
    } else if (res && !res.ok) {
      console.warn(`[Welcome Email] Error dispatching email: HTTP ${res.status} returned for ${cleanEmail}`);
    }

    return isSuccess;
  } catch (err: any) {
    console.warn(`[Welcome Email] Error dispatching email: ${err?.message || err}`);
    return false;
  } finally {
    if (uid) {
      inFlightWelcomeEmails.delete(uid);
    }
  }
}

/**
 * Unverified / Missing Seller Email Fallback: Resolves seller email from auction or user profile record.
 */
export async function resolveSellerEmail(
  auction: Partial<Auction>,
  sellerProfile?: Partial<UserProfile>
): Promise<string> {
  let email = (auction.sellerEmail || sellerProfile?.email || '').trim().toLowerCase();
  if ((!email || !email.includes('@')) && auction.sellerId) {
    try {
      const userRef = doc(db, 'users', auction.sellerId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const uData = userSnap.data();
        email = (uData?.email || '').trim().toLowerCase();
      }
      if (!email || !email.includes('@')) {
        const bidderRef = doc(db, 'bidders', auction.sellerId);
        const bidderSnap = await getDoc(bidderRef);
        if (bidderSnap.exists()) {
          const bData = bidderSnap.data();
          email = (bData?.email || '').trim().toLowerCase();
        }
      }
    } catch (err) {
      console.warn('Could not resolve seller email from profile:', err);
    }
  }
  return email;
}

/**
 * Non-blocking client-side trigger when seller submits listing for curation review.
 */
export async function sendListingSubmittedForReviewEmail(
  auction: Partial<Auction>,
  sellerProfile?: Partial<UserProfile>
): Promise<boolean> {
  try {
    const resolvedEmail = await resolveSellerEmail(auction, sellerProfile);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('/api/send-consignment-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth.currentUser ? { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` } : {})
      },
      body: JSON.stringify({
        type: 'listing_submitted_for_review',
        id: auction.id,
        lotId: auction.id,
        auctionId: auction.id,
        year: auction.year,
        make: auction.make,
        model: auction.model,
        generation: auction.generation,
        vin: auction.vin,
        sellerName: auction.sellerName || sellerProfile?.displayName || 'Seller',
        sellerEmail: resolvedEmail,
        sellerPhone: auction.sellerPhone || sellerProfile?.phone
      }),
      signal: controller.signal
    }).catch((fetchErr: any) => {
      console.warn('Non-blocking listing submitted for review email dispatch failed:', fetchErr);
      return null;
    }).finally(() => {
      clearTimeout(timeoutId);
    });

    return Boolean(res && res.ok);
  } catch (err: any) {
    console.warn('Non-blocking listing submitted for review email error:', err);
    return false;
  }
}

/**
 * Non-blocking client-side trigger when curator approves a listing and activates the automated clock.
 */
export async function sendListingApprovedEmail(
  auction: Partial<Auction>,
  sellerProfile?: Partial<UserProfile>
): Promise<boolean> {
  try {
    const resolvedEmail = await resolveSellerEmail(auction, sellerProfile);
    if (!resolvedEmail || !resolvedEmail.includes('@')) {
      console.warn('Cannot dispatch listing approved email: seller email not found');
      return false;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('/api/send-consignment-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth.currentUser ? { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` } : {})
      },
      body: JSON.stringify({
        type: 'listing_approved',
        id: auction.id,
        lotId: auction.id,
        auctionId: auction.id,
        year: auction.year,
        make: auction.make,
        model: auction.model,
        generation: auction.generation,
        sellerName: auction.sellerName || sellerProfile?.displayName || 'Seller',
        sellerEmail: resolvedEmail
      }),
      signal: controller.signal
    }).catch((fetchErr: any) => {
      console.warn('Non-blocking listing approved email dispatch failed:', fetchErr);
      return null;
    }).finally(() => {
      clearTimeout(timeoutId);
    });

    return Boolean(res && res.ok);
  } catch (err: any) {
    console.warn('Non-blocking listing approved email error:', err);
    return false;
  }
}

/**
 * Non-blocking client-side trigger when curator requests revisions from the seller.
 */
export async function sendListingRevisionRequestedEmail(
  auction: Partial<Auction>,
  revisionNotes?: string,
  sellerProfile?: Partial<UserProfile>
): Promise<boolean> {
  try {
    const resolvedEmail = await resolveSellerEmail(auction, sellerProfile);
    if (!resolvedEmail || !resolvedEmail.includes('@')) {
      console.warn('Cannot dispatch listing revision requested email: seller email not found');
      return false;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('/api/send-consignment-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth.currentUser ? { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` } : {})
      },
      body: JSON.stringify({
        type: 'listing_revision_requested',
        id: auction.id,
        lotId: auction.id,
        auctionId: auction.id,
        year: auction.year,
        make: auction.make,
        model: auction.model,
        generation: auction.generation,
        sellerName: auction.sellerName || sellerProfile?.displayName || 'Seller',
        sellerEmail: resolvedEmail,
        revisionNotes: revisionNotes || ''
      }),
      signal: controller.signal
    }).catch((fetchErr: any) => {
      console.warn('Non-blocking listing revision requested email dispatch failed:', fetchErr);
      return null;
    }).finally(() => {
      clearTimeout(timeoutId);
    });

    return Boolean(res && res.ok);
  } catch (err: any) {
    console.warn('Non-blocking listing revision requested email error:', err);
    return false;
  }
}

/**
 * Non-blocking client-side trigger when a bidder is outbid by another user.
 */
export async function sendOutbidNotificationEmail(params: {
  auctionId: string;
  vehicleTitle: string;
  currentBid: number;
  minimumIncrement: number;
  bidderEmail: string;
  bidderName?: string;
}): Promise<boolean> {
  const cleanEmail = (params.bidderEmail || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) return false;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('/api/send-consignment-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth.currentUser ? { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` } : {})
      },
      body: JSON.stringify({
        type: 'outbid_notification',
        auctionId: params.auctionId,
        vehicleTitle: params.vehicleTitle,
        currentBid: params.currentBid,
        minimumIncrement: params.minimumIncrement,
        minRequiredBid: params.currentBid + params.minimumIncrement,
        bidderEmail: cleanEmail,
        bidderName: params.bidderName
      }),
      signal: controller.signal
    }).catch((fetchErr: any) => {
      console.warn('Non-blocking outbid email dispatch failed:', fetchErr);
      return null;
    }).finally(() => {
      clearTimeout(timeoutId);
    });

    return Boolean(res && res.ok);
  } catch (err: any) {
    console.warn('Non-blocking outbid email error:', err);
    return false;
  }
}

/**
 * Non-blocking client-side trigger when an auction closes and the winning bidder is confirmed.
 */
export async function sendWinningBidConfirmationEmail(params: {
  auctionId: string;
  vehicleTitle: string;
  winningBid: number;
  winnerEmail: string;
  winnerName?: string;
  sellerName?: string;
  sellerEmail?: string;
  sellerPhone?: string;
}): Promise<boolean> {
  const cleanEmail = (params.winnerEmail || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    console.warn('[Settlement] Invalid or missing winner email address:', params.winnerEmail);
    return false;
  }

  const payload = {
    type: 'winning_bid_confirmation',
    auctionId: params.auctionId,
    vehicleTitle: params.vehicleTitle,
    winningBid: params.winningBid,
    winnerEmail: cleanEmail,
    winnerName: params.winnerName,
    sellerName: params.sellerName,
    sellerEmail: params.sellerEmail,
    sellerPhone: params.sellerPhone
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    let res: Response | null = null;
    try {
      res = await fetch('/api/send-consignment-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        ...(auth.currentUser ? { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` } : {})
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (fetchErr: any) {
      console.warn(`[Settlement] Error dispatching email: ${fetchErr?.message || fetchErr}`);
    } finally {
      clearTimeout(timeoutId);
    }

    if (res) {
      console.log(`[Settlement] HTTP ${res.status}: Winning bid confirmation dispatch ${res.ok ? 'completed' : 'failed'} for ${cleanEmail}`);
    }

    if (res && res.ok) {
      console.log(`[Settlement] SUCCESS: Dispatched winning bid confirmation email to ${cleanEmail}.`);
      return true;
    } else {
      if (res && !res.ok) {
        console.warn(`[Settlement] Error dispatching email: HTTP ${res.status}`);
      }
      return false;
    }
  } catch (err: any) {
    console.warn(`[Settlement] Error dispatching email: ${err?.message || err}`);
    return false;
  }
}

/**
 * Automated Clock Safeguard:
 * Evaluates whether an auction is eligible for background clock evaluation and countdown ticking.
 * Lots with status 'draft' or 'pending_review' strictly bypass automated clock progression.
 */
export function evaluateAuctionClockSafeguard(status?: string | null): {
  isClockActive: boolean;
  bypassClock: boolean;
} {
  const norm = (status || '').toLowerCase().trim();
  const bypassClock = norm === 'draft' || norm === 'pending_review';
  return {
    isClockActive: !bypassClock && (norm === 'live' || norm === 'active' || norm === 'upcoming' || norm === 'preview'),
    bypassClock
  };
}

// Wire welcome email dispatch to execute only when email verification is confirmed
if (typeof window !== 'undefined' && auth) {
  try {
    onAuthStateChanged(auth, async (user) => {
      if (user && user.email && user.emailVerified) {
        const uid = user.uid;
        try {
          const userSnap = await getDoc(doc(db, 'users', uid));
          if (userSnap.exists() && userSnap.data()?.welcomeEmailSent === true) {
            return;
          }
          sendWelcomeBidderEmail(uid, user.email, user.displayName || user.email.split('@')[0]).catch((err: any) => {
            console.warn('[Welcome Email] Automatic verified welcome email dispatch notice:', err);
          });
        } catch {
          // Ignore
        }
      }
    });
  } catch (err: any) {
    console.warn('Silent notice registering auth welcome listener:', err);
  }
}

/**
 * Submit Seller Consignment Application
 */
export async function submitConsignmentApplication(
  app: Omit<ConsignmentApplication, 'id' | 'submittedAt' | 'status'>,
  submissionId: string
): Promise<string> {
  const response = await fetch('/api/submit-consignment', {
    signal: AbortSignal.timeout(15000),
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...app, submissionId })
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || typeof result?.applicationId !== 'string') {
    throw Object.assign(new Error(result?.error || 'Application could not be saved. Please retry.'), { status: response.status });
  }
  const createdId = result.applicationId;
  const payload = { ...app, sellerEmail: app.sellerEmail.trim().toLowerCase(), status: 'pending' };
  // A replay must not issue another notification. Delivery remains best-effort.
  if (!result.created) return createdId;

  // Non-blocking consolidated serverless email notification (intake & seller receipt) with 5000ms timeout
  (async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      await fetch('/api/send-consignment-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        ...(auth.currentUser ? { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` } : {})
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
export async function approveConsignmentAndPromoteSeller(_applicationId: string, _userUid?: string, _vehicleTitle?: string): Promise<Auction> {
  throw new Error('One-click consignment conversion is disabled in staging. Create a draft through Vehicle Inventory instead.');
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
export async function convertConsignmentToDraftListing(_consignmentId: string): Promise<string> {
  throw new Error('One-click consignment conversion is disabled in staging. Create a draft through Vehicle Inventory instead.');
}

/**
 * Admin: Update status of a consignment application in consignment_applications.
 */
export async function updateConsignmentStatus(
  appId: string,
  status: 'pending' | 'approved' | 'rejected' | 'reviewed',
  applicationData?: Partial<ConsignmentApplication>
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

  // When status === 'rejected', trigger automated non-blocking rejection email workflow
  if (status === 'rejected') {
    (async () => {
      try {
        let appRecord: (Partial<ConsignmentApplication> & { email?: string }) | null = applicationData || null;
        let sellerEmail = (appRecord?.sellerEmail || appRecord?.email || '').trim().toLowerCase();
        if (!appRecord || !sellerEmail || !appRecord.year || !appRecord.make || !appRecord.model) {
          appRecord = (await getConsignmentApplication(cleanId)) as (ConsignmentApplication & { email?: string }) | null;
          sellerEmail = (appRecord?.sellerEmail || appRecord?.email || '').trim().toLowerCase();
        }

        if (!sellerEmail || !sellerEmail.includes('@')) {
          console.warn('[updateConsignmentStatus] Missing or invalid seller email address for rejection notification:', cleanId);
          return;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        await fetch('/api/send-consignment-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
        ...(auth.currentUser ? { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` } : {})
          },
          body: JSON.stringify({
            type: 'consignment_rejected',
            sellerEmail,
            sellerName: (appRecord?.sellerName || '').trim(),
            year: appRecord?.year,
            make: (appRecord?.make || '').trim(),
            model: (appRecord?.model || '').trim(),
            generation: (appRecord?.generation || '').trim(),
            applicationId: cleanId
          }),
          signal: controller.signal
        }).catch((fetchErr) => {
          console.warn('[updateConsignmentStatus] Non-blocking rejection email dispatch failed:', fetchErr);
        }).finally(() => {
          clearTimeout(timeoutId);
        });
      } catch (err) {
        console.warn('[updateConsignmentStatus] Error handling rejection email dispatch:', err);
      }
    })();
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

  // When status === 'rejected', query or fetch target records and trigger automated non-blocking rejection emails
  if (status === 'rejected') {
    (async () => {
      try {
        await Promise.all(validIds.map(async (id) => {
          try {
            const appRecord = (await getConsignmentApplication(id)) as (ConsignmentApplication & { email?: string }) | null;
            const sellerEmail = (appRecord?.sellerEmail || appRecord?.email || '').trim().toLowerCase();
            if (!sellerEmail || !sellerEmail.includes('@')) {
              console.warn('[batchUpdateConsignmentStatus] Missing or invalid seller email address for rejection notification:', id);
              return;
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            await fetch('/api/send-consignment-email', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
        ...(auth.currentUser ? { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` } : {})
              },
              body: JSON.stringify({
                type: 'consignment_rejected',
                sellerEmail,
                sellerName: (appRecord?.sellerName || '').trim(),
                year: appRecord?.year,
                make: (appRecord?.make || '').trim(),
                model: (appRecord?.model || '').trim(),
                generation: (appRecord?.generation || '').trim(),
                applicationId: id
              }),
              signal: controller.signal
            }).catch((fetchErr) => {
              console.warn('[batchUpdateConsignmentStatus] Non-blocking rejection email dispatch failed:', fetchErr);
            }).finally(() => {
              clearTimeout(timeoutId);
            });
          } catch (itemErr) {
            console.warn('[batchUpdateConsignmentStatus] Error dispatching rejection email for ID:', id, itemErr);
          }
        }));
      } catch (err) {
        console.warn('[batchUpdateConsignmentStatus] Error handling bulk rejection emails:', err);
      }
    })();
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
  const user = auth.currentUser;
  if (!user) throw new Error('Administrator authentication required.');
  const response = await fetch('/api/admin-delete-auction', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await user.getIdToken()}`
    },
    body: JSON.stringify({ auctionId: targetId, cascadeDeleteConsignment })
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(response.status < 500 && typeof result?.error === 'string'
      ? result.error : 'Unable to delete the listing.');
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
  const ids = [...new Set(auctionIds.map(id => id?.trim()).filter(Boolean))];
  if (ids.length === 0) return 0;
  const result = await requestAdminAuctionMutation('/api/admin-update-auction', { auctionIds: ids, updates: { status } });
  for (const listing of result.listings) {
    reconcileUpdatedAuction(listing.auctionId, listing);
  }
  return result.listings.length;
}

/**
 * Helper to identify transient Firestore concurrency/contention errors
 * that are safe to retry with exponential backoff.
 */
export function isTransientContentionError(err: any): boolean {
  if (!err) return false;
  const code = (err.code || '').toString().toLowerCase();
  const msg = (err.message || '').toString().toLowerCase();
  return (
    code === 'aborted' ||
    code === 'failed-precondition' ||
    code === 'unavailable' ||
    code.includes('aborted') ||
    code.includes('failed-precondition') ||
    code.includes('failed_precondition') ||
    msg.includes('aborted') ||
    msg.includes('failed-precondition') ||
    msg.includes('failed precondition') ||
    msg.includes('does not match the required base version') ||
    msg.includes('version mismatch') ||
    msg.includes('stored version') ||
    msg.includes('version') ||
    msg.includes('contention') ||
    msg.includes('concurrency')
  );
}

/**
 * Idempotent Auction Close Settlement Reconciliation Helper:
 * Ensures winning bidder confirmation emails fire strictly once per auction closure,
 * guards against auctions ending with zero bids or reserve not satisfied,
 * directly captures top bidder email credentials from winningBid.bidderEmail,
 * and updates auctions/{auctionId} state atomically.
 */
export async function advanceAuctionClock(auctionId: string): Promise<void> {
  const response = await fetch('/api/auction-clock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ auctionId })
  });
  if (!response.ok) throw new Error(`Auction clock request failed: ${response.status}`);
}

export async function reconcileAuctionClosureAndNotifyWinner(
  auctionId: string
): Promise<{ success: boolean; settled: boolean; winnerEmail?: string }> {
  const user = auth.currentUser;
  if (!user) throw new Error('Administrator authentication required.');
  const response = await fetch('/api/admin-settle-auction', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await user.getIdToken()}`
    },
    body: JSON.stringify({ auctionId: auctionId.trim() || MAIN_AUCTION_ID })
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.success !== true) {
    throw new Error(response.status < 500 && typeof result?.error === 'string'
      ? result.error : 'Unable to settle the auction.');
  }
  return result;
}

/**
 * Update a single auction's status through the trusted admin endpoint.
 */
export async function updateAuctionStatus(auctionId: string, status: Auction['status'] | string): Promise<void> {
  if (!auctionId) return;
  const id = auctionId.trim() || MAIN_AUCTION_ID;
  const result = await requestAdminAuctionMutation('/api/admin-update-auction', { auctionId: id, updates: { status } });
  if ((result.status === 'sold' || result.status === 'ended') && !result.winningEmailSent) {
    await reconcileAuctionClosureAndNotifyWinner(id);
  }
}

/**
 * Duplicate an existing listing into a clean copy draft.
 */
export async function duplicateListing(
  sourceAuctionOrId: Auction | string,
  _sourceMediaConfig?: MediaConfiguration
): Promise<Auction> {
  const auctionId = typeof sourceAuctionOrId === 'string' ? sourceAuctionOrId : sourceAuctionOrId.id;
  const result = await requestAdminAuctionMutation('/api/admin-duplicate-auction', { auctionId });
  return result.auction;
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
  _bidder: { uid: string; displayName: string; email: string }
): Promise<{ success: boolean; message?: string; antiSniped?: boolean; newEndTime?: number }> {
  const user = auth.currentUser;
  if (!user) throw new Error('Please log in to place a bid');

  const response = await fetch('/api/place-auction-bid', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await user.getIdToken()}`
    },
    body: JSON.stringify({ auctionId, amount })
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.success !== true) {
    throw new Error(
      response.status < 500 && typeof result?.error === 'string'
        ? result.error
        : 'Bidding is temporarily unavailable.'
    );
  }
  return result;
}

export const placeBid = placeBidWithAntiSnipe;

/**
 * Remove or Ban a Bidder (Moderation)
 * Legacy combined purge is disabled; bans and audited retractions remain separate actions.
 */
export async function banOrRemoveBidder(_userId: string, _auctionId: string): Promise<void> {
  throw new Error('Legacy bidder purge is disabled. Ban the member or retract individual bids through the moderation controls.');
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
  _adminUserId: string,
  _adminDisplayName?: string
): Promise<{ success: boolean; message?: string }> {
  const user = auth.currentUser;
  if (!user) throw new Error('Administrator authentication required.');
  const response = await fetch('/api/admin-retract-auction-bid', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await user.getIdToken()}`
    },
    body: JSON.stringify({ auctionId: auctionId.trim(), bidId: bidId.trim(), reason: reason.trim() })
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.success !== true) {
    throw new Error(response.status < 500 && typeof result?.error === 'string'
      ? result.error : 'Unable to retract the bid.');
  }
  return result;
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
 * Admin / Operational: Set user email verified status in Firestore
 * Persists updates atomically across Firestore 'users' and 'bidders' collections.
 * 
 * Note (M2.0B Correction A & B): This updates an informational profile field and directory record.
 * It does NOT grant authentication trust, administrator privileges, or server-side consignor promotion,
 * which strictly require Firebase Authentication email_verified token claims.
 */
export async function setUserEmailVerified(userId: string, isVerified: boolean = true): Promise<void> {
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

  // Defer sendWelcomeBidderEmail dispatch so it executes when verification transitions to true
  const recipientEmail = (userData?.email || (auth.currentUser?.uid === resolvedUid ? auth.currentUser?.email : '') || '').trim();
  if (isVerified && recipientEmail) {
    if (userData?.welcomeEmailSent !== true) {
      const displayName = userData?.displayName || (auth.currentUser?.uid === resolvedUid ? auth.currentUser?.displayName : '') || recipientEmail.split('@')[0];
      sendWelcomeBidderEmail(resolvedUid, recipientEmail, displayName).catch((err) => {
        console.warn('[Welcome Email] Verification welcome email dispatch notice:', err);
      });
    }
  }
}

/**
 * Client-Side Administrator Account Deletion Service
 * Dispatches an authenticated administrator deletion request to /api/admin-delete-user.
 * Server is the sole authority for deleting both the Firebase Authentication identity
 * and associated Firestore profile documents across 'users' and 'bidders'.
 * Client-side Firestore fallback purging is strictly forbidden.
 */
export interface DeleteUserRecordOptions {
  auth?: { currentUser: { getIdToken: () => Promise<string> } | null };
  fetch?: typeof fetch;
}

export async function deleteUserRecord(
  userId: string,
  options?: DeleteUserRecordOptions
): Promise<void> {
  const cleanId = userId?.trim();
  if (!cleanId) throw new Error('User ID is required for deletion.');

  const resolvedAuth = options?.auth || auth;
  const currentUser = resolvedAuth?.currentUser;
  if (!currentUser) {
    throw new Error('Authentication required: No active administrator session.');
  }

  const idToken = await currentUser.getIdToken();
  const fetchImpl = options?.fetch || fetch;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  let response: Response;
  try {
    response = await fetchImpl('/api/admin-delete-user', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ uid: cleanId }),
      signal: controller.signal
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('Deletion request timed out. Please try again.');
    }
    throw new Error(`Network failure during deletion request: ${err?.message || 'Unable to connect to server'}`);
  } finally {
    clearTimeout(timeoutId);
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Server returned status ${response.status} with non-JSON response.`);
  }

  if (!response.ok || data?.success !== true) {
    const errorMsg = data?.error || data?.message || `Server returned error status ${response.status}`;
    throw new Error(errorMsg);
  }
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
  const result = await memberAction({ action: 'watch', auctionId, watching: isWatching });
  return result.watchCount;
}

/**
 * Toggle a lot in the user's personal saved watchlist array in Firestore (users/{uid}).
 */
export async function toggleWatchlistLot(userId: string, auctionId: string): Promise<{ isWatching: boolean; watchlist: string[] }> {
  if (auth.currentUser?.uid !== userId) throw new Error('Sign in to manage your watchlist.');
  const profile = await getDoc(doc(db, 'users', userId));
  const current = profile.data()?.watchlist;
  return memberAction({ action: 'watch', auctionId, watching: !(Array.isArray(current) && current.includes(auctionId)) });
}

/**
 * Fetch all saved vehicle auctions in a user's watchlist array.
 */
export async function fetchUserWatchlist(userId: string): Promise<Auction[]> {
  if (auth.currentUser?.uid !== userId) return [];
  const profile = await getDoc(doc(db, 'users', userId));
  const ids = profile.data()?.watchlist;
  if (!Array.isArray(ids) || !ids.length) return [];
  const response = await fetch('/api/public-auctions');
  if (!response.ok) throw new Error('Unable to load saved vehicles.');
  const data = await response.json();
  return (data.auctions as Auction[]).filter(lot => ids.includes(lot.id));
}

/**
 * Submit Seller Inquiry (Contact Seller)
 */
export async function submitSellerInquiry(inquiry: {
  auctionId: string; senderId: string; senderName: string; senderEmail: string;
  senderPhone?: string; topic: string; message: string; vehicleTitle: string; sellerEmail?: string;
}): Promise<void> {
  await memberAction({ action: 'inquiry', auctionId: inquiry.auctionId, topic: inquiry.topic,
    message: inquiry.message, senderPhone: inquiry.senderPhone || '', requestId: crypto.randomUUID() });
}

export const submitInquiry = submitSellerInquiry;


/**
 * Post a public Q&A comment
 */
async function mutateAuctionComment(body: Record<string, unknown>): Promise<{ id: string }> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to join the conversation.');
  const response = await fetch('/api/auction-comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify(body)
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.id) {
    throw new Error(response.status < 500 && typeof result?.error === 'string'
      ? result.error : 'Unable to update the comment.');
  }
  return result;
}

export async function setCommentPinned(commentId: string, pinned: boolean) {
  await mutateAuctionComment({ action: 'pin', commentId, pinned });
}

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
  return mutateAuctionComment({ action: 'post', auctionId, text: commentData.text, replyToId: commentData.replyToId });
}

/**
 * Edit a previously posted comment (Author or Admin)
 */
export async function editComment(commentId: string, newText: string): Promise<void> {
  await mutateAuctionComment({ action: 'edit', commentId, text: newText });
}

/**
 * Delete a comment (Author or Admin)
 */
export async function deleteComment(commentId: string): Promise<void> {
  await mutateAuctionComment({ action: 'delete', commentId });
}

/**
 * Admin: Clear all existing bids and reset the auction bidding log to starting bid
 */
export async function clearAllBidsAndReset(auctionId: string, resetStartingBid?: number): Promise<void> {
  await requestAdminAuctionMutation('/api/admin-reset-auction-bids', {
    auctionId, ...(resetStartingBid !== undefined ? { startingBid: resetStartingBid } : {})
  });
}

/**
 * Upvote/Like a comment
 */
export async function toggleUpvoteComment(commentId: string, userId: string) {
  await mutateAuctionComment({ action: 'vote', commentId });
}

/**
 * Admin: Update auction configuration (dates, reserve, minimum increment, etc.)
 */
export async function updateAuctionConfig(
  auctionId: string,
  updates: Partial<Auction>
): Promise<void> {
  const targetId = auctionId?.trim() || MAIN_AUCTION_ID;
  const result = await requestAdminAuctionMutation('/api/admin-update-auction', { auctionId: targetId, updates: sanitizePayload(updates) });
  if (updates.status) reconcileUpdatedAuction(targetId, result);
}

function reconcileUpdatedAuction(auctionId: string, result: { status: string; winningEmailSent: boolean }) {
  if ((result.status === 'sold' || result.status === 'ended') && !result.winningEmailSent) {
    reconcileAuctionClosureAndNotifyWinner(auctionId).catch((error) => {
      console.warn('Auction closure reconciliation failed:', error);
    });
  }
}

async function requestAdminAuctionMutation(endpoint: string, body: Record<string, unknown>) {
  const user = auth.currentUser;
  if (!user) throw new Error('Administrator authentication required.');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await user.getIdToken()}`
    },
    body: JSON.stringify(body)
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) {
    throw new Error(response.status < 500 && typeof result?.error === 'string'
      ? result.error : 'Unable to complete the auction request.');
  }
  return result;
}

/**
 * Admin: Save media configuration to Firestore (keyed by auctionId if provided)
 */
export async function saveMediaConfig(config: MediaConfiguration, auctionId?: string): Promise<void> {
  const targetAuctionId = auctionId?.trim() || MAIN_AUCTION_ID;
  const user = auth.currentUser;
  if (!user) throw new Error('Administrator authentication required.');

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${await user.getIdToken()}`
  };
  async function uploadGalleryImage(dataUrl: string): Promise<string> {
    if (!dataUrl?.startsWith('data:')) return dataUrl;
    const response = await fetch('/api/admin-upload-auction-image', {
      method: 'POST', headers, body: JSON.stringify({ auctionId: targetAuctionId, dataUrl })
    });
    const result = await response.json().catch(() => null);
    // The draft remains private in Firestore until publication.
    if (response.status === 409) return dataUrl;
    if (!response.ok || typeof result?.url !== 'string') {
      throw new Error(response.status < 500 && typeof result?.error === 'string'
        ? result.error : 'Unable to upload gallery image.');
    }
    return result.url;
  }

  // Compress and upload any high-res Base64 images in hero and gallery arrays to Firebase Storage before persisting
  const compressedHero = await Promise.all((config.heroImages || []).map(async img => {
    const comp = await compressImageDataUrl(img);
    return await uploadGalleryImage(comp);
  }));
  const compressedGallery = await Promise.all((config.fullGallery || []).map(async item => {
    const comp = await compressImageDataUrl(item.url);
    const url = await uploadGalleryImage(comp);
    return {
      ...item,
      url
    };
  }));

  const response = await fetch('/api/admin-save-auction-media', {
    method: 'POST',
    headers,
    body: JSON.stringify({ auctionId: targetAuctionId, config: sanitizePayload({
      ...config, heroImages: compressedHero, fullGallery: compressedGallery
    }) })
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.saved !== true) {
    throw new Error(response.status < 500 && typeof result?.error === 'string'
      ? result.error : 'Unable to save listing media.');
  }

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

}

/**
 * Persists global branding settings both to Firestore /settings/global and synchronously to localStorage.
 */
export async function saveGlobalBranding(branding: Partial<GlobalBrandingSettings>): Promise<void> {
  if ((branding.defaultStartingBid !== undefined && (!Number.isSafeInteger(branding.defaultStartingBid) || branding.defaultStartingBid < 0)) ||
      (branding.defaultMinIncrement !== undefined && (!Number.isSafeInteger(branding.defaultMinIncrement) || branding.defaultMinIncrement <= 0))) {
    throw new Error('Use a nonnegative starting bid and a positive minimum increment.');
  }
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

  await withTimeout(setDoc(doc(db, 'settings', 'global'), sanitizePayload(brandingData), { merge: true }), 8000);
  try {
    localStorage.setItem(GLOBAL_BRANDING_STORAGE_KEY, JSON.stringify({
      siteLogo: brandingData.siteLogo,
      siteName: brandingData.siteName,
      siteTagline: brandingData.siteTagline
    }));
  } catch (err) {
    console.warn('Failed to save global branding to localStorage:', err);
  }


}

/**
 * Subscribe to real-time updates on /settings/global and synchronize with localStorage.
 */
export function subscribeToGlobalBranding(
  callback: (branding: GlobalBrandingSettings | null) => void
) {
  const isAdmin = auth.currentUser?.emailVerified === true && isDesignatedAdminEmail(auth.currentUser.email);
  if (!isAdmin) return pollPublicAuctions('/api/public-settings', result => callback(result?.branding ?? null));
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
 * Retrieve real-time media configuration once
 */
export async function getMediaConfig(auctionId?: string): Promise<MediaConfiguration | null> {
  const targetAuctionId = auctionId?.trim() || MAIN_AUCTION_ID;
  const docId = (targetAuctionId !== MAIN_AUCTION_ID) ? `media-${targetAuctionId}` : MEDIA_CONFIG_DOC_ID;
  try {
    const mediaRef = doc(db, 'settings', docId);
    const snap = await getDoc(mediaRef);
    if (snap.exists()) {
      return snap.data() as MediaConfiguration;
    }
    return (targetAuctionId !== MAIN_AUCTION_ID) ? BLANK_MEDIA_CONFIG : DEFAULT_MEDIA_CONFIG;
  } catch (err) {
    console.warn('Error fetching media config from Firestore:', err);
    return (targetAuctionId !== MAIN_AUCTION_ID) ? BLANK_MEDIA_CONFIG : DEFAULT_MEDIA_CONFIG;
  }
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
  throw new Error('Broad catalog purge is disabled. Use selected-listing deletion in Vehicle Inventory.');
}

/**
 * Admin helper: Reset auction to test duration (e.g. 2 minutes left for anti-sniping test)
 */
export async function setAuctionEndingSoon(auctionId: string, secondsFromNow = 110) {
  await updateAuctionConfig(auctionId, {
    startTime: Date.now() - 3600000,
    endTime: Date.now() + secondsFromNow * 1000,
    status: 'active'
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
          ...d.data(),
          id: d.id,
          reviewSource: 'consignments'
        })) as ConsignmentApplication[];
      } catch (e) {
        list = [];
      }
    } else {
      list = snapshot.docs.map(d => ({
        ...d.data(),
        id: d.id,
        reviewSource: 'consignment_applications'
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
export async function fetchUserActivitySummary(userId: string, _userEmail: string): Promise<UserActivitySummary> {
  if (auth.currentUser?.uid !== userId) throw new Error('Sign in to view your activity.');
  return memberAction({ action: 'activity' });
}

export const DEFAULT_PROMO_SETTINGS: PlatformPromoSettings = {
  enabled: true,
  cadenceInterval: 6,
  feedbackWidget: {
    enabled: true,
    label: 'Feedback & Bug Report'
  },
  catalogBanner: {
    enabled: false,
    badgeText: '',
    text: '',
    ctaText: 'Sell Your Vehicle',
    ctaAction: 'consignment_modal',
    targetAudience: 'all',
    clickCount: 0
  },
  lotHeaderBanner: {
    enabled: true,
    badgeText: 'LAUNCH SPECIAL',
    text: 'Zero buyer premiums & $0 seller fees for our inaugural catalog launch.',
    ctaText: 'Sell Your Vehicle',
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
      ctaText: 'Sell Your Vehicle →',
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
        const rawCatalogBanner = data.catalogBanner || {};
        const rawFeedback = data.feedbackWidget || {};
        const defaultFeedback = DEFAULT_PROMO_SETTINGS.feedbackWidget || {
          enabled: true,
          label: 'Feedback & Bug Report'
        };
        const defaultCatalog = DEFAULT_PROMO_SETTINGS.catalogBanner || {
          enabled: false,
          badgeText: '',
          text: '',
          ctaText: '',
          ctaAction: 'consignment_modal',
          targetAudience: 'all',
          clickCount: 0
        };
        const settings: PlatformPromoSettings = {
          enabled: typeof data.enabled === 'boolean' ? data.enabled : DEFAULT_PROMO_SETTINGS.enabled,
          cadenceInterval: typeof data.cadenceInterval === 'number' ? data.cadenceInterval : (DEFAULT_PROMO_SETTINGS.cadenceInterval ?? 6),
          feedbackWidget: {
            ...defaultFeedback,
            ...rawFeedback,
            enabled: typeof rawFeedback.enabled === 'boolean' ? rawFeedback.enabled : defaultFeedback.enabled,
            label: typeof rawFeedback.label === 'string' ? rawFeedback.label : defaultFeedback.label,
            badgeText: typeof rawFeedback.badgeText === 'string' ? rawFeedback.badgeText : defaultFeedback.badgeText
          },
          catalogBanner: {
            ...defaultCatalog,
            ...rawCatalogBanner,
            enabled: typeof rawCatalogBanner.enabled === 'boolean' ? rawCatalogBanner.enabled : defaultCatalog.enabled,
            targetAudience: rawCatalogBanner.targetAudience || defaultCatalog.targetAudience
          },
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
 * Client-written promotion counters are disabled under the candidate rules.
 */
export async function recordPromoClick(_promoId: string, _isBanner?: boolean): Promise<void> {
  // Client-written promotion telemetry is disabled under the candidate rules.
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

