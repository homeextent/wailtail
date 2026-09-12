# Wailtail Auction Platform — System Bible & Architectural Specification

## 1. Executive Architecture Overview

**Wailtail** is an enterprise-grade, multi-car private auction platform modeled after Bring-a-Trailer, engineered specifically for high-value collector automobiles. The platform supports multiple concurrent active and upcoming vehicle listings simultaneously, combining real-time bidding synchronization with editorial-grade vehicle storytelling, per-lot media configuration, multi-category gallery management, and a dedicated multi-listing authoring workspace.

### Technology Stack
* **Frontend Framework**: React 19 with TypeScript and Vite
* **Progressive Web App (PWA) & Offline Engine**: `vite-plugin-pwa` with Workbox runtime caching (`StaleWhileRevalidate` for scripts/styles, `NetworkFirst` for media/queries) and standalone Web Manifest (`name: "Wailtail Auctions"`, `short_name: "Wailtail"`, `#0f172a` theme)
* **Background Push Service Worker & FCM**: Native background Service Worker (`public/firebase-messaging-sw.js`) utilizing Firebase compat SDKs and Firebase Cloud Messaging (`firebase/messaging`) Web Push API with VAPID key token exchange
* **Multi-Listing Architecture**: Dynamic catalog indexing with `/dashboard/listings/[id]/edit` dedicated workspace routing, `/admin` full-page portal, and multi-lot state hydration
* **Dynamic Promotional Campaign Engine**: Launch promotional subsystem featuring responsive catalog grid card injection (`VehicleCatalogGrid.tsx`), direct-lot header notification banners (`AuctionHeader.tsx`), audience-segmented display filters, schedule windows, image asset uploader, and client dismissal tracking (`wailtail_dismissed_promos`)
* **Decoupled Guest Telemetry Engine**: Atomic `promo_analytics/{promoId}` click counting using `increment(1)` writes, permitting public unauthenticated telemetry logging while securing campaign configuration
* **Styling**: Tailwind CSS with custom editorial typographic scales
* **Real-Time Data Engine**: Google Cloud Firestore with snapshot listeners (`onSnapshot`)
* **Security & Auth**: Firebase Authentication & Firestore Security Rules (`firestore.rules`)
* **Host & Infrastructure**: Cloud Run containerized deployment, reverse proxied on port 3000
* **Serverless Edge Layer**: Vercel Serverless Functions (`/api/send-consignment-email`, `/api/youtube-playlist`, `/api/admin-delete-user`)
* **Firebase Infrastructure & Named Database CLI Deployment**: `firebase.json` configuration binding explicitly to named database instance `ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e`, `.firebaserc` project binding (`studio-apps-483721`), synchronized production `firestore.rules`, and zero-drift terminal deployment pipeline via `npm run deploy:rules` (`firebase deploy --only firestore:rules`)

### 1.1 Platform Architecture & Routing Map

| Route / Surface | Component / Handler | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `/` & `/catalog` | `VehicleCatalogGrid.tsx` | Public | Multi-car vehicle catalog grid acting as primary homepage; features live CAD bid telemetry, search, category filters (`All Lots`, `Live`, `Upcoming`, `Ended`) with normalized status predicates (`isLive`, `isUpcoming`, `isEnded`), and dynamic launch promotional card injection (`PromoCardConfig`) during low-inventory view states. |
| `/auctions/[id]` | `App.tsx` (Single Lot View) | Public | Focused single-car lot viewing with live anti-snipe countdown, direct-lot promotional header banner (`AuctionHeader.tsx`), sticky bid bar (`StickyBidBar.tsx`), hero carousel, showcase chapters, driving playlist, and public Q&A. |
| `/admin` | `AdminPortalPage.tsx` | `ADMIN` only | Full-page operations portal featuring 5 command suites: Member Directory / Member Directory Management (formerly Bidder Registry), Consignment Applications, Vehicle Inventory & Lots, Live Bids Telemetry Ledger, and Platform Branding (with real-time Promotional & Launch Campaign Manager). Supports Multi-Select Bulk Action Engine, 1-click email triage deep-links (`/admin?tab=consignments&id=${appId}&action=approve|reject`), and cascading deletion controls. |
| `/dashboard/listings/[id]/edit` | `ListingEditorWorkspace.tsx` | `ADMIN`, `SELLER` | Dedicated split-screen authoring workspace with 60/40 reactive layout, desktop/mobile preview simulation, sticky 7-section progress stepper, and JSON schema import/export. |
| User Activity Hub (Modal) | `UserAccountHubModal.tsx` | Authenticated | Global account activity modal accessible from top navigation; displays active bid telemetry (`LEADING` vs `OUTBID`), 4-stage offline CAD settlement checklist, seller lot telemetry, consignment status, and **Notification Control Panel** with "Enable Live Outbid Alerts" toggle and iOS Safari PWA installation guide. |
| Background Service Worker | `public/firebase-messaging-sw.js` | Public / Worker | Standalone background service worker listening for FCM push messages (`onBackgroundMessage`), displaying native outbid, closing warning, and status notifications with deep linking and notification click focus. |
| `/api/send-consignment-email` | `api/send-consignment-email.ts` | Public / Serverless | Vercel serverless proxy endpoint dispatching structured HTML intake notifications via Resend API to platform administrators and dual-branded confirmation emails. |
| `/api/admin-delete-user` | `api/admin-delete-user.ts` | `ADMIN` only / Serverless | Vercel serverless proxy endpoint executing atomic Firebase Authentication identity deletion (`admin.auth().deleteUser(uid)`) with ESM interop resolution and private key newline unescaping. |
| `/api/youtube-playlist` | `api/youtube-playlist.ts` | Public / Serverless | Vercel serverless proxy bypassing browser CORS to parse YouTube playlist XML Atom feeds into driving video chapters. |

---

## 2. Core Firestore Data Schemas

### 2.1 `auctions` Collection
Document ID: `current` (or specific auction UUID)
```typescript
interface Auction {
  id: string;
  title: string;
  subtitle: string;
  make: string;
  model: string;
  generation?: string; // Optional generation / chassis code (e.g. "930", "E46", "993")
  year: number;
  vin: string;
  mileage: string; // Formatted number or string (e.g. "126,200")
  distanceUnit: 'km' | 'mi'; // Canadian standard default is 'km'
  highlightsBadge?: string; // Header badge on specs card (e.g. "1978 911")
  location: string;
  sellerName: string;
  engine: string;
  drivetrain: string;
  exteriorColor: string;
  interiorColor: string;
  titleStatus: string;
  
  // Financial & Currency Rules
  currency: 'CAD'; // Strictly enforced CAD currency
  currentBid: number;
  startingBid: number;
  reserveAmount: number;
  isReserveMet: boolean;
  bidCount: number;
  minimumIncrement: number; // CAD increment step (e.g., $500, $1,000)
  
  // Timing & Lifecycle Status
  status: 'preview' | 'live' | 'ending_soon' | 'ended' | 'sold' | 'reserve_not_met';
  startTime: number; // Unix timestamp in milliseconds
  endTime: number;   // Unix timestamp in milliseconds
  antiSnipeThresholdSeconds: number; // Default: 120 seconds (2 minutes)
  antiSnipeExtensionSeconds: number; // Default: 120 seconds (adds 2 minutes)
  watchlist?: string[]; // Registered user UIDs watching this auction lot
  
  // Global Platform Branding Overrides
  siteLogo?: string;
  siteName?: string;
  siteTagline?: string;
}
```

### 2.2 `bids` Subcollection / Collection
Path: `auctions/{auctionId}/bids/{bidId}`
```typescript
interface Bid {
  id: string;
  auctionId: string;
  amount: number; // In CAD
  bidderId: string;
  bidderHandle: string; // e.g. "PacificCollector"
  bidderLocation?: string; // e.g. "Vancouver, BC"
  isVerifiedBidder: boolean;
  timestamp: number; // Unix timestamp
  antiSnipeTriggered?: boolean;

  // Option B Administrative Soft Retraction & Audit Fields
  status?: 'active' | 'retracted';
  retractedAt?: number;
  retractionReason?: string;
  retractedBy?: string; // UID of retracting admin
  retractedByName?: string; // Display name or human-readable identifier of retracting admin
}
```

### 2.3 `comments` Collection
Path: `auctions/{auctionId}/comments/{commentId}`
```typescript
interface Comment {
  id: string;
  auctionId: string;
  authorId: string;
  authorName: string;
  authorBadge?: 'Seller' | 'Consignor' | 'Bidder' | 'Staff';
  text: string;
  timestamp: number;
  upvotes: number;
  flagged?: boolean;
}
```

### 2.4 `mediaConfig` Document & Media Subcollection
Path: `auctions/{auctionId}/media/{document=**}` (e.g. `auctions/{auctionId}/media/config` or `settings/media-${auctionId}`)
```typescript
interface MediaConfiguration {
  siteLogo?: string;
  siteName?: string;
  siteTagline?: string;
  highlightsBadge?: string;
  distanceUnit?: 'km' | 'mi';
  vehicleName: string;
  
  // Hero Carousel
  heroImages: string[]; // Ordered URLs for the top carousel (Media Pending fallback container when empty)
  
  // Editorial Overview
  overviewHeading: string;
  overviewParagraphs: string[];
  overviewImage?: {
    url: string;
    caption: string;
    alt: string;
  };
  overviewSpecs: Array<{ label: string; value: string }>;
  
  // Video Playlist
  videoTitle: string;
  videoSubtitle: string;
  youtubePlaylistUrl?: string;
  videoChapters: Array<{
    id: string;
    title: string;
    description: string;
    videoUrl: string;
    thumbnailUrl?: string;
  }>;
  
  // Predefined Curated Showcase Chapters (New Standard)
  showcaseChapters?: ShowcaseChapter[];

  // Chapter Showcases (Legacy compatibility layer)
  inlineShowcase: Array<{
    id: string;
    title: string;
    subtitle?: string;
    content?: string;
    paragraphs?: string[];
    features?: string[];
    bulletPoints?: string[];
    specs?: Array<{ label: string; value: string }>;
    images: Array<{
      url: string;
      caption?: string;
      title?: string;
    }>;
  }>;
  
  // Categorized Full Gallery
  fullGallery: GalleryImage[];
}

export type ShowcaseChapterCategory = 'EXTERIOR' | 'POWERTRAIN' | 'INTERIOR' | 'CHASSIS' | 'CUSTOM';

export interface ShowcaseChapter {
  id: string;
  category: ShowcaseChapterCategory;
  title: string;        // Locked for predefined categories; editable if 'CUSTOM'
  subtitle: string;
  narrative: string;
  photoUrl: string;
  photoCaption: string;
  highlights: string[];
  specCards: ShowcaseSpecCard[];
}

export interface ShowcaseSpecCard {
  id: string;
  key: string;        // Context-aware preset key or custom key
  value: string;      // Specification detail string
  isCustomKey: boolean;
}

interface GalleryImage {
  id: string;
  url: string;
  title: string;
  caption?: string;
  category: 'exterior' | 'interior' | 'engine' | 'underbody' | 'docs' | 'documentation';
  isPdf?: boolean;
}
```

### 2.5 Predefined Showcase Chapter Taxonomy & Spec Presets

#### Fixed Category Rules & Locked Titles
* **`EXTERIOR`**: Title locked to `"Exterior Highlights"`. Badged amber. Specs preset includes: `Body Style`, `Paint Code`, `Aerodynamics`, `Wheels`, `Tires`, `Lighting`, `Glass`, `Spoilers / Trim`.
* **`POWERTRAIN`**: Title locked to `"Powertrain"`. Badged rose/red. Specs preset includes: `Displacement`, `Configuration`, `Horsepower`, `Torque`, `Induction / Fueling`, `Transmission`, `Final Drive`, `Exhaust`.
* **`INTERIOR`**: Title locked to `"Cabin & Cockpit"`. Badged emerald. Specs preset includes: `Upholstery`, `Seating`, `Steering Wheel`, `Instrumentation`, `Audio System`, `Climate Control`, `Pedals / Shifter`, `Headliner`.
* **`CHASSIS`**: Title locked to `"Chassis & Suspension"`. Badged blue. Specs preset includes: `Front Suspension`, `Rear Suspension`, `Brakes`, `Brake Calipers`, `Sway Bars`, `Dampers`, `Steering Rack`, `Curb Weight`.
* **`CUSTOM`**: Fully editable chapter title. Badged purple. Specs preset includes: `Provenance`, `Restoration`, `Modifications`, `Track Setup`, `Ownership`, `Awards`, `Documentation`, `Service Records`.

