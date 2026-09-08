# Wailtail Collector Car Auction Platform

Wailtail is a modern, Bring-a-Trailer style vehicle auction platform designed for curated classic, collector, and enthusiast cars. It features clean Canadian CAD financials, soft-close anti-sniping protection, real-time bidding telemetry, rich editorial showcase chapters, and a multi-car vehicle catalog architecture.

---

## 1. System Architecture

### Frontend & Application Stack
- **Framework**: React 19 + TypeScript + Vite
- **Routing & Navigation**: Client-side full-page routing supporting multi-car catalog (`/` & `/catalog`), single-car lot details (`/auctions/[id]`), full-page admin portal (`/admin`), and dedicated split-screen authoring workspace (`/dashboard/listings/[id]/edit`)
- **Tri-Role Access Control**: 3-way role hierarchy (`ADMIN`, `SELLER`, `BIDDER`) governing access privileges across administration, authoring, and bidding surfaces
- **Styling**: Tailwind CSS with custom editorial typography and layout scales
- **Icons**: Lucide React
- **Taxonomy Engine**: Curated 80+ collector vehicle dataset (`src/data/vehicleTaxonomy.json`) powering a reactive 3-tier dependent selection pipeline (Year $\rightarrow$ Make $\rightarrow$ Model $\rightarrow$ Generation / Chassis Code)
- **State & Synchronization**: Real-time Firestore snapshot listeners (`onSnapshot`) with dynamic user profile synchronization (`subscribeToUserProfile`) and optimistic UI state hydration

### Serverless & Cloud Infrastructure
- **Serverless Email Proxy (`api/send-consignment-email.ts`)**: Vercel serverless function dispatching structured HTML consignment notifications via Resend API (with SendGrid fallback) directly to platform curation administrators.
- **Serverless YouTube Ingestion (`api/youtube-playlist.ts`)**: Server-side XML RSS Atom feed fetcher bypassing client CORS restrictions for 1-click YouTube playlist chapter auto-import.
- **Firebase Cloud Storage Asset Pipeline**: Direct Storage URL streaming (`uploadImageToStorage`) with client-side canvas micro-compression (`compressImageDataUrl`) and a 900KB serialized payload size cap in `saveMediaConfig()`.

### Firebase Backend Services
- **Cloud Firestore**:
  - `auctions`: Core vehicle documents containing specs, financials, taxonomy generations, and lifecycle status.
  - `auctions/{auctionId}/media/{document=**}`: Recursive wildcard subcollection matching for media configurations, images, chapters, and assets.
  - `bids`: Real-time bidding telemetry with anti-sniping timestamp verification.
  - `comments`: Community Q&A feed with verified seller and administrator official nested replies.
  - `users`: User profiles containing tri-role hierarchy (`ADMIN`, `SELLER`, `BIDDER`), ban statuses, and email verification flags.
  - `consignment_applications`: Intake inquiries capturing structured locations (`locationCity`, `locationProvince`, `locationCountry`), member auto-link references, and conversion statuses.
  - `inquiries`: Direct private communications with consignors.
- **Firebase Cloud Storage**: Vehicle photo and inspection document pipeline streaming assets directly to Storage buckets via `uploadImageToStorage` and storing lightweight HTTPS URLs in Firestore to bypass document size limits.
- **Firebase Authentication**: Email/password and Google OAuth authentication with email verification flags.
- **Firebase Security Rules**: Role-based access control protecting administrative actions and auction modifications (`firestore.rules`).

