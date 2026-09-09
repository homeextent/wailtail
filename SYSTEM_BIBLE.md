# Wailtail Auction Platform — System Bible & Architectural Specification

## 1. Executive Architecture Overview

**Wailtail** is an enterprise-grade, multi-car private auction platform modeled after Bring-a-Trailer, engineered specifically for high-value collector automobiles. The platform supports multiple concurrent active and upcoming vehicle listings simultaneously, combining real-time bidding synchronization with editorial-grade vehicle storytelling, per-lot media configuration, multi-category gallery management, and a dedicated multi-listing authoring workspace.

### Technology Stack
* **Frontend Framework**: React 18 with TypeScript and Vite
* **Multi-Listing Architecture**: Dynamic catalog indexing with `/dashboard/listings/[id]/edit` dedicated workspace routing, `/admin` full-page portal, and multi-lot state hydration
* **Styling**: Tailwind CSS with custom editorial typographic scales
* **Real-Time Data Engine**: Google Cloud Firestore with snapshot listeners (`onSnapshot`)
* **Security & Auth**: Firebase Authentication & Firestore Security Rules (`firestore.rules`)
* **Host & Infrastructure**: Cloud Run containerized deployment, reverse proxied on port 3000
* **Serverless Edge Layer**: Vercel Serverless Functions (`/api/send-consignment-email`, `/api/youtube-playlist`)
* **Firebase Infrastructure & CLI Deployment**: `firebase.json` configuration, `.firebaserc` project binding (`studio-apps-483721`), synchronized production `firestore.rules`, and terminal deployment pipeline via `npm run deploy:rules` (`firebase deploy --only firestore:rules`)

### 1.1 Platform Architecture & Routing Map

| Route / Surface | Component / Handler | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `/` & `/catalog` | `VehicleCatalogGrid.tsx` | Public | Multi-car vehicle catalog grid acting as primary homepage; features live CAD bid telemetry, search, and category filters (`All Lots`, `Live`, `Upcoming`, `Ended`) with normalized status predicates (`isLive`, `isUpcoming`, `isEnded`). |
| `/auctions/[id]` | `App.tsx` (Single Lot View) | Public | Focused single-car lot viewing with live anti-snipe countdown, sticky bid bar (`StickyBidBar.tsx`), hero carousel, showcase chapters, driving playlist, and public Q&A. |
| `/admin` | `AdminPortalPage.tsx` | `ADMIN` only | Full-page operations portal featuring 5 command suites: Bidder Registry, Consignment Applications, Vehicle Inventory & Lots, Live Bids Telemetry Ledger, and Platform Branding. Supports Multi-Select Bulk Action Engine, 1-click email triage deep-links (`/admin?tab=consignments&id=${appId}&action=approve|reject`), and cascading deletion controls. |
| `/dashboard/listings/[id]/edit` | `ListingEditorWorkspace.tsx` | `ADMIN`, `SELLER` | Dedicated split-screen authoring workspace with 60/40 reactive layout, desktop/mobile preview simulation, sticky 7-section progress stepper, and JSON schema import/export. |
| User Activity Hub (Modal) | `UserAccountHubModal.tsx` | Authenticated | Global account activity modal accessible from top navigation; displays active bid telemetry (`LEADING` vs `OUTBID`), 4-stage offline CAD settlement checklist, seller lot telemetry, and consignment status. |
| `/api/send-consignment-email` | `api/send-consignment-email.ts` | Public / Serverless | Vercel serverless proxy endpoint dispatching structured HTML intake notifications via Resend API to platform administrators. |
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
1. **Endpoint Architecture & Dual-Mode Proxy Pipeline**:
   - Vercel Serverless Function hosted at `/api/send-consignment-email` (`api/send-consignment-email.ts`).
   - Supports a dual-mode payload interface via `type: 'consignment' | 'inquiry'` (defaulting to `'consignment'` if unspecified):
     - **Consignment Intake (`type: 'consignment'`)**: Handles incoming JSON payloads from the public consignment modal (`ConsignmentModal.tsx`) and dispatches structured HTML notification emails directly to curation administrators.
     - **Private Buyer Inquiries (`type: 'inquiry'`)**: Handles private direct inquiries dispatched from `ContactSellerModal.tsx`, transmitting prospective buyer messages and seller inquiry details directly to administrators/sellers with zero client-side credential exposure.
   - Integrates with the **Resend API** as primary mail provider (supporting direct HTTP fetch fallback if the SDK is unavailable), with built-in failover to **SendGrid** and a development mock logger when keys are absent.
2. **Environment Variables**:
   - `RESEND_API_KEY`: Secret API token for Resend dispatch (`https://api.resend.com/emails`).
   - `ADMIN_NOTIFICATION_EMAIL` / `ADMIN_EMAIL` / `WAILTAIL_ADMIN_EMAIL`: Destination recipient inbox for new consignment and inquiry submissions (defaults to `contact@wailtail.com` if omitted).
   - `RESEND_FROM_EMAIL`: Authorized sender address (e.g. `Wailtail Curation <consignments@wailtail.com>`).
   - `SENDGRID_API_KEY` / `SENDGRID_FROM_EMAIL`: Fallback mailer configuration.