#### Context-Aware Hybrid Spec Cards System
Each spec card uses a searchable Combobox (`SpecCardCombobox.tsx`) that contextually filters available preset keys based on the parent chapter's category. Sellers can either select a recommended preset or type a bespoke attribute and click `"Add Custom Key..."`, flagging `isCustomKey: true`. Automatic bi-directional normalization (`showcaseConverter.ts`) guarantees full backward-compatibility with legacy listings.

### 2.6 3-Tier Collector Vehicle Taxonomy Architecture & Schema

The platform implements a curated, hierarchical vehicle taxonomy system specifically structured for collector, classic, and enthusiast automobiles:

#### 80+ Collector Vehicle Dataset (`src/data/vehicleTaxonomy.json`)
* Curated repository spanning 80+ enthusiast marques (including Porsche, Ferrari, BMW, Mercedes-Benz, Alpina, Aston Martin, Bugatti, Shelby, McLaren, Lotus, Lamborghini, and Lancia).
* Each marque maps to distinct enthusiast models, which further nest specific chassis codes, series designations, and production generations (e.g. `Porsche` $\rightarrow$ `911` $\rightarrow$ `930`, `964`, `993`, `996`, `997`, `991`, `992`).

#### 3-Tier Dependent Selection Pipeline
The form input workflow follows a reactive cascading pipeline:
1. **Year**: Standardized numerical selection dropdown (1930–2026).
2. **Make**: Primary selector filtering the top-level brands from `vehicleTaxonomy.json`.
3. **Model**: Dynamically hydrated based on the selected Make. Modifying the Make immediately cascades a reset of downstream Model and Generation states.
4. **Generation / Chassis Code**: Dynamically hydrated based on the selected Model. When a model contains recognized chassis codes (e.g. `E30`, `E36`, `E46` for BMW 3-Series), a dedicated Generation dropdown activates. If no generations exist, the field cleanly disables or prompts custom entry.

#### `TAXONOMY_OTHER_CUSTOM` Fallback Handling
* Every tier provides an `"Other / Custom..."` (`TAXONOMY_OTHER_CUSTOM = '__OTHER_CUSTOM__'`) option.
* When selected at any tier (Make, Model, or Generation), a companion text input immediately surfaces, permitting unconstrained custom text entry.
* The system transparently resolves the effective value between the selected preset and the custom text string, ensuring rare, one-off, or bespoke coachbuilt listings are fully supported without schema constraints.

### 2.7 `consignment_applications` Collection Schema Extensions

Path: `consignment_applications/{applicationId}`
Captures seller consignment intake submissions with structured location data, authenticated user cross-referencing, and conversion lifecycle tracking:
```typescript
export interface ConsignmentApplication {
  id?: string;
  year: string | number;
  make: string;
  model: string;
  generation?: string;
  vin?: string;
  mileage?: string;
  transmission?: string;
  
  // Structured Location Properties
  location?: string;            // Formatted string (e.g., "Calgary, AB, Canada")
  locationCity?: string;        // e.g., "Calgary"
  locationProvince?: string;    // e.g., "Alberta"
  locationCountry?: string;     // e.g., "Canada"
  
  // Financial & Condition
  reserveExpectation?: string;  // e.g., "$85,000 CAD" or "No Reserve"
  sellerName: string;
  sellerEmail: string;
  sellerPhone: string;
  notes?: string;
  submittedAt: number;          // Epoch timestamp ms
  
  // Moderation & Lifecycle State
  status?: 'pending' | 'reviewed' | 'approved' | 'declined' | 'rejected';
  convertedAuctionId?: string;  // Associated draft auction lot ID when approved
  
  // Authenticated Member Cross-Reference (Option A Auto-Link)
  registeredUserId?: string;    // UID of existing member if matched
  isRegisteredUser?: boolean;   // Flag indicating registered member submission
  registeredUserRole?: string;  // Active role ('ADMIN' | 'SELLER' | 'BIDDER') at submission
}
```

### 2.8 User Activity Summary & Telemetry Data Models

Used by `fetchUserActivitySummary()` and `UserAccountHubModal.tsx` to compile real-time personal auction engagement across all roles:
```typescript
export interface UserActivitySummary {
  activeBids: UserBidActivity[];
  wonAuctions: UserWonAuction[];
  sellerListings: UserSellerListing[];
  consignments: UserConsignmentItem[];
}

export interface UserBidActivity {
  auctionId: string;
  auctionTitle: string;
  auctionHeroImage: string;
  currentHighBid: number;       // Current highest lot bid in CAD
  userHighestBid: number;       // Bidder's highest placed bid in CAD
  status: 'LEADING' | 'OUTBID'; // Dynamic standing against current high bid
  endTime: number;
  bidCount: number;
  currency: string;
  isReserveMet?: boolean;
}

export interface UserWonAuction {
  auctionId: string;
  auctionTitle: string;
  auctionHeroImage: string;
  winningBid: number;           // Final closing bid in CAD
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
  draftEditUrl: string;         // Direct deep link to /dashboard/listings/[id]/edit
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
```

### 2.9 `users` Collection & `UserProfile` Schema

Path: `users/{userId}` (mirrored to `bidders/{userId}`)
Captures user identity, authentication state, role-based access control, bidding telemetry, and the user's personal saved auction watchlist:
```typescript
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
  watchlist?: string[]; // Array of saved auction lot IDs
  fcmTokens?: string[]; // Registered FCM device tokens for Web Push outbid & auction alerts
}
```

#### Watchlist Service Method Signatures
The platform provides atomic service operations in `src/services/auctionService.ts` for managing watchlists across user documents and lot-level watch tallies:
```typescript
// Toggles an auction ID inside users/{userId}.watchlist (and bidders/{userId}.watchlist)
// and updates the aggregate watchCount on the auction lot.
export function toggleWatchlistLot(
  userId: string,
  auctionId: string
): Promise<{ isWatching: boolean; watchlist: string[] }>;

// Fetches full Auction records for all auction IDs present in the user's watchlist.
export function fetchUserWatchlist(userId: string): Promise<Auction[]>;
```

#### UserProfile Authentication & Security Protocols (`AuthContext.tsx` & `AuthModal.tsx`)

1. **Orphaned Auth Session Revocation Guard**:
   - `AuthContext.tsx` safeguards active sessions against deleted user accounts through dual verification: an initial `onAuthStateChanged` hydration verification and an active real-time `onSnapshot` profile listener on `users/{uid}`.
   - If an account's Firestore document is deleted while the user has an active session, both listeners detect that `users/{uid}` no longer exists (`!snap.exists()`).
   - Immediately executes `signOut(auth)` via `fbSignOut`, purges local user and profile state (`setUser(null)`, `setUserProfile(null)`), surfaces a persistent toast notification (`"This account has been deleted by an administrator."`), and forces an immediate client-side redirect to `/`.

2. **Strict Email Verification Enforcement**:
   - **Post-Signup Auto-Logout**: Following user registration via email and password (`signUpEmail()`), a verification email is dispatched and `signOut(auth)` is immediately invoked. This terminates the automatic Firebase client auto-login and prevents unverified sessions from interacting with the platform.
   - **Login Blocking for Unverified Credentials**: During sign-in attempts in `AuthModal.tsx` and `signInEmail()`, credentials where `!currentUser.emailVerified && !userProfile.isEmailVerified` are blocked from session hydration, immediately signed out, and presented with a verification required prompt. Platform access is unlocked only after email confirmation link click or staff manual override (`setUserEmailVerified`).
   - **Credentialed Unauthenticated Status Checks (`checkEmailVerification`)**: Enables users to verify their email status even without an active session by providing credentials (`email` and `pass`). The function signs in against Firebase Authentication, reloads the user instance via `currentUser.reload()`, evaluates `currentUser.emailVerified`, and atomically auto-syncs `isEmailVerified: true` across both `users/{uid}` and `bidders/{uid}` collections in Firestore.
   - **Atomic Auto-Sync Across Collections**: Once email verification is confirmed (via client verification reload or manual administrative staff override in `/admin`), `isEmailVerified: true` is atomically written across both `users/{uid}` and `bidders/{uid}` documents, synchronizing the entire user profile in state.

3. **Google OAuth Direct State Hydration (`signInGoogle`)**:
   - Executes Google sign-in via `signInWithPopup(auth, googleProvider)`.
   - **Eliminates Manual Page Refreshes**: Directly sets `setUser(cred.user)` and `setUserProfile(profile)` upon credential resolution, removing listener suppression flags and eliminating the need for page reloads.
   - **Pre-Verified Email Guarantees**: Sets `isEmailVerified: true` by default since Google OAuth accounts are pre-verified.
   - **Ban Checks**: Validates `profile.isBanned` and `profile.bannedFromBidding`. If flagged, immediately signs out (`fbSignOut(auth)`), clears all session states, and throws an access revoked error.
   - **Designated Admin Role Assignment**: Cross-checks user email against `ADMIN_EMAILS` (case-insensitive); matching addresses receive `role: 'admin'`, while standard members are assigned `role: 'bidder'`.
   - **Deferred Welcome Dispatch**: Checks `localStorage` sentinel key `wailtail_welcome_sent_${uid}`; if absent, dispatches `sendWelcomeBidderEmail()` asynchronously.

### 2.10 `settings/promotions` Document Schema

Path: `settings/promotions`
Governs platform-wide launch promotional campaigns, catalog grid card injection, and direct-lot header banners:
```typescript
export type PromoCtaAction = 'consignment_modal' | 'auth_modal' | 'contact_modal' | 'external_url';
export type PromoAudience = 'all' | 'guests_only' | 'authenticated_only';
export type PromoAccentColor = 'amber' | 'emerald' | 'purple' | 'blue';

export interface PromoCardConfig {
  id: string;
  enabled: boolean;
  badgeText?: string;
  headline: string;
  copy: string;
  ctaText: string;
  ctaAction: PromoCtaAction;
  ctaUrl?: string;
  accentColor?: PromoAccentColor;
  targetAudience: PromoAudience;
  startDate?: number | string;
  expiresAt?: number | string;
  clickCount?: number;
  imageUrl?: string;
  imageAlt?: string;
}

export interface LotHeaderBannerConfig {
  enabled: boolean;
  badgeText?: string;
  text: string;
  ctaText?: string;
  ctaAction?: PromoCtaAction;
  ctaUrl?: string;
  targetAudience: PromoAudience;
  startDate?: number | string;
  expiresAt?: number | string;
  clickCount?: number;
}

export interface PlatformPromoSettings {
  enabled: boolean;
  cards: PromoCardConfig[];
  lotHeaderBanner: LotHeaderBannerConfig;
}
```

### 2.11 `promo_analytics` Collection Schema

Path: `promo_analytics/{promoId}`
Provides a decoupled guest telemetry store capturing atomic click engagement without modifying admin-restricted `settings/promotions` configuration:
```typescript
export interface PromoAnalyticsRecord {
  clickCount: number;      // Atomic incremented counter via FieldValue.increment(1)
  lastClickedAt: number;   // Epoch timestamp ms of most recent visitor interaction
  isBanner?: boolean;      // True when event originates from lot_header_banner
}
```

---

## 3. Real-Time Anti-Sniping Engine

### 3.1 The Rule
If a qualifying bid is submitted when the auction countdown timer has less than **2 minutes (120 seconds)** remaining, the auction end time (`endTime`) is automatically extended by an additional **2 minutes**.