### Repository Directory Structure
```
.
├── api/
│   ├── send-consignment-email.ts       # Serverless email dispatcher via Resend API
│   └── youtube-playlist.ts             # Serverless CORS proxy for YouTube RSS playlist ingestion
├── firestore.rules                     # Production Firestore security rules & RBAC helper functions
├── src/
│   ├── components/
│   │   ├── AdminPanelModal.tsx         # Secondary host operations drawer
│   │   ├── AdminPortalPage.tsx         # Full-page /admin operations portal & user moderation
│   │   ├── AuctionHeader.tsx           # Sticky/hero auction title and countdown bar
│   │   ├── AuthModal.tsx               # Firebase email/password & Google OAuth modal
│   │   ├── BidModal.tsx                # Real-time anti-snipe CAD bid submission dialog
│   │   ├── CatalogCard.tsx             # Multi-lot catalog vehicle card with dynamic hero resolution
│   │   ├── CommentSection.tsx          # Public Q&A thread with verified seller/admin replies
│   │   ├── ConsignmentModal.tsx        # 3-tier taxonomy consignment intake & member auto-link
│   │   ├── ContactSellerModal.tsx      # Private buyer-to-consignor direct communication
│   │   ├── Footer.tsx                  # Platform legal and footer navigational elements
│   │   ├── HeroMediaCarousel.tsx       # Draggable hero photo carousel with lightbox view
│   │   ├── InlineShowcaseSection.tsx   # Editorial showcase narrative chapters and specs
│   │   ├── ListingEditorWorkspace.tsx  # Split-screen authoring workspace (/dashboard/listings/[id]/edit)
│   │   ├── ListingSubNav.tsx           # In-page listing section anchor sub-navigation
│   │   ├── Navbar.tsx                  # Header navigation, brand logo, and auth triggers
│   │   ├── PhotoGalleryGrid.tsx        # Categorized photo gallery with PDF inspection viewer
│   │   ├── ShareModal.tsx              # Social share dialog with instant link copying
│   │   ├── ShowcaseChaptersEditor.tsx  # Curated editorial chapter management workspace
│   │   ├── SpecCardCombobox.tsx        # Context-aware searchable hybrid attribute combobox
│   │   ├── StickyBidBar.tsx            # Floating mobile/desktop bid CTA with live high bid
│   │   ├── UserAccountHubModal.tsx     # Unified role-aware activity hub & CAD settlement checklist
│   │   ├── VehicleCatalogGrid.tsx      # Primary multi-car inventory catalog homepage (/)
│   │   ├── WailtailLogo.tsx            # SVG brand asset rendering
│   │   └── YouTubePlaylistSection.tsx  # Driving chapters video embed & playlist timeline
│   ├── context/
│   │   └── AuthContext.tsx             # Firebase auth provider & role management
│   ├── data/
│   │   └── vehicleTaxonomy.json        # Curated 80+ collector vehicle make/model/chassis dataset
│   ├── services/
│   │   ├── auctionService.ts           # Core Firestore transactions, moderation, & bidding engine
│   │   ├── emailService.ts             # Consignment email client dispatcher
│   │   └── firebase.ts                 # Firebase app, db, auth, and storage initialization
│   ├── utils/
│   │   ├── formatters.ts               # Currency, date, and countdown formatting utilities
│   │   ├── showcaseConverter.ts        # Bi-directional chapter schema conversion helpers
│   │   └── youtubeMetadata.ts          # YouTube URL and ID parser utilities
│   ├── App.tsx                         # Root layout, real-time profile listeners, & route router
│   ├── index.css                       # Global styles and Tailwind directives
│   ├── main.tsx                        # React application entry point
│   ├── mediaConfig.ts                  # Default fallback configurations & blank presets
│   └── types.ts                        # Master TypeScript schema definitions & data models
```

---

## 2. Key Highlights & Core Features

1. **3-Tier Dependent Vehicle Taxonomy (80+ Collector Marques)**:
   - Curated dataset (`src/data/vehicleTaxonomy.json`) covering 80+ iconic marques with cascading Year $\rightarrow$ Make $\rightarrow$ Model $\rightarrow$ Generation / Chassis Code selection.
   - Built-in `TAXONOMY_OTHER_CUSTOM` fallback text inputs for bespoke, custom, or unlisted vehicle builds.
   - Reordered top-row Section 1 form layout with listing title auto-generator and an auto-syncing Highlights Tag Badge with manual override protection (`isBadgeOverridden`).
2. **Serverless YouTube Playlist Ingestion (`api/youtube-playlist.ts`)**:
   - Vercel serverless proxy endpoint bypassing browser CORS constraints to parse YouTube playlist XML Atom feeds server-side.
   - 1-click "Auto-Import Playlist Videos" instantly populating driving chapters with titles, descriptions, and high-res thumbnails.
   - Video duration metadata completely eradicated across public views and workspace authoring interfaces.
3. **Cloud Storage Asset Pipeline & 900KB Document Guard**:
   - High-resolution inspection photos and hero banners stream directly to Firebase Storage buckets via `uploadImageToStorage()`, storing lightweight HTTPS URLs in Firestore.
   - Pre-flight HTML5 canvas micro-compression (`compressImageDataUrl`) and a strict 900KB serialized payload size limit in `saveMediaConfig()` permanently eliminating Firestore 1MB document limit exceptions.
4. **Section 7 Native Datetime Pickers**:
   - Interactive calendar trigger icons with native `.showPicker()` modal invocation styled with dark-mode compliance (`[color-scheme:dark]`).
   - One-click duration shortcuts (`Set to Now`, `+3 Days`, `+7 Days`) for rapid auction scheduling.
