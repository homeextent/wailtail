# Wailtail Auction Platform — System Bible & Architectural Specification

## 1. Executive Architecture Overview

**Wailtail** is an enterprise-grade, multi-car private auction platform modeled after Bring-a-Trailer, engineered specifically for high-value collector automobiles. The platform supports multiple concurrent active and upcoming vehicle listings simultaneously, combining real-time bidding synchronization with editorial-grade vehicle storytelling, per-lot media configuration, multi-category gallery management, and a dedicated multi-listing authoring workspace.

### Technology Stack
* **Frontend Framework**: React 18 with TypeScript and Vite
* **Multi-Listing Architecture**: Dynamic catalog indexing with `/dashboard/listings/[id]/edit` dedicated workspace routing and multi-lot state hydration
* **Styling**: Tailwind CSS with custom editorial typographic scales
* **Real-Time Data Engine**: Google Cloud Firestore with snapshot listeners (`onSnapshot`)
* **Security & Auth**: Firebase Authentication & Firestore Security Rules (`firestore.rules`)
* **Host & Infrastructure**: Cloud Run containerized deployment, reverse proxied on port 3000

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

### 2.4 `mediaConfig` Document
Path: `auctions/{auctionId}/media/config`
```typescript
interface MediaConfiguration {
  siteLogo?: string;
  siteName?: string;
  siteTagline?: string;
  highlightsBadge?: string;
  distanceUnit?: 'km' | 'mi';
  vehicleName: string;
  
  // Hero Carousel
  heroImages: string[]; // Ordered URLs for the top carousel
  
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
    duration: string;
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

1. **Hero Carousel**:
   - Ordered image array rendered in Bring-a-Trailer style carousel format.
   - Drag-and-drop reordering with HTML5 drag events (`onDragStart`, `onDragOver`, `onDrop`).
   - Bidirectional positional nudges (`← Left` / `Right →`) on each card.
   - Visual `★ Lead Hero` highlight for Slide #1.
2. **Categorized Photo Grid**:
   - 6 categorized sub-galleries: `exterior`, `interior`, `engine`, `underbody`, `docs`, `documentation`.
   - On-the-fly category reassignment via inline dropdown tag directly on each thumbnail card.
   - Multi-file batch upload support (accepts up to 12MB per image or PDF).
3. **PDF Document Support**:
   - Native support for PDF vehicle inspection reports and mechanical records.
   - Distinctive red PDF file icon, title, and document badge rendered in the gallery and Admin Control Center.
   - Safe opening in new browser tab for client viewing without iFrame sandbox crashes.

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

### 6.1 Dedicated Listing Authoring Workspace (`/dashboard/listings/[id]/edit`)
- **Multi-Car Inventory Architecture**:
  - Full support for multi-car inventory catalogs in Firestore (`auctions` collection and per-lot `media-${auctionId}` settings).
  - **"Select Vehicle Listing" Dropdown**: Located in the workspace header bar, allowing administrators to seamlessly switch between active and draft vehicle lots with automatic form state synchronization.
  - **"+ New Listing" Workflow**: Modal prompt requesting Listing Title / Vehicle Lot Name; atomically provisions a new vehicle document in Firestore (`createNewListing`) with clean placeholders and default Canadian CAD financials ($1,000 start, $250 increment, 7-day duration) without overwriting existing listings.
- **Full-Page Split-Screen Route & View Modes**:
  - Dedicated authoring workspace (`ListingEditorWorkspace.tsx`), offering 3 layout view modes:
    1. **Split Mode (Default)**: 60/40 reactive layout with left-pane form authoring and right-pane live public preview.
    2. **Edit Form Mode**: Expanded full-width layout (`w-full max-w-6xl mx-auto`) for focused content creation.
    3. **Preview Mode**: Dedicated full-screen live public preview with device toggles.
- **Sticky Vertical Progress Stepper**: Left-hand navigation tracking completion status across all 7 listing sections with live visual badges (`Complete`, `In Progress`, `Pending`), scroll anchoring, and sticky top pinning (`sticky top-6 self-start max-h-[calc(100vh-3rem)] overflow-y-auto`).
- **Responsive Preview Viewport**: Toggle between full Desktop mode and 390px Mobile simulated phone container with live state hydration.
- **100% Feature Parity Across All 7 Sections**:
  - **Section 1 (Vehicle Identity)**: Standardized Year select (1900–2026), Title & Registration status dropdown, Drivetrain / Gearbox dropdown, structured City / Province / Country location fields, and highlights badge.
  - **Section 2 (Overview Narrative)**: Editable heading, markdown/prose multiline text area, and featured overview image with local upload, gallery picker modal, or URL entry with lightbox preview.
  - **Section 3 (Technical Specifications)**: Automatic real-time synchronization from Section 1 into Section 3 table and public highlights card, with support for appending, reordering, and deleting custom specification rows.
  - **Section 4 (Showcase Chapters)**: Narrative chapter cards with photo uploader (file upload, gallery modal picker, manual URL), multiline checkmark bullet highlights, dynamic technical spec key-value pills, and chapter reordering/deletion.
  - **Section 5 (Hero Carousel & Full Photo Gallery)**: Drag-and-drop and positional hero carousel reordering (`← Left` / `Right →`) with `★ Lead Hero` indicator; categorized gallery supporting exterior, interior, engine, underbody, and PDF inspection documents with non-clipping category selectors and high-visibility delete buttons.
  - **Section 6 (Videos & Driving Chapters)**: YouTube video metadata fetching via OpenGraph/oEmbed, driving chapter timeline cards with live thumbnail previews, duration timestamps, and chapter management.
  - **Section 7 (Auction Financials & Schedule)**: Canadian Dollar (`CAD $`) financial ledger (starting bid, reserve, minimum increment), lifecycle status dropdown, datetime pickers, and "Simulate Final 2 Minutes" Anti-Sniping test button.
- **Full Public Preview Parity**:
  - Live public header with dynamic countdown calculated via `formatAuctionCountdown`, starting/high bid, reserve status pill, and key header specs.
  - Interactive `HeroMediaCarousel` with image navigation and lightbox triggers.
  - Section 2 & 3 Overview Narrative and synchronized "Vehicle Highlights" sidebar card with Zero Buyer Fees banner and Consignor Private Inquiry action.
  - Section 4 `InlineShowcaseSection` with photo lightboxes and highlight lists.
  - Section 6 `YouTubePlaylistSection` with video embed and chapter selectors.
  - Section 5 `PhotoGalleryGrid` with categorized filtering and full-screen lightbox modal.
  - Section 7 Financials & Scheduling Summary Card detailing soft-close rules and auction dates.
- **JSON Import / Export (`ListingDraftSchema`)**:
  - Standardized `ListingDraftSchema` interface capturing Sections 1–4 and 7 in clean, standardized JSON format.
  - "Import JSON" modal with syntax validation, schema key checks, and atomic state hydration across all sections.
  - "Export JSON" action copying active listing state directly to clipboard as formatted JSON.

### 6.2 Decoupled Admin Operational Drawer (`AdminPanelModal.tsx`)
- Reserved strictly for host/admin operations:
  - **All Vehicle Listings Inventory Tab**: Unified inventory dashboard tracking all vehicle lots across the platform with lifecycle badges (`Live`, `Upcoming`, `Ended`), real-time search, and quick management actions:
    - **Edit**: Direct deep link to `/dashboard/listings/[id]/edit`.
    - **Duplicate**: Clones any existing lot into a fresh draft copy with new lot ID.
    - **Delete Lot**: Safe deletion modal preventing accidental drops.
    - **Set Active**: Immediately switches active public view to selected lot.
  - **Standardized "+ New Listing" Modal**: Replaced redundant legacy header buttons with a single standardized creation trigger (`createNewListing`) prompting for vehicle lot name and initializing clean arrays and Canadian CAD defaults.
  - **Live Bids Telemetry Log**: Real-time audit trail of all placed bids with bidder identities, timestamps, and amounts.
  - **Bidder Registry**: Approval, verification, and banning controls for bidders.
  - **Winner Settlement**: Post-auction reserve and final settlement resolution.
  - **Platform Branding & Global Settings**: Logo, site name, and global auction defaults.
- Integrated "Open Listing Editor →" button allowing immediate navigation into the authoring workspace.

### 6.3 Public Q&A Thread & Official Seller / Admin Replies (`CommentSection.tsx`)
- High-visibility public discussion stream for vehicle inquiries, questions, and provenance notes.
- **Nested Official Responses**: Verified consignors/sellers and platform administrators can reply directly to any question via an inline reply trigger.
- Official replies render directly beneath the target question, decorated with prominent `SELLER` or `STAFF / ADMIN` badges, distinct border styling, and verified timestamps.

### 6.4 Public Multi-Car Catalog Grid (`VehicleCatalogGrid.tsx`) & Homepage Routing
- **Catalog as Default Homepage (`/`)**:
  - The multi-car Vehicle Auction Catalog view is configured as the primary root homepage route (`/`) as well as (`/catalog`).
  - Clicking the Wailtail header logo in `Navbar.tsx` from any route navigates directly to this catalog homepage.
  - Dedicated public auction detail route (`/auctions/[id]`) allows focused bidding and viewing on individual lots, with instant header logo return to the catalog inventory.
- **Dynamic Catalog Hero Image Resolution**:
  - `CatalogCard.tsx` / `AuctionCard.tsx` incorporates multi-tiered image resolution logic:
    `leadHeroImage` → `heroImages[0]` → `DEFAULT_MEDIA_CONFIG.heroImages[0]` → `localStorage` cache.
  - Prevents fallback to "Photo Gallery Pending" when hero images are present in Firestore or media configurations.
  - Features admin quick-edit button for immediate deep-linking to the authoring workspace.
- **Dynamic Search & Filtering**:
  - Real-time search filtering across make, model, VIN, and location.
  - Category filter pills (`All Lots`, `Live`, `Upcoming`, `Ended`) with live lot counters.
  - Rich vehicle cards featuring hero photo thumbnail, current/starting bid in CAD, reserve status pill, odometer, location, and deep link navigation to `/auctions/[id]`.

### 6.5 Seller Onboarding Flow & Consignment Intake (`ConsignmentModal.tsx`)
- **"Sell Your Vehicle" Header Action**:
  - Prominent amber call-to-action button in `Navbar.tsx` and catalog banner header.
  - Opens `ConsignmentModal.tsx` for seller intake inquiries.
- **Form Fields & Validation**:
  - Year, Make, Model, VIN, Mileage, Transmission, Vehicle Location, Reserve Expectation, Seller Name, Seller Email, Seller Phone, and Additional Notes/Condition details.
  - All text inputs initialize as empty strings (`""`), cleanly displaying grey HTML placeholder guidance without pre-filled contamination.
- **Persistence & Workspace Handoff**:
  - Inquiries are stored in the Firestore `consignment_applications` collection via `submitConsignmentApplication`.
  - Direct transition action allows sellers/admins to jump straight into a fresh listing authoring workspace (`/dashboard/listings/new`).

### 6.6 Strict Fresh Listing Isolation Guarantees
- **Data Leak Prevention**:
  - `createNewListing` in `auctionService.ts` and `ListingEditorWorkspace.tsx` enforces strict initialization:
    - Text inputs: set to `""` (empty string) for non-main lots.
    - Media arrays (heroes, gallery images, showcase chapters, video chapters): set to `[]` (empty array).
    - Custom specifications: set to `[]` (empty array).
  - Eliminates legacy Porsche 911 narrative text, specs, and image URLs from leaking into newly created lots, allowing grey placeholder text to serve as guidance.

### 6.7 Consignor Private Inquiry (`ContactSellerModal.tsx`)
- Private buyer-to-seller communication modal.
- Form fields: Name, Email, Phone Number, Inquirer Status (Registered Bidder, Private Collector, General Buyer), and Inquiry Message.
- Stores inquiries in the `inquiries` Firestore collection with timestamps and auction association.

---

## 7. Security Rules & Permissions (`firestore.rules`)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /auctions/{auctionId} {
      allow read: if true;
      allow write: if request.auth != null;
      
      match /bids/{bidId} {
        allow read: if true;
        allow create: if request.auth != null;
      }
      
      match /comments/{commentId} {
        allow read: if true;
        allow create: if request.auth != null;
      }
    }
    
    match /inquiries/{inquiryId} {
      allow create: if true;
      allow read: if request.auth != null;
    }

    match /consignment_applications/{appId} {
      allow create: if true;
      allow read: if request.auth != null;
    }
  }
}
```