### 3.2 Algorithmic Execution
```typescript
export async function placeBidWithAntiSnipe(auctionId: string, bidAmount: number, bidder: BidderProfile) {
  const auctionRef = doc(db, 'auctions', auctionId);
  
  await runTransaction(db, async (transaction) => {
    const auctionDoc = await transaction.get(auctionRef);
    if (!auctionDoc.exists()) throw new Error("Auction not found");
    
    const auction = auctionDoc.data() as Auction;
    const now = Date.now();
    
    if (now >= auction.endTime) throw new Error("Auction has closed");
    if (bidAmount < auction.currentBid + auction.minimumIncrement) {
      throw new Error(`Minimum bid increment is $${auction.minimumIncrement} CAD`);
    }
    
    let newEndTime = auction.endTime;
    let antiSnipeTriggered = false;
    const timeRemainingMs = auction.endTime - now;
    
    // If under 2 minutes (120,000 ms), auto-extend by 2 minutes
    if (timeRemainingMs < 120 * 1000) {
      newEndTime = now + 120 * 1000;
      antiSnipeTriggered = true;
    }
    
    // Create Bid Record
    const newBidRef = doc(collection(db, `auctions/${auctionId}/bids`));
    transaction.set(newBidRef, {
      id: newBidRef.id,
      auctionId,
      amount: bidAmount,
      bidderId: bidder.uid,
      bidderHandle: bidder.displayName,
      timestamp: now,
      antiSnipeTriggered
    });
    
    // Update Auction Record Atomically
    transaction.update(auctionRef, {
      currentBid: bidAmount,
      bidCount: increment(1),
      isReserveMet: bidAmount >= auction.reserveAmount,
      endTime: newEndTime,
      status: 'ending_soon'
    });
  });
}
```

---

## 4. Canadian Financial Standard & Odometer Compliance

1. **Currency**: All financial calculations, reserves, minimum bids, increments, and winner statements are standard **CAD ($)**.
2. **Odometer / Distance Units**:
   - Default: `km` (Kilometers) to align with Transport Canada and Canadian provincial licensing requirements (ICBC, Alberta Registries, ServiceOntario).
   - Toggle: Allows switching between `km` and `mi` on the fly in Section 1 of the Owner Control Center.
   - Clean display logic: Automatically appends `km` or `mi` if omitted in the raw numeric input.

---

## 5. Media & Asset Pipeline

### 5.1 Cloud Storage Asset Pipeline & 900KB Document Size Guard
1. **Firebase Cloud Storage HTTPS Pipeline**:
   - All uploaded vehicle photos, hero banners, and inspection documents are streamed directly to Firebase Cloud Storage (`gs://wailtail`) via `uploadImageToStorage()`.
   - Cloud Storage returns public HTTPS download URLs (`https://firebasestorage.googleapis.com/...`), taking ~120 bytes of text per photo inside Firestore documents.
   - Eliminates Firestore's 1MB per-document payload ceiling, allowing listings to host 100+ high-resolution vehicle photos.
2. **Client-Side Micro-Compression Engine (`compressImageDataUrl`)**:
   - Prior to bucket dispatch, raw image Data URLs undergo client-side HTML5 canvas micro-compression, scaling down excessively oversized imagery (max dimension 1200px, 75% quality JPEG).
   - Serves as an essential fallback mechanism if non-storage or cached payloads are passed through form state.