5. **Multi-Car Auction Architecture & Catalog Grid (`/`)**:
   - The multi-car Vehicle Auction Catalog is the default homepage view (`/` and `/catalog`).
   - Clean 0-lot baseline support: snapshot listeners dynamically handle empty databases without forced fallbacks.
6. **Dedicated Listing Authoring Workspace (`/dashboard/listings/[id]/edit`)**:
   - Split-screen workspace with live public preview pane (desktop and mobile viewports).
   - 7 listing sections: Vehicle Identity, Editorial Narrative, Single-Source Technical Specifications, Showcase Chapters (01-04), Hero & Categorized Photo Gallery, YouTube Driving Videos, and CAD Financial Rules.
   - 100% blank draft isolation with nullish coalescing defaults (`$0 CAD` No Reserve).
7. **Full-Page Admin Operations Portal (`/admin`)**:
   - Role-gated full-screen dashboard (`AdminPortalPage.tsx`) for `ADMIN` accounts.
   - Server-assisted paginated search across the Bidder Registry (`fetchPaginatedBidders`) and Consignment Applications (`fetchPaginatedConsignments`).
   - Atomic moderation controls: 3-way role switching (`ADMIN` $\leftrightarrow$ `SELLER` $\leftrightarrow$ `BIDDER`), ban/unban toggling, email verification override, and permanent user deletion (`deleteUserRecord`).
   - 1-click consignment intake approval & draft conversion (`convertConsignmentToDraftListing`) promoting consignors to `SELLER` and auto-generating vehicle listings.
8. **Unified User Account Activity Hub (`UserAccountHubModal.tsx`)**:
   - Global activity hub accessible to registered users directly from the navigation bar.
   - Real-time bid telemetry with `★ LEADING` and `⚠️ OUTBID` indicators and quick bid prompts.
   - 4-stage Canadian offline CAD settlement checklist for won auctions (Wire/Draft, Title Transfer, Transport/Collection, VIN Handover) with direct seller contact credentials.
   - Seller lot inventory telemetry and consignment submission status tracking.
   - Real-time Firestore user profile listener (`subscribeToUserProfile`) synchronizing role modifications instantly across the UI.
9. **Serverless Consignment Intake & Auto-Link Email Dispatcher (`api/send-consignment-email.ts`)**:
   - 3-tier taxonomy dropdowns with `TAXONOMY_OTHER_CUSTOM` fallbacks and 3-column structured location fields (`locationCity`, `locationProvince`, `locationCountry`).
   - Option A registered member auto-link detection (`onBlur`) querying `checkUserAccountByEmail()` to link authenticated user records and role badges.
   - Asynchronous serverless email dispatcher via Resend API (with SendGrid and mock delivery fallbacks) delivering formatted HTML notifications to curation inboxes.
10. **Hero Media Carousel & Media Pending Placeholder**:
    - Purged of hardcoded external fallback URLs.
    - When no images are configured, renders a neutral dark placeholder (`bg-zinc-900 border border-zinc-800 rounded-xl`) with a camera icon and "Media Pending" message.
11. **YouTube Video Series & Thumbnail URL Sanitization**:
    - Validates 11-character video IDs using regex (`/^[a-zA-Z0-9_-]{11}$/`).
    - Prevents 404 network errors in DevTools by only generating `mqdefault.jpg` URLs for validated IDs.
12. **Bulk Purge & Cache Sanitization**:
    - `purgeAllListings()` atomic deletion engine cleanses Firestore documents, media subcollections, and `localStorage` cache.

---

## 3. Getting Started

### Prerequisites
- Node.js (v18+) or Bun / npm / yarn
- Firebase Project configured with Firestore and Authentication

### Installation
```bash
# Clone the repository
git clone https://github.com/your-username/wailtail-auction.git
cd wailtail-auction

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env.local

# Start development server
npm run dev
```

---

## 4. Troubleshooting & Operational Guidelines

### Ghost Listing Re-Hydration
If deleted listings appear to re-hydrate:
1. Verify `deleteListing(auctionId)` has purged `wailtail_custom_media_${auctionId}` and `wailtail_custom_media` from `localStorage`.
2. Ensure Firestore security rules grant subcollection deletion under `match /media/{document=**}`.
3. For a complete system reset, utilize the "Purge All Catalog Listings (0 Lots)" button in the Admin Panel.

### Subcollection Permission Denied Errors
Ensure `firestore.rules` includes:
```groovy
match /media/{document=**} {
  allow read: if true;
  allow write, delete: if request.auth != null;
}
```

### YouTube Thumbnail 404s
Ensure valid 11-character video IDs or URLs are used. The application automatically filters out non-matching strings to prevent failed thumbnail asset requests.
