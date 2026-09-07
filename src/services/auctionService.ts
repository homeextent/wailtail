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
  arrayRemove
} from 'firebase/firestore';
import { db } from '../firebase';
import { Auction, Bid, Comment, UserProfile, MediaConfiguration, SellerInquiry, ConsignmentApplication } from '../types';
import { mediaConfig as DEFAULT_MEDIA_CONFIG } from '../mediaConfig';
export { DEFAULT_MEDIA_CONFIG };
import { sendBidPlacedEmail, sendOutbidAlertEmail, sendSellerInquiryEmail } from './emailService';

export const MAIN_AUCTION_ID = 'wailtail-1978-porsche-911';
export const MEDIA_CONFIG_DOC_ID = 'main-media-config';
export const ANTI_SNIPING_WINDOW_MS = 2 * 60 * 1000; // 2 minutes in ms
export const ANTI_SNIPING_EXTENSION_MS = 2 * 60 * 1000; // 2 minutes extension

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
export async function initializeAuctionIfNotExists(): Promise<Auction> {
  try {
    const auctionRef = doc(db, 'auctions', MAIN_AUCTION_ID);
    const snap = await getDoc(auctionRef);

    if (snap.exists()) {
      const data = snap.data() as Auction;
      return data;
    }

    // Set default initial auction
    await setDoc(auctionRef, DEFAULT_AUCTION);

    // Seed initial bids
    const bidsCol = collection(db, 'bids');
    for (const bid of INITIAL_BIDS) {
      await addDoc(bidsCol, bid);
    }

    // Seed initial comments
    const commentsCol = collection(db, 'comments');
    for (const comm of INITIAL_COMMENTS) {
      await addDoc(commentsCol, comm);
    }

    return DEFAULT_AUCTION;
  } catch (error) {
    console.warn('Auction initialized in local/offline fallback mode:', error);
    return DEFAULT_AUCTION;
  }
}

/**
 * Subscribe to real-time updates on the auction document
 */
export function subscribeToAuction(
  auctionId: string,
  callback: (auction: Auction | null) => void
) {
  const auctionRef = doc(db, 'auctions', auctionId);
  return onSnapshot(auctionRef, (snap) => {
    if (snap.exists()) {
      callback(snap.data() as Auction);
    } else {
      callback(null);
    }
  }, (err) => {
    console.error('Error listening to auction:', err);
  });
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
      callback([DEFAULT_AUCTION]);
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

    // Ensure default auction is included if not in Firestore yet
    if (!list.some(a => a.id === MAIN_AUCTION_ID)) {
      list.unshift(DEFAULT_AUCTION);
    }
    callback(list);
  }, (err) => {
    console.warn('Error fetching all auctions:', err);
    callback([DEFAULT_AUCTION]);
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
  const colRef = collection(db, 'consignments');
  const payload: ConsignmentApplication = {
    ...app,
    submittedAt: Date.now(),
    status: 'pending'
  };
  try {
    const docRef = await addDoc(colRef, sanitizePayload(payload));
    return docRef.id;
  } catch (err) {
    console.warn('Saved consignment locally fallback:', err);
    return `consignment-${Date.now()}`;
  }
}

/**
 * Permanently delete a vehicle lot document and its media configuration from Firestore.
 */
export async function deleteListing(auctionId: string): Promise<void> {
  try {
    const docRef = doc(db, 'auctions', auctionId);
    await deleteDoc(docRef);

    // Delete associated media settings
    const mediaRef = doc(db, 'settings', `media-${auctionId}`);
    await deleteDoc(mediaRef);

    // Clean up local cache if present
    try {
      localStorage.removeItem(`wailtail_custom_media_${auctionId}`);
    } catch (e) {
      // ignore
    }
  } catch (err) {
    console.error('Error deleting listing document:', err);
    throw err;
  }
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
        sourceAuction = { ...DEFAULT_AUCTION, id: sourceAuctionOrId };
      }
    } catch {
      sourceAuction = { ...DEFAULT_AUCTION, id: sourceAuctionOrId };
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
export async function placeBid(
  auctionId: string,
  amount: number,
  bidder: {
    uid: string;
    displayName: string;
    email: string;
  }
): Promise<{ success: boolean; message?: string; antiSniped?: boolean; newEndTime?: number }> {
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
 * Unban a Bidder / Restore Bidding Privileges
 */
export async function unbanBidder(userId: string): Promise<void> {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, {
    bannedFromBidding: false
  });
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
  const auctionRef = doc(db, 'auctions', auctionId);
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
  const docId = (auctionId && auctionId !== MAIN_AUCTION_ID) ? `media-${auctionId}` : MEDIA_CONFIG_DOC_ID;
  const mediaRef = doc(db, 'settings', docId);
  const cleanConfig = sanitizePayload({
    ...config,
    updatedAt: Date.now()
  });

  await withTimeout(
    setDoc(mediaRef, cleanConfig, { merge: true }),
    8000
  );
}

/**
 * Subscribe to real-time media configuration
 */
export function subscribeToMediaConfig(
  callback: (config: MediaConfiguration | null) => void,
  auctionId?: string
) {
  const docId = (auctionId && auctionId !== MAIN_AUCTION_ID) ? `media-${auctionId}` : MEDIA_CONFIG_DOC_ID;
  const mediaRef = doc(db, 'settings', docId);
  return onSnapshot(mediaRef, (snap) => {
    if (snap.exists()) {
      callback(snap.data() as MediaConfiguration);
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
  const docId = (auctionId && auctionId !== MAIN_AUCTION_ID) ? `media-${auctionId}` : MEDIA_CONFIG_DOC_ID;
  try {
    const mediaRef = doc(db, 'settings', docId);
    const snap = await getDoc(mediaRef);
    if (snap.exists()) {
      return snap.data() as MediaConfiguration;
    }
    const initialConfig: MediaConfiguration = (auctionId && auctionId !== MAIN_AUCTION_ID)
      ? {
          vehicleName: 'New Vehicle Lot',
          heroImages: [],
          overviewHeading: 'Vehicle Overview & Provenance',
          overviewParagraphs: ['Clean vehicle lot draft.'],
          overviewImage: { url: '', caption: '', alt: '' },
          overviewSpecs: [],
          inlineShowcase: [],
          fullGallery: [],
          youtubePlaylistUrl: '',
          videoChapters: []
        }
      : DEFAULT_MEDIA_CONFIG;

    await setDoc(mediaRef, sanitizePayload(initialConfig));
    return initialConfig;
  } catch (err) {
    console.warn('Using local fallback media configuration:', err);
    return DEFAULT_MEDIA_CONFIG;
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
    const list: UserProfile[] = snapshot.docs.map((d) => ({
      uid: d.id,
      ...d.data()
    })) as UserProfile[];
    callback(list);
  }, (err) => {
    console.error('Error fetching registered bidders:', err);
  });
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