3. **900KB Document Payload Size Cap (`saveMediaConfig`)**:
   - `saveMediaConfig()` in `auctionService.ts` executes rigorous pre-flight payload sanitization and size enforcement.
   - Sets a strict internal threshold of 900KB (below Firestore's hard 1,048,576 byte limit) for serialized documents, guaranteeing zero `FirebaseError: Payload exceeds maximum allowed size` exceptions.
4. **Hero Carousel & Root Auction Lead Hero Sync**:
   - Ordered image array rendered in Bring-a-Trailer style carousel format with drag-and-drop reordering (`onDragStart`, `onDrop`) and positional nudges (`← Left` / `Right →`).
   - Automatically mirrors `leadHeroImage` to the root `auctions/{id}` document during master save operations to power catalog card thumbnails.
5. **Categorized Photo Grid & Documents**:
   - 6 categorized sub-galleries: `exterior`, `interior`, `engine`, `underbody`, `docs`, `documentation`.
   - Native support for PDF vehicle inspection reports with high-contrast document badges and full-screen lightbox inspection.

### 5.2 Serverless YouTube Video Ingestion Pipeline
1. **Vercel Serverless Proxy Endpoint (`api/youtube-playlist.ts`)**:
   - Bypasses browser cross-origin resource sharing (CORS) restrictions that block client-side requests to YouTube feed endpoints.
   - Exposes `/api/youtube-playlist?list={playlistId}` returning sanitized JSON chapter data with permissive CORS headers (`Access-Control-Allow-Origin: *`).
2. **Server-Side RSS XML Feed Ingestion**:
   - Serverless handler extracts valid YouTube playlist IDs (regex matching `[?&]list=([a-zA-Z0-9_-]+)` or direct playlist tokens).
   - Fetches the public YouTube channel/playlist Atom RSS feed (`https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`).
   - Parses `<entry>` nodes server-side with XML entity decoding (`decodeXmlEntities`), extracting `<yt:videoId>`, `<title>`, `<media:description>`, and high-res `<media:thumbnail>`.
3. **1-Click Video Chapter Auto-Import**:
   - Integrated into `auctionService.ts` (`fetchYouTubePlaylistVideos()`), `ListingEditorWorkspace.tsx`, and `AdminPanelModal.tsx`.
   - Administrators or sellers paste a playlist URL, click "Auto-Import Playlist Videos", and instantly populate the vehicle's driving chapter timeline with titles, descriptions, embed URLs, and thumbnails.
4. **Complete Eradication of Video Duration Metadata**:
   - YouTube feed and oEmbed APIs do not reliably provide runtime duration without heavyweight YouTube Data API v3 OAuth keys.
   - All legacy duration input fields, metadata extraction parsing, and timestamp duration badges (`00:00`) have been completely eradicated across workspace editors (`ListingEditorWorkspace.tsx`, `AdminPanelModal.tsx`) and public components (`YouTubePlaylistSection.tsx`). Focus is kept strictly on video title, description, and high-resolution thumbnail preview.

### 5.3 Serverless Email Dispatcher (`/api/send-consignment-email`)
1. **Endpoint Architecture & Multi-Template Proxy Pipeline**:
   - Vercel Serverless Function hosted at `/api/send-consignment-email` (`api/send-consignment-email.ts`).
   - Supports a multi-mode payload interface via `type: 'consignment' | 'inquiry' | 'consignment_receipt' | 'welcome_bidder'` (defaulting to `'consignment'` if unspecified):
     - **Consignment Intake (`type: 'consignment'`)**: Handles incoming JSON payloads from the public consignment modal (`ConsignmentModal.tsx`) and dispatches structured HTML notification emails directly to curation administrators.
     - **Private Buyer Inquiries (`type: 'inquiry'`)**: Handles private direct inquiries dispatched from `ContactSellerModal.tsx`, transmitting prospective buyer messages and seller inquiry details directly to administrators/sellers with zero client-side credential exposure.
     - **Seller Consignment Receipt (`type: 'consignment_receipt'`)**: Dispatches a dual-branded HTML acknowledgment email directly to the consignor/seller applicant confirming receipt of their vehicle submission, summarizing vehicle particulars, detailing curation review timelines (1–2 business days), and linking to their member dashboard.
     - **New Verified Bidder Welcome (`type: 'welcome_bidder'`)**: Dispatches a dual-branded HTML onboarding email to newly verified bidders celebrating their registration, presenting platform bidding guidelines, highlighting zero buyer fees, and providing 1-click exploration of live auctions.
   - Integrates with the **Resend API** as primary mail provider (supporting direct HTTP fetch fallback if the SDK is unavailable), with built-in failover to **SendGrid** and a development mock logger when keys are absent.
2. **Environment Variables**:
   - `RESEND_API_KEY`: Secret API token for Resend dispatch (`https://api.resend.com/emails`).
   - `ADMIN_NOTIFICATION_EMAIL` / `ADMIN_EMAIL` / `WAILTAIL_ADMIN_EMAIL`: Destination recipient inbox for new consignment and inquiry submissions (defaults to `contact@wailtail.com` if omitted).
   - `RESEND_FROM_EMAIL`: Authorized sender address (e.g. `Wailtail Curation <consignments@wailtail.com>`).
   - `SENDGRID_API_KEY` / `SENDGRID_FROM_EMAIL`: Fallback mailer configuration.
3. **Structured HTML Digest & Branded Templates**:
   - **Consignment Application Digest (`type: 'consignment'`)**:
     - Compiles vehicle taxonomy parameters (Year, Make, Model, Generation/Chassis), VIN, Mileage, Transmission, Reserve Expectation, and structured location fields (`locationCity`, `locationProvince`, `locationCountry`).
     - Appends applicant contact info and private condition notes.
     - Embeds visual badge indicators differentiating registered members (`REGISTERED (SELLER)` / `REGISTERED (BIDDER)` in emerald green) from guest inquiries (`GUEST / UNREGISTERED` in amber).
     - **Actionable 1-Click Triage Deep-Links**:
       - Integrates styled, email-safe CTA table buttons linking directly to the administrative portal with query parameters:
         - **Approve CTA**: `https://www.wailtail.com/admin?tab=consignments&id=${appId}&action=approve`
         - **Reject CTA**: `https://www.wailtail.com/admin?tab=consignments&id=${appId}&action=reject`
       - Enables platform administrators to triage incoming consignments straight from their inbox on mobile or desktop devices.
   - **Private Buyer Inquiry HTML Table (`type: 'inquiry'`)**:
     - Subject line: `[Private Inquiry] ${inquiryTopic} — ${targetVehicleTitle} (${inquiryName})`.
     - High-contrast structured HTML table containing:
       - **Inquirer Name**: Prospect's full name.
       - **Email**: Active mailto hyperlink.
       - **Phone**: Formatted phone number or `Not provided`.
       - **Inquiry Topic**: Subject topic (e.g., Vehicle History, Inspection, Financing, Reserve, Shipping).
       - **Target Vehicle Title**: Vehicle title/lot referenced by the inquiry.
       - **Inquiry Message**: Pre-formatted multiline inquiry text with line-height styling.
   - **Seller Consignment Receipt (`type: 'consignment_receipt'`)**:
     - Subject line: `Consignment Application Received: ${year} ${make} ${model} — Wailtail Auctions`.
     - Dual-branded editorial HTML layout featuring dark header banner, vehicle summary card (Year, Make, Model, VIN, Mileage, Transmission, Location, Reserve Expectation), curation review expectation statement, and a direct CTA button to the Wailtail Member Dashboard (`/`).
   - **Verified Bidder Welcome Email (`type: 'welcome_bidder'`)**:
     - Subject line: `Welcome to Wailtail — Your Bidding Privileges Are Active`.
     - Dual-branded editorial HTML layout welcoming the user (`${displayName}`), outlining core platform tenets (Transparent CAD Bidding, 2-Minute Anti-Sniping Soft Closes, Zero Buyer Fees, Direct Settlement), and featuring a high-contrast CTA button linking directly to the live vehicle catalog (`/catalog`).
     - **Deferred Dispatch Pipeline**: `sendWelcomeBidderEmail()` is suppressed during raw account registration and dispatches strictly upon confirmed email verification (`currentUser.emailVerified || data.isEmailVerified`) or staff manual verification override in `/admin` (`setUserEmailVerified`). Dispatches are deduplicated via persistent `localStorage` sentinel keys (`wailtail_welcome_sent_${uid}`).

### 5.4 Serverless Admin User Deletion (`/api/admin-delete-user.ts`)
1. **Endpoint Architecture & Service Account Credentials**:
   - Hosted as a dedicated Vercel Serverless Function at `/api/admin-delete-user` (`api/admin-delete-user.ts`).
   - Requires an authenticated administrative caller context in the POST payload: `{ uid: string, adminUid: string }`.
   - Protects against accidental self-deletion by blocking requests where `cleanUid === cleanAdminUid` (HTTP 400).
2. **Static Firebase Admin Import & ESM Interop Resolution**:
   - Utilizes static module import for `firebase-admin`:
     ```typescript
     import * as admin from 'firebase-admin';
     const firebaseAdmin = (admin as any).default || admin;
     ```
   - Resolves CommonJS/ESM interop bundling discrepancies across Vercel Node runtime environments, guaranteeing stable access to `initializeApp`, `credential.cert`, and `auth().deleteUser`.
3. **Private Key Newline Unescaping**:
   - Normalizes service account private keys from `FIREBASE_SERVICE_ACCOUNT_KEY` or `FIREBASE_PRIVATE_KEY` by unescaping literal newline sequences (`replace(/\\n/g, '\n')`).
   - Completely avoids ASN.1/OpenSSL parse failures during credential instantiation.
4. **Atomic Identity Purging Across Auth and Firestore**:
   - Executes `await firebaseAdmin.auth().deleteUser(cleanUid)` on the serverless edge.
   - Gracefully intercepts `auth/user-not-found` exceptions as non-fatal successes (`{ success: true, note: 'user-not-found' }`), allowing deletion workflows to proceed if Auth identity is already absent.
   - Orchestrated client-side by `deleteUserRecord(userId, adminUid)` in `src/services/auctionService.ts`, which calls `/api/admin-delete-user` before committing an atomic Firestore batch purge wiping corresponding documents across `users/{uid}` and `bidders/{uid}` collections.

### 5.5 Mobile Viewport Hero & Gallery Architecture

#### 1. Hero Lightbox Dataset Isolation (`HeroMediaCarousel.tsx`)
* **Strict Scoping to `heroImages`**: Scoped hero lightbox state strictly to `heroImages` (`validImages` / `safeImages`), fixing index mismatch bugs where clicking hero carousel slides triggered items from the master categorized photo archive.
* **Independent Lightbox State Machine**: Hero lightbox interactions are encapsulated within `HeroMediaCarousel.tsx` using dedicated local state (`isLightboxOpen`, `lightboxIndex`, `isLightboxZoomed`). The carousel operates solely over non-empty hero photos, completely isolating hero presentation from the categorized catalog archive.
* **Mobile Gesture & Keyboard Controls**: Includes touch swipe listener hooks (`onTouchStart`, `onTouchEnd`) with 50px delta thresholds, keyboard event listeners (`Escape` for dismiss, `ArrowLeft` / `ArrowRight` for cycling), and double-tap zoom toggles (`ZoomIn` / `ZoomOut`).

#### 2. Mobile Hero Overlay Cleanup & CTA Relocation
* **Unobstructed Viewport**: Cleared mobile hero overlays that previously obscured vehicle photography on compact screens:
  * "Fullscreen Lightbox" button hidden on mobile via `hidden sm:flex`.
  * Bottom photo count indicator bar suppressed on mobile via `hidden sm:block`.
* **Ergonomic CTA Placement**: The mobile "Watch Video Playlist" CTA button is relocated beneath the horizontal hero thumbnail strip (`sm:hidden flex items-center justify-center`), ensuring clean thumb-reach ergonomics and preventing tap collisions with hero navigation arrows.

#### 3. Mobile Photo Gallery Truncation & Lightbox Swiping (`PhotoGalleryGrid.tsx`)
* **8-Photo Initial Grid (2x4)**: To eliminate mobile scroll fatigue and optimize rendering performance for lots with 100+ images, mobile viewports truncate the thumbnail display to an initial 8 items (`filteredImages.slice(0, 8)`).
* **`isMobileExpanded` Toggle Engine**: Controlled via `isMobileExpanded` state. Renders a full-width high-contrast toggle button ("Show All [X] Photos" with grid icon / "Collapse Gallery") below the grid on mobile (`sm:hidden`).
* **Unbroken Full-Archive Lightbox Navigation**: Truncation applies strictly to the initial grid view. When any thumbnail is clicked, the full lightbox modal launches with access to the complete filtered image array (`validImages.length`). Mobile users can swipe through all vehicle photos in full resolution without needing to expand the thumbnail grid first.

---

## 6. Owner & Consignor Workflows

### 6.1 Owner Control Center (`AdminPanelModal.tsx`)
- **Quick Anchors**: Instant jump bar for 7 sections:
  1. Vehicle Identity & Header Specs (Title, VIN, Odometer with km/mi toggle, Engine, Gearbox, Exterior, Interior/Cabin, Title status, Highlights badge)
  2. Platform Branding (Site logo, Name, Tagline)
  3. Technical Specifications Table (Single-Source Mirror from Section 1 + Custom Specification rows)
  4. Curated Showcase Chapters (Editorial sub-stories with rich media)
  5. Hero Carousel & Full Photo Gallery (Drag-and-drop reordering, inline category tags, PDF document inspection uploads)
  6. Embedded Video Playlist & Driving Chapters
  7. Auction Dates & Financial Rules (CAD reserve, high-contrast quick dates: `Set to Now`, `+3 Days`, `+7 Days`, 2-min anti-sniping simulation)
- **Single-Source Spec Synchronization**:
  - Automatically mirrors the 8 core vehicle specifications (VIN, Odometer, Engine, Transmission, Exterior Color, Interior, Title Status, Location) from Section 1 directly into Section 3 without requiring manual double-entry.
  - Section 3 allows appending unlimited custom rows (e.g., Compression, Wheels, Exhaust) with Up/Down positional reordering and deletion.
  - Automatically compiles both primary and custom specifications into `overviewSpecs` for persistence to Firestore and public "Vehicle Highlights" rendering.
- **Draft Creation & Reset Protection**:
  - "Create Blank Listing" button triggers an in-app confirmation dialog modal ("Reset editor to a blank listing draft? Unsaved changes will be lost.").
  - Upon confirmation, resets all state fields across all sections to clean, empty default values with standardized Canadian CAD financial defaults ($1,000 starting bid, $250 minimum increment, $0 reserve, upcoming status, 7-day duration) and displays a success toast notification.
- **Gallery & Document Management**:
  - Prominent "+ Upload Photos & Inspection Documents" action with batch file ingestion.
  - Photo cards feature responsive aspect ratios (`aspect-[4/3]`), top overlay with non-clipping category selectors, and dedicated high-contrast red delete action buttons.

### 6.2 Dedicated Listing Authoring Workspace (`/dashboard/listings/[id]/edit`)
- **Multi-Car Inventory Architecture**:
  - Full support for multi-car inventory catalogs in Firestore (`auctions` collection and per-lot `media-${auctionId}` settings).
  - **"Select Vehicle Listing" Dropdown**: Located in the workspace header bar, allowing administrators to seamlessly switch between active and draft vehicle lots with automatic form state synchronization.
  - **Zero-Lot Database Support & Snapshot Rules**:
    - Snapshot listeners in `App.tsx` and `AdminPanelModal.tsx` (`subscribeToAllAuctions`) are configured to support empty states (`list || []`), removing legacy length guards to allow clean operation on a pristine database.
    - All catalog views render the actual database state without forced ternary fallbacks.
  - **"+ New Listing" Workflow**: Modal prompt requesting Listing Title / Vehicle Lot Name; atomically provisions a new vehicle document in Firestore (`createNewListing`) with clean placeholders and default Canadian CAD financials ($1,000 start, $250 increment, 7-day duration) without overwriting existing listings.
  - **Optimistic State Hydration**: Immediately appends new lot to local state upon creation to ensure instantaneous UI feedback while bridging Firestore synchronization latency.
- **Full-Page Split-Screen Route & View Modes**:
  - Dedicated authoring workspace (`ListingEditorWorkspace.tsx`), offering 3 layout view modes:
    1. **Split Mode (Default)**: 60/40 reactive layout with left-pane form authoring and right-pane live public preview.
    2. **Edit Form Mode**: Expanded full-width layout (`w-full max-w-6xl mx-auto`) for focused content creation.
    3. **Preview Mode**: Dedicated full-screen live public preview with device toggles.
- **Sticky Vertical Progress Stepper**: Left-hand navigation tracking completion status across all 7 listing sections with live visual badges (`Complete`, `In Progress`, `Pending`), scroll anchoring, and sticky top pinning (`sticky top-6 self-start max-h-[calc(100vh-3rem)] overflow-y-auto`).
- **Responsive Preview Viewport**: Toggle between full Desktop mode and 390px Mobile simulated phone container with live state hydration.
- **100% Feature Parity Across All 7 Sections**:
  - **Section 1 (Vehicle Identity & 9-Row Form Layout)**:
    - **9-Row Form Hierarchy**:
      - **Row 1 (Top Row)**: 4-column responsive grid featuring the 3-tier dependent vehicle taxonomy pipeline: **Year** select (1930–2026), **Make** dropdown, **Model** dropdown, and **Generation / Chassis Code** dropdown (with dynamic custom input fallbacks).
      - **Row 2**: Primary Listing Title input equipped with an `"Auto Generate from Year / Make / Model / Gen"` helper trigger.
      - **Row 3**: Subtitle / Highlights Bar input for editorial headline summaries (e.g. `3.0L Flat-Six • 5-Speed 915 • Guards Red (027)`).
      - **Row 4**: 2-column grid featuring Vehicle Identification Number (VIN) uppercase text input and Odometer reading paired with an interactive `km` / `mi` distance unit toggle.
      - **Row 5**: 2-column grid for Engine specification and standardized Drivetrain / Gearbox dropdown with custom fallback entry.
      - **Row 6**: 2-column grid for Exterior finish and Interior / Cabin specifications.
      - **Row 7**: Standardized Title & Registration Status dropdown with custom fallback entry.
      - **Row 8**: Structured 3-field vehicle location panel (City, Province / State, and Country).
      - **Row 9 (Bottom Row)**: 2-column grid featuring Seller / Consignor name and the **Highlights Tag Badge** input.
    - **`formatHighlightsBadge` Auto-Sync & `isBadgeOverridden` Manual Override Protection**:
      - The Highlights Tag Badge displays the prominent badge rendered in the public Vehicle Highlights sidebar (e.g. `"1978 Porsche 911 930"`).
      - When the user selects or updates Year, Make, Model, or Generation in Row 1, `formatHighlightsBadge(year, make, model, generation)` dynamically computes the badge label.
      - If the user manually customizes the badge field, `isBadgeOverridden` is immediately flagged `true`, safeguarding custom text from being overwritten by future taxonomy adjustments. If the field is subsequently cleared or reset to match the auto-generated string, `isBadgeOverridden` returns to `false`.
  - **Section 2 (Overview Narrative)**: Editable heading, markdown/prose multiline text area, and featured overview image with local upload, gallery picker modal, or URL entry with lightbox preview.
  - **Section 3 (Technical Specifications)**: Automatic real-time synchronization from Section 1 into Section 3 table and public highlights card, with support for appending, reordering, and deleting custom specification rows.
  - **Section 4 (Showcase Chapters)**: Narrative chapter cards with photo uploader (file upload, gallery modal picker, manual URL), multiline checkmark bullet highlights, dynamic technical spec key-value pills, and chapter reordering/deletion.
  - **Section 5 (Hero Carousel & Full Photo Gallery)**: Drag-and-drop and positional hero carousel reordering (`← Left` / `Right →`) with `★ Lead Hero` indicator; categorized gallery supporting exterior, interior, engine, underbody, and PDF inspection documents with non-clipping category selectors and high-visibility delete buttons.
  - **Section 6 (Videos & Driving Chapters)**: 1-click YouTube playlist video chapter ingestion via serverless proxy (`api/youtube-playlist.ts`), video metadata auto-fetching, driving chapter timeline cards with live thumbnail previews, and complete eradication of video duration metadata.
  - **Section 7 (Auction Financials & Schedule)**: Canadian Dollar (`CAD $`) financial ledger (starting bid, reserve, minimum increment), lifecycle status dropdown, interactive native datetime pickers with calendar trigger icons and native `.showPicker()` modal invocation styled with `[color-scheme:dark]`, and "Simulate Final 2 Minutes" Anti-Sniping test button.
- **Full Public Preview Parity**:
  - Live public header with dynamic countdown calculated via `formatAuctionCountdown`, starting/high bid, reserve status pill, and key header specs.
  - Interactive `HeroMediaCarousel` with image navigation and lightbox triggers.
  - Section 2 & 3 Overview Narrative and synchronized "Vehicle Highlights" sidebar card with Zero Buyer Fees banner and Consignor Private Inquiry action.
  - Section 4 `InlineShowcaseSection` with photo lightboxes and highlight lists.
  - Section 6 `YouTubePlaylistSection` with video embed and chapter selectors.
  - Section 5 `PhotoGalleryGrid` with categorized filtering and full-screen lightbox modal.
  - Section 7 Financials & Scheduling Summary Card detailing soft-close rules and auction dates.
- **JSON Import / Export (`ListingDraftSchema`)**:
  - Standardized `ListingDraftSchema` interface capturing Sections 1–4 and 7 in clean, standardized JSON format:
    ```typescript
    export interface ListingDraftSchema {
      // Section 1: Vehicle Identity & Header Specs
      title: string;
      subtitle: string;
      year: number | string;
      make: string;
      model: string;
      generation?: string; // Optional chassis code / generation
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
      specifications: Array<{ label: string; value: string }>;
      
      // Section 4: Showcase Chapters 01–04
      showcaseChapters: Array<{
        category: ShowcaseChapterCategory;
        title: string;
        subtitle: string;
        narrative: string;
        photoUrl: string;
        photoCaption: string;
        highlights: string[];
        specCards: Array<{ key: string; value: string; isCustomKey: boolean }>;
      }>;
      
      // Section 7: Auction Financials & Schedule
      financials: {
        startingBid: number;
        minimumIncrement: number;
        reserveAmount: number;
        durationDays: number;
      };
    }
    ```
  - "Import JSON" modal with syntax validation, schema key checks, and atomic state hydration across all sections.
  - "Export JSON" action copying active listing state directly to clipboard as formatted JSON.

### 6.3 Full-Page Admin Operations Portal (`/admin` via `AdminPortalPage.tsx`)
- **Dedicated Route & Access Control**:
  - Full-screen administrative command center gated strictly to authenticated accounts holding the `ADMIN` role (`userProfile?.role?.toUpperCase() === 'ADMIN'`).
  - Unauthorized visitors and non-admin users are automatically redirected to the root catalog route (`/`) with an alert notification.
  - Implements session authentication loading guards in `App.tsx` (`authLoading`) to prevent accidental redirect flashes during browser refreshes.
- **5 Command Suites & Management Tabs**:
  - **1. Member Directory Tab** (`bidders` — Member Directory Management): Server-assisted paginated search (`fetchPaginatedBidders`) querying across `users` with client-side query filtering by display name, email, and UID. Configurable page limits with previous/next pagination controls. Includes a role filter dropdown (`ALL`, `ADMIN`, `SELLER`, `BIDDER`) for refined directory segmentation.
    - **Expandable Member Bid Ledger**: Click-to-expand bid history accordion displaying all historical bids placed by the user, breakdown counters for active vs. retracted bids, and an inline administrative "Retract" moderation button.
  - **2. Consignment Applications Tab** (`consignments`): Server-assisted paginated search (`fetchPaginatedConsignments`) querying `consignment_applications` with text filtering across applicant name, email, phone, make, model, and status filter pills (`all`, `pending`, `approved`, `declined`).
  - **3. Vehicle Inventory & Lots Tab** (`inventory` — 5th Admin Tab): Comprehensive full-width vehicle inventory management suite displaying active catalog lots, editable vehicle specifications, and status lifecycles.
    - Status filtering pills: `All`, `Draft`, `Preview`, `Upcoming`, `Live`, and `Ended`.
    - Real-time lot search filtering across make, model, VIN, and title.
    - Server-assisted client pagination (configurable page size with previous/next navigation).
    - Row-level controls: quick status dropdown switcher, live CAD high bid tracking, direct authoring workspace launch links (`/dashboard/listings/${id}/edit`), and single-lot deletion triggers.
  - **4. Live Bids Telemetry Ledger Tab** (`ledger`): Real-time streaming audit trail of all placed bids with bidder handles, lot titles, timestamps, and currency amounts. Includes active/retracted summary pill counts, strike-through formatting on retracted bids, hoverable audit popovers displaying retraction reasons/timestamps/moderators, and administrative retraction actions.
  - **5. Platform Branding Tab** (`branding`): Global platform identity configuration for site logo, name, and tagline alongside the full-featured **Promotional & Launch Campaign Manager** controlling dynamic promo cards and direct-lot banners with master switches, real-time analytics telemetry, image asset uploading, and CTA action routing.
- **Option B Administrative Soft Bid Retractions (`retractBid` in `auctionService.ts`)**:
  - **Permanent Audit Trail Preservation**: Bids are never hard-deleted from Firestore. Retracted bids are marked with `status: 'retracted'`, `retractedAt: timestamp`, `retractionReason: string`, `retractedBy: adminUid`, and `retractedByName: string`.
  - **Atomic Telemetry Recalculation**: Executed within a Firestore transaction, `retractBid()` re-evaluates all remaining active bids on the auction (filtering out both the target bid and prior retracted bids), recalculating `currentBid`, `bidCount`, `highBidder`, and reserve met status in a single atomic transaction.
  - **Mandatory Reason Prompt & Modal Workflow**: Administrative retraction modal requires curation staff to submit an explicit justification (e.g., bidder typo, unverified funds, seller mutual agreement) before executing the transaction, with immediate state reflection across the portal.
  - **Human-Readable Admin Identity Resolution**: Moderator display names (`retractedByName`) are captured during retraction. Dynamic fallback resolution via `getAdminIdentifier()` in `AdminPortalPage.tsx` maps raw UIDs to human-readable names using loaded user rosters or active session state for transparent audit presentation.
  - **Orphaned Bid Moderation Fallback**: In scenarios where a bid's parent vehicle lot was previously deleted or unlinked, the interface tags the record with an amber `ORPHANED BID (LOT DELETED)` badge and allows administrators to safely soft-retract the orphaned bid document without throwing missing parent lot errors.
- **Consignment Intake Email Deep-Links & 1-Click Triage (`useEffect`)**:
  - `AdminPortalPage.tsx` listens for URL query parameters on initial mount:
    `https://www.wailtail.com/admin?tab=consignments&id=${appId}&action=approve|reject`
  - When detected, the component automatically:
    1. Switches `activeTab` to `'consignments'`.
    2. Fetches the target consignment application via `getConsignmentApplication(targetId)`.
    3. Resets status filters to `ALL`, sets the search query to `targetId`, and scrolls/highlights the target record.
    4. Prepends the fetched application to local state if missing from the paginated page.
    5. Automatically opens the respective confirmation dialog modal (`confirmApproveApp` or `confirmRejectApp`).
    6. Cleanses URL query parameters (`clearUrlParams()`) via `window.history.replaceState` to prevent repeated triggers on page refresh.
- **Multi-Select Bulk Action Engine**:
  - Checkbox selection engine implemented across Consignments and Vehicle Inventory tabs with "Select Page" / "Select All" toggles.
  - Floating action toolbar (`aside` fixed bottom dock) displaying total selected items and contextual batch triggers:
    - **Consignments Toolbar**: Batch Mark Reviewed, Batch Mark Approved, Batch Mark Rejected, Batch Delete Applications.
    - **Inventory Lots Toolbar**: Batch Set Live, Batch Set Upcoming, Batch Set Ended, Batch Delete Lots.
  - All bulk mutations are chunked safely into 150-item batches (safely below Firestore's 500 operations batch limit) to ensure transactional reliability and prevent payload limit errors (`batchUpdateConsignmentStatus`, `batchDeleteConsignments`, `batchUpdateAuctionStatus`, `batchDeleteAuctions`).
- **Cascading Deletion Controls (`auctionService.ts`)**:
  - Prevents orphaned records across dual collections (`auctions` and `consignment_applications` / `consignments`):
    - `deleteListing(auctionId, cascadeDeleteConsignment)`: Permanently deletes the vehicle lot from `auctions`, its settings document (`settings/media-${id}`), child media subcollection (`auctions/{id}/media`), and all child/root bid documents using safe 400-item chunked batch writes. When `cascadeDeleteConsignment` is enabled, queries and removes any associated consignment applications where `convertedAuctionId == auctionId`. Also flushes localized media cache keys from `localStorage`.
    - `deleteConsignmentApplication(appId, cascadeDeleteAuction)`: Deletes the record from `consignment_applications` and legacy `consignments`. When `cascadeDeleteAuction` is enabled, resolves `convertedAuctionId` and cascades deletion to the generated vehicle lot via `deleteListing(convertedAuctionId, false)`.
    - `batchDeleteConsignments(appIds, cascadeDeleteAuctions)`: Chunks application deletions in 150-item Firestore batches, resolving linked vehicle lots in 30-item batches for optional cascading lot purging.
    - `batchDeleteAuctions(auctionIds, cascadeDeleteConsignments)`: Chunks vehicle lot deletions in 400-item Firestore batches, resolving linked consignment applications for optional cascading cleanup.
- **Atomic Moderation Services Across Dual Collections**:
  - `resolveUserAndBidderDocuments(userId)`: Resolves document references across both `users/{userId}` and `bidders/{userId}` collections to guarantee atomic synchronization.
  - **3-Way Role Switching (`updateUserRole`)**: Allows administrators to toggle user accounts between `ADMIN`, `SELLER`, and `BIDDER` via an atomic Firestore `writeBatch`.
  - **Account Ban Toggling (`setUserBannedStatus` / `banOrRemoveBidder` / `unbanBidder`)**: Atomically updates `isBanned`, `bannedFromBidding`, `bannedAt`, and `banReason`.
  - **Email Verification Override (`setUserEmailVerified`)**: Permits manual staff verification overrides (`isEmailVerified: true/false`).
  - **Permanent Record Deletion (`deleteUserRecord`)**: Two-stage atomic purge that first calls `/api/admin-delete-user` to permanently remove the identity from Firebase Authentication via the Firebase Admin SDK, followed by atomic batch deletion purging documents from both `users/{userId}` and `bidders/{userId}` collections with resilient fallback for orphaned or non-existent auth records.
- **1-Click Consignment Approval Draft Conversion (`convertConsignmentToDraftListing`)**:
  - Administrators review pending vehicle consignment intake submissions and click `"Approve & Convert to Draft"`.
  - Atomically creates a fresh listing document in `auctions/{newAuctionId}` pre-populated with:
    - Vehicle identity: Year, Make, Model, Generation, VIN, Mileage, and Transmission.
    - Structured location fields: `locationCity`, `locationProvince`, `locationCountry`, and formatted `location`.
    - Editorial title auto-generated from taxonomy components.
    - Financial defaults: parsed reserve amount from `reserveExpectation` (or `$0 CAD` No Reserve), `$1,000 CAD` starting bid, `$250 CAD` minimum increment, and `status: 'upcoming'`.
  - Promotes the applicant to the `SELLER` role in Firestore (`updateUserRole(app.registeredUserId, 'SELLER')`).
  - Updates the consignment application record with `status: 'approved'` and `convertedAuctionId: newAuctionId`.
  - Immediately redirects the administrator into the authoring workspace at `/dashboard/listings/${newAuctionId}/edit`.

### 6.4 Unified User Account Activity Hub (`UserAccountHubModal.tsx`)
- **Global Accessible Activity Hub**:
  - Interactive modal dialog launched from the user avatar/profile trigger in `Navbar.tsx`.
  - Tabbed interface tailored dynamically to the active user's role:
    - **Active Bids & Won Lots Tab** (`bids`): Tracks real-time active bidding telemetry (`UserBidActivity`), displaying current high bid, user's maximum bid, total bid count, time remaining, and prominent status pills:
      - `★ LEADING`: User currently holds the winning high bid.
      - `⚠️ OUTBID`: Another bidder has surpassed the user's bid, with an instant "Increase Bid" action deep-linking to the lot.
    - **Saved Watchlist Tab** (`watchlist`):
      - Lists all saved vehicle lots persisted in the user's `watchlist?: string[]` array.
      - Each watch item presents a vehicle thumbnail card, real-time ending countdown, current high bid in CAD, reserve met status, and direct deep links to the single-lot view.
      - Features an inline remove action executing `toggleWatchlistLot(user.uid, lot.id)` for instant removal without modal reloading.
      - Provides an interactive zero-state card guiding bidders to explore the active catalog if their watchlist is empty.
    - **Won Auctions & 4-Stage Offline CAD Settlement Checklist** (`UserWonAuction`):
      - Renders closed auctions won by the user where the reserve was met.
      - Displays seller contact credentials (`sellerName`, `sellerEmail`, `sellerPhone`) with direct `mailto:` links.
      - Guides the winner through the standard 4-stage Canadian collector vehicle settlement process:
        1. **Bank Wire / Certified Draft**: Remit winning bid amount in CAD directly to seller or designated escrow within 3 business days with zero buyer fees.
        2. **Title & Bill of Sale**: Execute signed provincial transfer documentation and obtain ownership slip in buyer's name.
        3. **Transport / Collection**: Coordinate enclosed carrier dispatch or schedule local in-person pickup with seller.
        4. **VIN Check & Key Handover**: Verify physical VIN stamping upon vehicle release and complete transfer of keys, books, and service records.
    - **Seller Listings Tab** (`seller` / `listings`): Telemetry dashboard for consignors and sellers tracking draft, active, and completed inventory lots with current bids, bid count, and 1-click links to the listing authoring workspace.
    - **Consignments Tab** (`consignments`): Status tracker for submitted vehicle consignment applications (`PENDING`, `APPROVED`, `REVIEWED`, `REJECTED`) with reserve expectations, submission timestamps, and deep links to converted auction drafts.
- **Watchlist Core Service Integrations**:
  - `toggleWatchlistLot(userId: string, auctionId: string)`: Manages membership of `auctionId` in `users/{userId}.watchlist` (and `bidders/{userId}.watchlist`) using Firestore `arrayUnion` and `arrayRemove`, updating lot-level aggregated watch tallies.
  - `fetchUserWatchlist(userId: string)`: Resolves full `Auction` documents for all lot IDs in the user's profile watchlist array, populating the hub.
- **Real-Time User Profile Listener (`subscribeToUserProfile`)**:
  - In `App.tsx`, active user sessions are bound to Firestore via an `onSnapshot` listener on `users/{user.uid}`.
  - Role modifications (`ADMIN`, `SELLER`, `BIDDER`), ban flags, and verification updates enacted by administrators in `/admin` reflect instantaneously in user state and UI navigation without requiring a page reload or sign-out.

### 6.5 Decoupled Admin Operational Drawer (`AdminPanelModal.tsx`)
- Quick-drawer utility for secondary host operations:
  - **All Vehicle Listings Inventory Tab**: Unified inventory dashboard tracking all vehicle lots across the platform with lifecycle badges (`Live`, `Upcoming`, `Ended`), real-time search, and quick management actions (`Edit`, `Duplicate`, `Delete Lot`, `Set Active`).
  - **Standardized "+ New Listing" Modal**: Standardized creation trigger (`createNewListing`) prompting for vehicle lot name and initializing clean arrays and Canadian CAD defaults.
  - **Live Bids Telemetry Log**: Real-time audit trail of all placed bids with bidder identities, timestamps, and amounts.
  - **Member Directory / Member Directory Management**: Approval, verification, role assignment, and banning controls for all platform members.
  - **Winner Settlement**: Post-auction reserve and final settlement resolution.
  - **Platform Branding & Global Settings**: Logo, site name, and global auction defaults.
- Integrated "Open Listing Editor →" button allowing immediate navigation into the authoring workspace.

### 6.6 Public Q&A Thread & Official Seller / Admin Replies (`CommentSection.tsx`)
- High-visibility public discussion stream for vehicle inquiries, questions, and provenance notes.
- **Nested Official Responses**: Verified consignors/sellers and platform administrators can reply directly to any question via an inline reply trigger.
- Official replies render directly beneath the target question, decorated with prominent `SELLER` or `STAFF / ADMIN` badges, distinct border styling, and verified timestamps.

### 6.7 Public Multi-Car Catalog Grid (`VehicleCatalogGrid.tsx`) & Homepage Routing
- **Catalog as Default Homepage (`/`)**:
  - The multi-car Vehicle Auction Catalog view is configured as the primary root homepage route (`/`) as well as (`/catalog`).
  - Clicking the Wailtail header logo in `Navbar.tsx` from any route navigates directly to this catalog homepage.
  - Dedicated public auction detail route (`/auctions/[id]`) allows focused bidding and viewing on individual lots, with instant header logo return to the catalog inventory.
- **Dynamic Catalog Hero Image Resolution**:
  - `CatalogCard.tsx` / `AuctionCard.tsx` incorporates multi-tiered image resolution logic:
    `leadHeroImage` → `heroImages[0]` → `DEFAULT_MEDIA_CONFIG.heroImages[0]` → `localStorage` cache.
  - Prevents fallback to "Photo Gallery Pending" when hero images are present in Firestore or media configurations.
  - Features admin quick-edit button for immediate deep-linking to the authoring workspace.
- **Catalog Status Bucket Normalization (`isLive`, `isUpcoming`, `isEnded`)**:
  - Exported pure predicate helpers prevent lots with transitional or non-standard status tags from falling through the cracks:
    - `isLive(status)`: Evaluates to `true` for `'live'`, `'ending_soon'`, or `'active'`.
    - `isUpcoming(status)`: Evaluates to `true` for `'upcoming'`, `'preview'`, `'draft'`, or missing/null/undefined status tags (`!status`).
    - `isEnded(status)`: Evaluates to `true` for `'ended'`, `'sold'`, or `'reserve_not_met'`.
  - Guarantees 100% catalog lot accounting: newly created drafts, staged previews, and scheduled upcoming lots are cleanly bucketed under the "Upcoming" filter tab, ensuring zero lots are omitted from catalog counts or search indexing.
- **Dynamic Search & Filtering**:
  - Real-time search filtering across make, model, VIN, and location.
  - Category filter pills (`All Lots`, `Live`, `Upcoming`, `Ended`) with live lot counters synchronized with normalization predicates.
  - Rich vehicle cards featuring hero photo thumbnail, current/starting bid in CAD, reserve status pill, odometer, location, and deep link navigation to `/auctions/[id]`.

### 6.8 Seller Onboarding Flow & Consignment Intake (`ConsignmentModal.tsx`)
- **"Sell Your Vehicle" Header Action**:
  - Prominent amber call-to-action button in `Navbar.tsx` and catalog banner header.
  - Opens `ConsignmentModal.tsx` for seller intake inquiries.
- **3-Tier Vehicle Taxonomy & Custom Fallbacks**:
  - Standardized Year select (1930–2026), Make selector, Model selector, and Generation/Chassis Code selector backed by `vehicleTaxonomy.json`.
  - Integrated `TAXONOMY_OTHER_CUSTOM` fallback text inputs for unlisted makes, bespoke models, or rare coachbuilt variants.
- **3-Column Structured Location Panel**:
  - Clean separation into City (`locationCity`), Province / State (`locationProvince`), and Country (`locationCountry`) with automatic composite string formatting (`formattedLocation`).
- **Option A Registered Member Auto-Link Detection (`onBlur`)**:
  - When an applicant enters their email address and blurs the input, `checkUserAccountByEmail(email)` queries Firestore `users` to detect if the consignor is already a registered Wailtail member.
  - If recognized, a green notification banner surfaces displaying their member name and role (`REGISTERED BIDDER` or `REGISTERED SELLER`), auto-populating contact fields and linking `registeredUserId`, `isRegisteredUser: true`, and `registeredUserRole` to the consignment document.
- **Persistence & Serverless Notification**:
  - Inquiries are stored in the Firestore `consignment_applications` collection via `submitConsignmentApplication`.
  - Dispatches an asynchronous serverless email notification to `/api/send-consignment-email` alerting curation staff.
  - Direct transition action allows sellers/admins to jump straight into a fresh listing authoring workspace (`/dashboard/listings/new`).

### 6.9 Strict Fresh Listing Isolation Guarantees
- **Data Leak Prevention**:
  - `createNewListing` in `auctionService.ts` and `ListingEditorWorkspace.tsx` enforces strict initialization:
    - Text inputs: set to `""` (empty string) for non-main lots.
    - Media arrays (heroes, gallery images, showcase chapters, video chapters): set to `[]` (empty array).
    - Custom specifications: set to `[]` (empty array).
  - Eliminates legacy Porsche 911 narrative text, specs, and image URLs from leaking into newly created lots, allowing grey placeholder text to serve as guidance.

### 6.10 Consignor Private Inquiry (`ContactSellerModal.tsx`)
- Private buyer-to-seller communication modal accessible directly from the vehicle highlights sidebar.
- Form fields: Name, Email, Phone Number, Inquirer Status (Registered Bidder, Private Collector, General Buyer), and Inquiry Message.
- **Persistence & Serverless Dispatch Pipeline**:
  - Persists inquiries to Firestore `inquiries` collection via `submitSellerInquiry` / `submitInquiry` in `src/services/auctionService.ts`.
  - Dispatches an asynchronous serverless notification via `fetch('/api/send-consignment-email', { body: JSON.stringify({ type: 'inquiry', ... }) })`.
  - Generates a branded HTML table digest forwarding prospective buyer details to administrative and curation inboxes with zero client-side credential exposure.
  - Built-in error isolation ensures the inquiry dialog succeeds cleanly with user feedback even if email dispatch encounters network latency.

### 6.11 Lot-Level Action Controls (`AuctionHeader.tsx`)
- Contextual "Watch" and "Share" buttons relocated from the global navigation bar (`Navbar.tsx`) directly into the single-lot view header (`AuctionHeader.tsx`) alongside anti-snipe countdown timers and financial telemetry.
- **Interactive Watch Toggle ("★ Watch" / "★ Watching")**:
  - Real-time watch state (`isWatching`) synchronized with `userProfile.watchlist` array.
  - Clicking invokes `toggleWatchlistLot(user.uid, auction.id)`, updating Firestore `users/{uid}` and `bidders/{uid}` documents and syncing aggregate lot watch tallies via `toggleWatchAuction`.
  - Unauthenticated interactions trigger an informative toast directing visitors to log in or register.
  - High-contrast visual indicators: Amber solid background with ring highlight when active (`★ Watching`), slate bordered button when inactive (`★ Watch`).
- **Instant URL Clipboard Share ("🔗 Share")**:
  - Copies canonical auction URL (`window.location.href`) directly to clipboard via `navigator.clipboard.writeText()`.
  - Dispatches an instant high-visibility success toast notification (`Listing link copied to clipboard!`).

### 6.12 Global Navigation & User Profile Menu (`Navbar.tsx`)
- **User Profile Dropdown Positioning Repair**:
  - Replaced rigid fixed flex positioning with a dedicated `relative inline-block` wrapper ref (`userMenuRef`).
  - Dropdown menu is pinned with `absolute right-0 top-full mt-2 w-64 z-50` with high-contrast slate surfaces (`bg-slate-900 border border-slate-800 rounded-xl shadow-2xl`).
  - Completely resolves right-edge viewport clipping, vertical flex squishing, and overlapping with adjacent CTA buttons on smaller desktop and tablet screens.
  - Features outside-click listener (`handleClickOutside`) bound via React refs to guarantee clean teardown upon outside clicks or route navigation.

### 6.13 Promotional & Launch Campaign Manager (`AdminPortalPage.tsx`, `VehicleCatalogGrid.tsx`, `AuctionHeader.tsx`)

The platform integrates a dynamic promotional subsystem designed to spotlight launch promotions, seller incentives, early-access membership perks, and high-visibility CTAs:

1. **Centralized Campaign Control Suite (`AdminPortalPage.tsx` under Platform Branding)**:
   - **Master Platform Switches**:
     - Global platform switch (`PlatformPromoSettings.enabled`) allows administrators to immediately activate or deactivate all promotional cards and banners across the platform.
     - Individual lot header banner toggle (`lotHeaderBanner.enabled`) and card-level toggles (`card.enabled`) provide granular switch controls.
   - **Card Authoring & Lifecycle Management**:
     - Interactive card creator (`handleAddPromoCard`) generating structured campaign cards with unique IDs (`promo-${Date.now()}`).
     - Expandable card accordions with real-time headline previews, badge tags, copy textarea, accent color selection (`amber`, `emerald`, `purple`, `blue`), and card deletion triggers.
     - Positional controls and persistence via `savePromoSettings()`.
   - **Dynamic CTA Action Routing (`PromoCtaAction`)**:
     - `consignment_modal`: Seamlessly launches the seller consignment intake dialog (`ConsignmentModal.tsx`).
     - `auth_modal`: Launches the platform authentication modal (`AuthModal.tsx`) prompting registration or sign-in.
     - `contact_modal`: Opens the consignor direct communication dialog (`ContactSellerModal.tsx`).
     - `external_url`: Redirects visitors to external URLs or landing pages (`ctaUrl`) with target validation.
   - **Audience State Segmentation (`PromoAudience`)**:
     - Target audience filtering via `isPromoAudienceMatch(targetAudience, isAuthenticated)`:
       - `all`: Broadcast to every site visitor.
       - `guests_only`: Targeted strictly at unauthenticated visitors (e.g. registration drives, membership benefits).
       - `authenticated_only`: Visible only to authenticated bidders or consignors (e.g. VIP consignment discounts).
   - **Date Window Scheduling**:
     - Native datetime scheduling inputs (`startDate`, `expiresAt`) evaluated dynamically via `isPromoScheduleActive(startDate, expiresAt, now)`.
     - Supports pre-scheduled campaigns that activate and expire automatically without manual intervention.
   - **Promo Card Image Asset Uploader**:
     - Supports both direct image URLs (`card.imageUrl`) and local file uploads (`handlePromoImageUpload`).
     - Uploaded assets undergo client-side HTML5 canvas micro-compression (`compressImageDataUrl`) before streaming to Firebase Cloud Storage via `uploadImageToStorage(auctionId, compressed, 'promotions')`.
     - Displays responsive top media banners (`aspect-[16/9]`, `object-cover`) on catalog promo cards matching standard vehicle listings.

2. **Catalog Grid Card Injection (`VehicleCatalogGrid.tsx`)**:
   - **Low-Inventory Position Injection**: When catalog inventory contains 2 or fewer vehicles (`auctions.length <= 2`), the grid automatically injects active promotional cards (`promoCardsToInject`) into empty grid slots, maintaining a dense, editorial 3-column layout.
   - **Client Dismissal Tracking (`wailtail_dismissed_promos`)**:
     - Each injected card features an unobtrusive dismiss action (`X` button).
     - Dismissed promo IDs are saved to `localStorage` under `wailtail_dismissed_promos`, suppressing repeat impressions for that client.

3. **Direct-Lot Promotional Header Banners (`AuctionHeader.tsx`)**:
   - High-contrast banner rendered directly above vehicle titles on single-car lot pages (`/auctions/[id]`).
   - Specifically optimizes conversion for deep-linked direct traffic arriving from social channels and collector forums.
   - Features custom badges, copy, action CTAs, dismissal persistence (`LOT_HEADER_BANNER_ID`), schedule verification, and audience matching.

4. **Decoupled Guest Telemetry Engine (`promo_analytics`)**:
   - Telemetry execution (`recordPromoClick(promoId, isBanner)`) writes directly to independent documents in the `promo_analytics` collection using atomic Firestore `increment(1)` operations.
   - **Security Decoupling**: Solves permission errors (HTTP 403 Forbidden) for unauthenticated visitors by allowing public writes (`allow create, update: if true;`) to `promo_analytics`, while the root configuration `settings/promotions` remains locked strictly to administrators.
   - **Non-Blocking Telemetry Failover**: Wrapped in silent `try/catch` handlers to guarantee that analytics logging never degrades or blocks visitor navigation.
   - **Real-Time Staff Telemetry Feed**: `subscribeToPromoAnalytics` powers real-time click counter badges (`MousePointerClick`) in `AdminPortalPage.tsx`, displaying live interaction counts alongside each campaign asset.

---

## 7. Security Rules & Permissions

### 7.1 3-Way Role Hierarchy (`ADMIN`, `SELLER`, `BIDDER`) & Permissions Matrix

Wailtail implements a tri-role access control model defined in `src/types.ts` via `UserRole = 'ADMIN' | 'SELLER' | 'BIDDER'`:

| Platform Capability | Guest / Anonymous | BIDDER | SELLER | ADMIN |
| :--- | :---: | :---: | :---: | :---: |
| Browse Catalog & View Vehicle Lots (`/`, `/catalog`, `/auctions/[id]`) | ✅ | ✅ | ✅ | ✅ |
| Submit Consignment Inquiry (`ConsignmentModal.tsx`) | ✅ | ✅ (Auto-Linked) | ✅ (Auto-Linked) | ✅ (Auto-Linked) |
| Place Real-Time Anti-Snipe Bids | ❌ | ✅ (Unbanned) | ✅ (Unbanned) | ✅ |
| Watchlist Auctions & Receive High-Bid Alerts | ❌ | ✅ | ✅ | ✅ |
| Post Community Comments & Discussion Questions | ❌ | ✅ (`Verified Bidder`) | ✅ (`Seller`) | ✅ (`Staff / Admin`) |
| Reply with Official Verified Badges in Comments | ❌ | ❌ | ✅ (`SELLER`) | ✅ (`STAFF / ADMIN`) |
| Access User Activity Hub Modal (`UserAccountHubModal.tsx`) | ❌ | ✅ | ✅ | ✅ |
| View Won Lots & 4-Stage Offline CAD Settlement Checklist | ❌ | ✅ | ✅ | ✅ |
| Access Dedicated Listing Workspace (`/dashboard/listings/[id]/edit`) | ❌ | ❌ | ✅ | ✅ |
| Access Full-Page Operations Portal (`/admin`) | ❌ | ❌ | ❌ | ✅ |
| Paginated Member Directory & Consignment Search | ❌ | ❌ | ❌ | ✅ |
| Switch User Roles (`ADMIN` $\leftrightarrow$ `SELLER` $\leftrightarrow$ `BIDDER`) | ❌ | ❌ | ❌ | ✅ |
| Ban / Unban Bidders & Override Email Verification | ❌ | ❌ | ❌ | ✅ |
| Purge User Account & Auth Identity (`deleteUserRecord` / `/api/admin-delete-user`) | ❌ | ❌ | ❌ | ✅ |
| 1-Click Convert Consignment to Draft Listing | ❌ | ❌ | ❌ | ✅ |
| Purge All Listings / Bulk Reset Catalog | ❌ | ❌ | ❌ | ✅ |

### 7.2 Production Firestore Security Rules (`firestore.rules`)
```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper Functions
    function isAuthenticated() {
      return request.auth != null;
    }

    function isAdmin() {
      return isAuthenticated() && 
        request.auth.token.email != null && 
        (request.auth.token.email.lower() == 'jeremygoodmurphy@gmail.com' ||
         request.auth.token.email.lower() == 'jeremy@theinnovativegroup.ca');
    }

    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }

    // Auctions & Media Subcollections
    match /auctions/{auctionId} {
      allow read: if true;
      allow create, update, delete: if isAuthenticated();

      match /{document=**} {
        allow read: if true;
        allow create, update, delete: if isAuthenticated();
      }
    }

    // Bids & Bidding Telemetry
    match /bids/{bidId} {
      allow read: if true;
      allow create, update: if isAuthenticated();
      allow delete: if isAdmin();
    }

    // Comments & Community Q&A
    match /comments/{commentId} {
      allow read: if true;
      allow create, update: if isAuthenticated();
      allow delete: if isAdmin();
    }

    // User Accounts & Moderation Registry
    match /users/{userId} {
      allow read: if true;
      allow create: if isAuthenticated();
      allow update, delete: if isOwner(userId) || isAdmin();
    }

    match /bidders/{bidderId} {
      allow read: if true;
      allow create: if isAuthenticated();
      allow update, delete: if isOwner(bidderId) || isAdmin();
    }

    // Platform Settings & Media Configuration
    match /settings/promotions {
      allow read: if true;
      allow create, update, delete: if isAdmin();
    }

    // Promo Analytics & Click Telemetry
    match /promo_analytics/{promoId} {
      allow read: if true;
      allow create, update: if true;
    }

    match /settings/{settingId} {
      allow read: if true;
      allow write, create, update, delete: if isAuthenticated();
    }

    match /mediaConfig/{configId} {
      allow read: if true;
      allow write, create, update, delete: if isAuthenticated();
    }

    match /media/{docId} {
      allow read: if true;
      allow write, create, update, delete: if isAuthenticated();
    }

    // Intake Forms & Direct Communications
    match /consignment_applications/{appId} {
      allow create: if true;
      allow read, update, delete: if isAuthenticated();
    }

    match /consignments/{consignmentId} {
      allow create: if true;
      allow read, update, delete: if isAuthenticated();
    }

    match /inquiries/{inquiryId} {
      allow create: if true;
      allow read, update, delete: if isAuthenticated();
    }

    // Outbox Queues
    match /mail/{mailId} {
      allow create: if true;
      allow read, update, delete: if isAuthenticated();
    }

    match /emails/{emailId} {
      allow create: if true;
      allow read, update, delete: if isAuthenticated();
    }
  }
}
```

### 7.3 Firebase Cloud Storage Rules
```rules
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    allow read: if true;
    allow write, delete: if request.auth != null;
  }
}
```

### 7.4 Firebase CLI Deployment Workflow & Infrastructure
To ensure reproducible, zero-drift rule synchronization directly from developer terminals without console copy-pasting, the repository integrates native Firebase CLI deployment bindings:

1. **`firebase.json` Configuration**:
   Maps the Firestore rules target directly to the root source rules file bound to the target named database instance (`ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e`):
   ```json
   {
     "firestore": [
       {
         "database": "ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e",
         "rules": "firestore.rules"
       }
     ]
   }
   ```

2. **`.firebaserc` Project Binding**:
   Binds the local repository to the production Firebase project ID:
   ```json
   {
     "projects": {
       "default": "studio-apps-483721"
     }
   }
   ```

3. **Terminal Deployment Pipeline (`npm run deploy:rules`)**:
   - `firebase-tools` is installed as a development dependency.
   - Standardized deployment script defined in `package.json`:
     ```bash
     npm run deploy:rules
     # Executes: firebase deploy --only firestore:rules
     ```
   - Automatically compiles, validates, and deploys `firestore.rules` to Google Cloud Firestore with real-time CLI status verification.

### 7.5 Serverless Edge & Auth Deletion Architecture (`/api/admin-delete-user.ts`)

To support permanent, legally compliant member deletions without client credential exposure, the platform deploys a dedicated Vercel Serverless Function at `/api/admin-delete-user`:

1. **Firebase Admin SDK ESM Interop Resolution**:
   - Resolves CommonJS/ESM module interop discrepancies across Vercel Node runtime bundlers via:
     ```typescript
     import * as admin from 'firebase-admin';
     const firebaseAdmin = (admin as any).default || admin;
     ```
   - Ensures consistent runtime access to `initializeApp`, `credential.cert`, and `auth().deleteUser`.

2. **Environment Private Key Newline Unescaping**:
   - Private keys supplied through production environment variables (`FIREBASE_SERVICE_ACCOUNT_KEY` or `FIREBASE_PRIVATE_KEY`) frequently serialize newline characters as literal `\n` escape sequences.
   - The endpoint normalizes keys prior to SDK credential initialization via `.replace(/\\n/g, '\n')`, preventing ASN.1/OpenSSL parse failures.

3. **Atomic Account Purging Across Auth and Firestore**:
   - Executed via `deleteUserRecord(userId, adminUid)` in `src/services/auctionService.ts`:
     1. Dispatches an authenticated HTTP POST request to `/api/admin-delete-user` with `{ uid, adminUid }`.
     2. The serverless handler verifies administrator parameters, enforces a self-deletion guard (`cleanUid === cleanAdminUid`), and executes `await firebaseAdmin.auth().deleteUser(cleanUid)`.
     3. Gracefully catches and logs `auth/user-not-found`, treating already-purged Auth identities as non-blocking successes (`{ success: true, note: 'user-not-found' }`).
     4. `deleteUserRecord` then resolves and commits an atomic batch deletion wiping associated documents across both `users/{userId}` and `bidders/{userId}` Firestore collections.

### 7.6 Authentication Security & Session Defense (`AuthContext.tsx` & `AuthModal.tsx`)

The platform implements multi-layer session defense mechanisms in `src/context/AuthContext.tsx` and `src/components/AuthModal.tsx` to maintain absolute data integrity and prevent unauthorized access:

1. **Orphaned Session Revocation Guard**:
   - **Initial Auth Restoration Guard**: During `onAuthStateChanged` hydration, if Firebase Auth returns an authenticated user but their corresponding Firestore profile `users/{currentUser.uid}` does not exist (and registration is not actively pending), `AuthContext` instantly treats the session as orphaned/deleted.
   - **Real-Time Deletion Listener**: An active `onSnapshot` listener on `users/{currentAuthUser.uid}` monitors live document state. If an administrator deletes the account in the Member Directory while the user is actively browsing:
     - Immediately executes `signOut(auth)` via `fbSignOut`.
     - Flushes local state (`user: null`, `userProfile: null`).
     - Dispatches a prominent high-visibility toast notice: `"This account has been deleted by an administrator."`.
     - Instantly redirects the client to the root homepage (`/`).

2. **Strict Email Verification Enforcement**:
   - **Auto-Logout Post-Signup**: When a user registers an account via email and password, `AuthContext.tsx` dispatches a verification email and immediately calls `signOut(auth)` to terminate the automatic Firebase client auto-login.
   - **Unverified Login Blocking**: During sign-in attempts in `AuthModal.tsx` and session evaluation in `AuthContext.tsx`, accounts where `!currentUser.emailVerified && !userProfile.isEmailVerified` are blocked from session hydration, immediately signed out, and prompted with an informative verification notice. Authenticated state is only unlocked upon email link confirmation or manual administrator staff override (`setUserEmailVerified`).
   - **Credentialed Unauthenticated Status Checks (`checkEmailVerification`)**: Enables users to verify their email status without an existing session by submitting credentials (`email` and `pass`). The routine signs in, calls `currentUser.reload()`, and if verified, atomically auto-syncs `isEmailVerified: true` across both `users/{uid}` and `bidders/{uid}` collections in Firestore while returning full authenticated session state.
   - **Atomic Auto-Sync Across Collections**: Any confirmed verification (via client status check or staff manual override) executes synchronized writes ensuring `isEmailVerified: true` is permanently mirrored across both `users` and `bidders` profiles.
   - **Deferred Welcome Email Dispatch**: To guarantee that welcome emails are only received by genuine, confirmed recipients, `sendWelcomeBidderEmail` (`type: 'welcome_bidder'`) is suppressed during initial signup. It is triggered strictly after verification is confirmed (`user.emailVerified || data.isEmailVerified`) or staff manual override, with duplicate deliveries guarded via `wailtail_welcome_sent_${uid}` in `localStorage`.

3. **Google OAuth Direct State Hydration (`signInGoogle`)**:
   - Executes pop-up authentication via `signInWithPopup(auth, googleProvider)`.
   - **Zero-Refresh Direct Hydration**: Removes listener suppression flags and hydrates `user` and `userProfile` states directly (`setUser(cred.user); setUserProfile(profile);`), eradicating manual page reloads.
   - **Pre-Verified Credentials**: Sets `isEmailVerified: true` immediately, respecting Google OAuth's trusted verification status.
   - **Ban Enforcement**: Checks `profile.isBanned || profile.bannedFromBidding`, triggering immediate sign-out (`fbSignOut`) and error rejection if the member has been restricted.
   - **Admin Privileges Assignment**: Cross-references user email against `ADMIN_EMAILS`, provisioning `role: 'admin'` for authorized staff and default `role: 'bidder'` for standard members.

---

## 8. Progressive Web App (PWA) & Firebase Cloud Messaging (FCM) Architecture

### 8.1 Vite PWA Integration & Web App Manifest (`vite.config.ts`)
The platform leverages `vite-plugin-pwa` to deliver a native app-like experience across desktop and mobile devices:
* **Registration Mode**: `registerType: 'autoUpdate'` ensures service worker scripts update silently in the background when revisions are deployed.
* **Manifest Configuration**:
  ```typescript
  manifest: {
    name: 'Wailtail Auctions',
    short_name: 'Wailtail',
    description: 'Curated Collector Car Auctions',
    theme_color: '#0f172a',
    background_color: '#020617',
    display: 'standalone',
    icons: [
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any maskable'
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable'
      }
    ]
  }
  ```
* **HTML Head Metadata**: `index.html` injects matching `<meta name="theme-color" content="#0f172a" />` and `<link rel="apple-touch-icon" href="/icons/icon-192x192.png" />` tags for iOS Safari home screen bookmarking.

### 8.2 Workbox Runtime Caching Strategy
Workbox manages fine-grained offline runtime caching to minimize bandwidth and accelerate repeat visits:
1. **Static App Shell Resources**:
   - Matches: `style`, `script`, and `worker` requests.
   - Strategy: `StaleWhileRevalidate` with `cacheName: 'static-resources'`, capped at 100 entries with a 30-day expiration (`30 * 24 * 60 * 60` seconds).
2. **Firebase Cloud Storage & Remote Images**:
   - Matches: Image assets and `https://firebasestorage.googleapis.com` URL patterns.
   - Strategy: `NetworkFirst` with a 3-second network timeout fallback (`networkTimeoutSeconds: 3`), cached under `cacheName: 'images-and-storage'`, capped at 150 entries with a 7-day expiration (`7 * 24 * 60 * 60` seconds).
   - Guarantees instant photo hydration on intermittent network conditions while prioritizing fresh vehicle images.

### 8.3 Background Push Service Worker (`public/firebase-messaging-sw.js`)
To receive live push alerts when browser tabs are closed or operating in the background, a dedicated service worker runs independently of the main React application thread:
* **Compat SDK Architecture**: Utilizes modular compat scripts (`firebase-app-compat.js` and `firebase-messaging-compat.js` v10.13.2) to maintain service worker compatibility without complex worker bundlers.
* **Background Handler (`messaging.onBackgroundMessage`)**:
  - Captures incoming FCM remote push payloads.
  - Extracts alert title and body (`payload.notification` or `payload.data`), defaulting to `"Wailtail Auction Alert"`.
  - Dispatches native system notifications with `/icons/icon-192x192.png` application icon, badge, custom tags (`tag: payload.data?.tag || 'wailtail-outbid-alert'`), and arbitrary lot metadata.
* **Notification Click Navigation (`notificationclick`)**:
  - Automatically closes the clicked notification banner.
  - Extracts the target URL (`payload.data.url` or `payload.data.click_action`, defaulting to `/`).
  - Matches existing open browser client windows and transfers focus (`client.focus()`), or opens a new browser window (`clients.openWindow(targetUrl)`) if none exist.

### 8.4 FCM Web Push Hook (`src/hooks/usePushNotifications.ts`)
The `usePushNotifications` hook provides a reactive interface for component consumption:
* **Interface**:
  ```typescript
  export interface UsePushNotificationsReturn {
    isSupported: boolean;
    permission: NotificationPermission; // 'default' | 'granted' | 'denied'
    token: string | null;
    loading: boolean;
    error: string | null;
    fcmErrorDetails: string | null;
    isEnabled: boolean;
    requestPushPermission: () => Promise<string | null>;
    removePushPermission: () => Promise<void>;
  }
  ```
* **Capability & Environment Detection**:
  - Validates `window.Notification` and `navigator.serviceWorker` availability.
  - Queries `isSupported()` from `firebase/messaging`.
  - Accurately identifies iOS Safari environments requiring PWA standalone installation for APNs push capabilities.
* **VAPID Public Key Exchange**:
  - Invokes `getToken(messaging, { vapidKey, serviceWorkerRegistration })` using the platform's public Web Push VAPID key (`VITE_FIREBASE_VAPID_KEY`).
  - Ensures the service worker registration for `firebase-messaging-sw.js` is active by awaiting `navigator.serviceWorker.ready` before acquiring the token.
* **Multi-Device Token Synchronization**:
  - Upon token acquisition, atomically updates the user's Firestore profile at `users/{uid}` (and synchronized bidder profile records at `bidders/{uid}`) using `setDoc(docRef, { fcmTokens: arrayUnion(token) }, { merge: true })`.
  - Caches the active token in `localStorage` under `wailtail_fcm_token`.
  - Upon permission revocation or manual opt-out, deletes the token via `deleteToken(msg)` and atomically purges it using `setDoc(docRef, { fcmTokens: arrayRemove(currentToken) }, { merge: true })`.

### 8.5 Notification Control Panel (`UserAccountHubModal.tsx`)
Provides users with granular control over live outbid and closing notifications:
* **Live Outbid Alerts Switch**: Toggle bound to `requestPushPermission` and `removePushPermission`.
* **Dynamic Permission Status Badges**:
  - `Active` (Emerald): Push notifications enabled with valid FCM token.
  - `Blocked` (Rose): Browser notifications blocked in device or browser preferences.
  - `Disabled` (Slate): Notifications supported but not currently opted-in.
* **iOS Safari Guidance Callout**: When running in mobile Safari outside of standalone mode, renders a guided instruction card prompting users to tap Share $\rightarrow$ "Add to Home Screen" to enable Apple Push Notification service (APNs) Web Push support.
* **Diagnostic FCM Error State Reporting**: Renders high-visibility monospace diagnostic callout cards surfacing raw FCM error codes and descriptions (`fcmErrorDetails || pushError`) to simplify troubleshooting across development, staging, and restricted browser environments.

### 8.6 Web Push Notification Engine & Service Worker Architecture
The platform features an end-to-end Web Push notification engine linking Firebase Cloud Messaging (FCM), browser service workers, and Firestore user registries:

1. **Root-Scoped Service Worker (`/firebase-messaging-sw.js`)**:
   - Explicitly registered with root scope (`{ scope: '/' }`) ensuring push event handling across all URL paths and sub-routes.
   - Background payload handling listens via both Firebase Compat `messaging.onBackgroundMessage()` and native browser `self.addEventListener('push', ...)` event listeners.
   - Dispatches system desktop and mobile OS notifications via `self.registration.showNotification(title, notificationOptions)` with custom lot badges (`/icons/icon-192x192.png`), alert tags (`tag: payload.data?.tag || 'wailtail-auction-alert'`), and deep link metadata.
   - Implements `self.addEventListener('notificationclick', ...)` to close the toast, inspect existing browser clients via `clients.matchAll({ type: 'window', includeUncontrolled: true })`, and either focus an existing tab or launch a target lot URL with fallback (`clients.openWindow(targetUrl)`).

2. **Hook Lifecycle & Race-Condition Prevention (`src/hooks/usePushNotifications.ts`)**:
   - Pre-registration check guarantees `navigator.serviceWorker` and `Notification` APIs exist and verifies Firebase Messaging support with `await isSupported()`.
   - Prevents registration race conditions by explicitly waiting for `await navigator.serviceWorker.ready` before invoking `getToken()`.
   - Implements structured diagnostic tracing with `[FCM Setup]` prefix logging navigator availability, service worker readiness, VAPID key presence, and registration error details.
   - Token acquisition handles VAPID key injection via `getToken(msg, { vapidKey, serviceWorkerRegistration: registration })`.

3. **Safe Firestore Token Merge Persistence**:
   - Replaces fragile update operations with safe merge semantics: `setDoc(doc(db, 'users', user.uid), { fcmTokens: arrayUnion(token) }, { merge: true })` (and complementary `bidders/{uid}.fcmTokens` persistence).
   - Guarantees token saving never throws missing document exceptions if the user document has not yet been provisioned or is hydrating.
   - Unsubscription atomically executes `setDoc(..., { fcmTokens: arrayRemove(token) }, { merge: true })` alongside client-side token deletion (`deleteToken(msg)`).

4. **Environment Configuration & PWA Installation Constraints**:
   - **VAPID Public Key**: Requires `VITE_FIREBASE_VAPID_KEY` to be configured in application environment variables. If missing or empty, `[FCM Setup]` issues console warnings and marks the hook state as disabled with diagnostic error messaging.
   - **iOS Safari PWA Installation Constraint**: Mobile Safari on iOS 16.4+ requires web applications to be added to the iOS Home Screen via PWA standalone mode (`window.navigator.standalone === true`) before Apple Push Notification service (APNs) grants push subscription permissions. The UI detects non-standalone Safari instances and renders step-by-step installation instructions.