3. **Structured HTML Digest Templates**:
   - **Consignment Application Digest**:
     - Compiles vehicle taxonomy parameters (Year, Make, Model, Generation/Chassis), VIN, Mileage, Transmission, Reserve Expectation, and structured location fields (`locationCity`, `locationProvince`, `locationCountry`).
     - Appends applicant contact info and private condition notes.
     - Embeds visual badge indicators differentiating registered members (`REGISTERED (SELLER)` / `REGISTERED (BIDDER)` in emerald green) from guest inquiries (`GUEST / UNREGISTERED` in amber).
     - **Actionable 1-Click Triage Deep-Links**:
       - Integrates styled, email-safe CTA table buttons linking directly to the administrative portal with query parameters:
         - **Approve CTA**: `https://www.wailtail.com/admin?tab=consignments&id=${appId}&action=approve`
         - **Reject CTA**: `https://www.wailtail.com/admin?tab=consignments&id=${appId}&action=reject`
       - Enables platform administrators to triage incoming consignments straight from their inbox on mobile or desktop devices.
   - **Private Buyer Inquiry HTML Table**:
     - Subject line: `[Private Inquiry] ${inquiryTopic} — ${targetVehicleTitle} (${inquiryName})`.
     - High-contrast structured HTML table containing:
       - **Inquirer Name**: Prospect's full name.
       - **Email**: Active mailto hyperlink.
       - **Phone**: Formatted phone number or `Not provided`.
       - **Inquiry Topic**: Subject topic (e.g., Vehicle History, Inspection, Financing, Reserve, Shipping).
       - **Target Vehicle Title**: Vehicle title/lot referenced by the inquiry.
       - **Inquiry Message**: Pre-formatted multiline inquiry text with line-height styling.

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
  - **1. Bidder Registry Tab** (`bidders`): Server-assisted paginated search (`fetchPaginatedBidders`) querying across `users` with client-side query filtering by display name, email, and UID. Configurable page limits with previous/next pagination controls.
  - **2. Consignment Applications Tab** (`consignments`): Server-assisted paginated search (`fetchPaginatedConsignments`) querying `consignment_applications` with text filtering across applicant name, email, phone, make, model, and status filter pills (`all`, `pending`, `approved`, `declined`).
  - **3. Vehicle Inventory & Lots Tab** (`inventory` — 5th Admin Tab): Comprehensive full-width vehicle inventory management suite displaying active catalog lots, editable vehicle specifications, and status lifecycles.
    - Status filtering pills: `All`, `Draft`, `Preview`, `Upcoming`, `Live`, and `Ended`.
    - Real-time lot search filtering across make, model, VIN, and title.
    - Server-assisted client pagination (configurable page size with previous/next navigation).
    - Row-level controls: quick status dropdown switcher, live CAD high bid tracking, direct authoring workspace launch links (`/dashboard/listings/${id}/edit`), and single-lot deletion triggers.
  - **4. Live Bids Telemetry Ledger Tab** (`ledger`): Real-time streaming audit trail of all placed bids with bidder handles, lot titles, timestamps, and currency amounts.
  - **5. Platform Branding Tab** (`branding`): Global platform identity configuration for site logo, name, and tagline with Firestore persistence and local storage fallback.
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
    - `deleteListing(auctionId, cascadeDeleteConsignment)`: Atomically deletes the vehicle lot from `auctions`, its settings document (`settings/media-${id}`), and media configuration subcollection. When `cascadeDeleteConsignment` is enabled, queries and removes any associated consignment applications where `convertedAuctionId == auctionId`. Also flushes localized media cache keys from `localStorage`.
    - `deleteConsignmentApplication(appId, cascadeDeleteAuction)`: Deletes the record from `consignment_applications` and legacy `consignments`. When `cascadeDeleteAuction` is enabled, resolves `convertedAuctionId` and cascades deletion to the generated vehicle lot via `deleteListing(convertedAuctionId, false)`.
    - `batchDeleteConsignments(appIds, cascadeDeleteAuctions)`: Chunks application deletions in 150-item Firestore batches, resolving linked vehicle lots in 30-item batches for optional cascading lot purging.
    - `batchDeleteAuctions(auctionIds, cascadeDeleteConsignments)`: Chunks vehicle lot deletions in 100-item Firestore batches, resolving linked consignment applications for optional cascading cleanup.
- **Atomic Moderation Services Across Dual Collections**:
  - `resolveUserAndBidderDocuments(userId)`: Resolves document references across both `users/{userId}` and `bidders/{userId}` collections to guarantee atomic synchronization.
  - **3-Way Role Switching (`updateUserRole`)**: Allows administrators to toggle user accounts between `ADMIN`, `SELLER`, and `BIDDER` via an atomic Firestore `writeBatch`.
  - **Account Ban Toggling (`setUserBannedStatus` / `banOrRemoveBidder` / `unbanBidder`)**: Atomically updates `isBanned`, `bannedFromBidding`, `bannedAt`, and `banReason`.
  - **Email Verification Override (`setUserEmailVerified`)**: Permits manual staff verification overrides (`isEmailVerified: true/false`).
  - **Permanent Record Deletion (`deleteUserRecord`)**: Atomic batch deletion purging user documents from both `users` and `bidders` collections.
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
  - **Bidder Registry**: Approval, verification, and banning controls for bidders.
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
| Paginated Bidder Registry & Consignment Search | ❌ | ❌ | ❌ | ✅ |
| Switch User Roles (`ADMIN` $\leftrightarrow$ `SELLER` $\leftrightarrow$ `BIDDER`) | ❌ | ❌ | ❌ | ✅ |
| Ban / Unban Bidders & Override Email Verification | ❌ | ❌ | ❌ | ✅ |
| Delete User Records from Firestore (`deleteUserRecord`) | ❌ | ❌ | ❌ | ✅ |
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
   Maps the Firestore rules target directly to the root source rules file:
   ```json
   {
     "firestore": {
       "rules": "firestore.rules"
     }
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
