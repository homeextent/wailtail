# Wailtail Collector Car Auction Platform

Wailtail is a modern, Bring-a-Trailer style vehicle auction platform designed for curated classic, collector, and enthusiast cars. It features clean Canadian CAD financials, soft-close anti-sniping protection, real-time bidding telemetry, rich editorial showcase chapters, and a multi-car vehicle catalog architecture.

---

## 1. System Architecture

### Frontend & Application Stack
- **Framework**: React 19 + TypeScript + Vite
- **Progressive Web App (PWA) & Offline Caching**: `vite-plugin-pwa` with standalone Web Manifest (`#0f172a` theme), Workbox `StaleWhileRevalidate` caching for scripts/styles, and `NetworkFirst` runtime caching for Firebase Storage assets
- **FCM Web Push Notification Engine**: Firebase Cloud Messaging (FCM) Web Push with root-scoped background service worker (`/firebase-messaging-sw.js`), VAPID key token exchange (`VITE_FIREBASE_VAPID_KEY`), race-condition safe hook lifecycle (`usePushNotifications.ts`), safe Firestore token merge persistence (`users/{uid}` and `bidders/{uid}` via `setDoc` with `{ merge: true }`), and diagnostic error state reporting
- **Dynamic Promotional Campaign Subsystem**: Launch promotional engine featuring low-inventory catalog card injection (`VehicleCatalogGrid.tsx`), direct-lot header notification banners (`AuctionHeader.tsx`), dynamic CTA action routing (`consignment_modal`, `auth_modal`, `contact_modal`, `external_url`), audience segmentation (`all`, `guests_only`, `authenticated_only`), date window scheduling, and client dismissal tracking (`wailtail_dismissed_promos`)
- **Decoupled Guest Telemetry Engine (`promo_analytics`)**: Decoupled click tracking recording atomic `increment(1)` writes directly into `promo_analytics/{promoId}`, eliminating 403 Forbidden errors for unauthenticated guests while keeping campaign settings securely restricted to administrators
- **Routing & Navigation**: Client-side full-page routing supporting multi-car catalog (`/` & `/catalog`), single-car lot details (`/auctions/[id]`), full-page admin portal (`/admin`), and dedicated split-screen authoring workspace (`/dashboard/listings/[id]/edit`)
- **Tri-Role Access Control**: 3-way role hierarchy (`ADMIN`, `SELLER`, `BIDDER`) governing access privileges across administration, authoring, and bidding surfaces
- **5-Tab Admin Command Portal**: Dedicated operations suite (`AdminPortalPage.tsx`) covering Member Directory (formerly Bidder Registry), Consignment Applications, Vehicle Inventory & Lots, Live Bids Telemetry Ledger, and Platform Branding (with Promotional & Launch Campaign Manager)
- **Multi-Select Bulk Action Engine**: Checkbox selection system with floating action toolbar and safe 150-item batch chunking for status mutations and bulk deletions
- **Authentication Security & Session Defense**: Multi-layer security in `AuthContext.tsx` and `AuthModal.tsx` featuring real-time orphaned session revocation guards (auto-`signOut` and toast notice when user document is deleted), post-signup auto-logout, login blocking for unverified sessions, and deferred welcome email dispatch
- **Catalog Status Predicate Normalization**: Exported pure predicates (`isLive`, `isUpcoming`, `isEnded`) ensuring all draft, preview, and scheduled lots are counted cleanly
- **Styling**: Tailwind CSS with custom editorial typography and layout scales
- **Icons**: Lucide React
- **Taxonomy Engine**: Curated 80+ collector vehicle dataset (`src/data/vehicleTaxonomy.json`) powering a reactive 3-tier dependent selection pipeline (Year $\rightarrow$ Make $\rightarrow$ Model $\rightarrow$ Generation / Chassis Code)
- **State & Synchronization**: Real-time Firestore snapshot listeners (`onSnapshot`) with dynamic user profile synchronization (`subscribeToUserProfile`) and optimistic UI state hydration

### Serverless & Cloud Infrastructure
- **Serverless User Deletion (`api/admin-delete-user.ts`)**: Vercel serverless function leveraging `firebase-admin` SDK with ESM interop resolution (`(admin as any).default || admin`) and private key newline unescaping (`replace(/\\n/g, '\n')`) to securely purge user identities from Firebase Authentication (`admin.auth().deleteUser(uid)`), with self-deletion guards and Firestore batch document purging.
- **Serverless Email Proxy (`api/send-consignment-email.ts`)**: Multi-template Vercel serverless function dispatching structured and dual-branded HTML notifications for consignment intake (`type: 'consignment'`), private buyer inquiries (`type: 'inquiry'`), seller consignment intake receipts (`type: 'consignment_receipt'`), and newly verified bidder welcomes (`type: 'welcome_bidder'`) via Resend API (with SendGrid fallback). Equipped with actionable 1-click triage deep links (`/admin?tab=consignments&id=${appId}&action=approve|reject`).
- **Serverless YouTube Ingestion (`api/youtube-playlist.ts`)**: Server-side XML RSS Atom feed fetcher bypassing client CORS restrictions for 1-click YouTube playlist chapter auto-import.
- **Firebase Cloud Storage Asset Pipeline**: Direct Storage URL streaming (`uploadImageToStorage`) with client-side canvas micro-compression (`compressImageDataUrl`) and a 900KB serialized payload size cap in `saveMediaConfig()`.
- **Firebase CLI Named Database Deployment**: `firebase.json` mapping bound explicitly to named database instance `ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e`, `.firebaserc` project binding (`studio-apps-483721`), and terminal deployment pipeline (`npm run deploy:rules`) executing direct rules deployment via `firebase-tools`.

### Firebase Backend Services
- **Cloud Firestore**:
  - `auctions`: Core vehicle documents containing specs, financials, taxonomy generations, and lifecycle status.
  - `auctions/{auctionId}/media/{document=**}`: Recursive wildcard subcollection matching for media configurations, images, chapters, and assets.
  - `bids`: Real-time bidding telemetry with anti-sniping timestamp verification and Option B soft retraction audit fields (`status`, `retractedAt`, `retractionReason`, `retractedBy`, `retractedByName`).
  - `comments`: Community Q&A feed with verified seller and administrator official nested replies.
  - `users` / `bidders`: User profiles containing tri-role hierarchy (`ADMIN`, `SELLER`, `BIDDER`), ban statuses, email verification flags, personal saved vehicle lot arrays (`watchlist`), and registered FCM Web Push notification tokens (`fcmTokens`).
  - `settings/promotions`: Promotional campaign configurations, catalog card definitions, and lot header banner settings locked to admins.
  - `promo_analytics`: Decoupled guest click telemetry collection recording public atomic `increment(1)` interactions.
  - `consignment_applications` / `consignments`: Intake inquiries capturing structured locations (`locationCity`, `locationProvince`, `locationCountry`), member auto-link references, conversion statuses, and cascading deletion links.
  - `inquiries`: Direct private communications with consignors.
- **Firebase Cloud Storage**: Vehicle photo and inspection document pipeline streaming assets directly to Storage buckets via `uploadImageToStorage` and storing lightweight HTTPS URLs in Firestore to bypass document size limits.
- **Firebase Cloud Messaging (FCM)**: Native Web Push notification engine dispatching live outbid alerts and auction lifecycle events via root-scoped background service worker (`/firebase-messaging-sw.js`) with VAPID token exchange (`VITE_FIREBASE_VAPID_KEY`) and multi-device Firestore token merge synchronization.
- **Firebase Authentication**: Email/password and Google OAuth authentication with email verification flags.
- **Firebase Security Rules**: Role-based access control protecting administrative actions, campaign settings, and auction modifications (`firestore.rules`).

### Repository Directory Structure
```
.
├── .firebaserc                         # Firebase CLI default project binding (studio-apps-483721)
├── firebase.json                       # Firebase CLI configuration mapping firestore.rules to named database instance
├── api/
│   ├── admin-delete-user.ts        # Serverless Firebase Admin user authentication identity deletion endpoint
│   ├── send-consignment-email.ts   # Serverless multi-template email dispatcher (consignments, receipts, welcomes, inquiries) via Resend API
│   └── youtube-playlist.ts         # Serverless CORS proxy for YouTube RSS playlist ingestion
├── firestore.rules                     # Production Firestore security rules & RBAC helper functions
├── public/
│   ├── firebase-messaging-sw.js        # Background Service Worker for FCM Web Push outbid alerts
│   └── icons/                          # PWA maskable application icons (192x192 & 512x512)
├── src/
│   ├── components/
│   │   ├── AdminPanelModal.tsx         # Secondary host operations drawer
│   │   ├── AdminPortalPage.tsx         # Full-page /admin operations portal & user moderation
│   │   ├── AuctionHeader.tsx           # Sticky/hero auction title, anti-snipe countdown, and lot-level Watch/Share actions
│   │   ├── AuthModal.tsx               # Firebase email/password & Google OAuth modal
│   │   ├── BidModal.tsx                # Real-time anti-snipe CAD bid submission dialog
│   │   ├── CatalogCard.tsx             # Multi-lot catalog vehicle card with dynamic hero resolution
│   │   ├── CommentSection.tsx          # Public Q&A thread with verified seller/admin replies
│   │   ├── ConsignmentModal.tsx        # 3-tier taxonomy consignment intake & member auto-link
│   │   ├── ContactSellerModal.tsx      # Private buyer-to-consignor direct communication
│   │   ├── Footer.tsx                  # Platform legal and footer navigational elements
│   │   ├── HeroMediaCarousel.tsx       # Scoped hero photo carousel with isolated lightbox viewer
│   │   ├── InlineShowcaseSection.tsx   # Editorial showcase narrative chapters and specs
│   │   ├── ListingEditorWorkspace.tsx  # Split-screen authoring workspace (/dashboard/listings/[id]/edit)
│   │   ├── ListingSubNav.tsx           # In-page listing section anchor sub-navigation
│   │   ├── Navbar.tsx                  # Header navigation, brand logo, non-clipping user profile dropdown, and auth triggers
│   │   ├── PhotoGalleryGrid.tsx        # Categorized photo gallery with 8-photo mobile truncation & PDF viewer
│   │   ├── ShareModal.tsx              # Social share dialog with instant link copying
│   │   ├── ShowcaseChaptersEditor.tsx  # Curated editorial chapter management workspace
│   │   ├── SpecCardCombobox.tsx        # Context-aware searchable hybrid attribute combobox
│   │   ├── StickyBidBar.tsx            # Floating mobile/desktop bid CTA with live high bid
│   │   ├── UserAccountHubModal.tsx     # Unified role-aware activity hub, Watchlist, & Outbid Notification panel
│   │   ├── VehicleCatalogGrid.tsx      # Primary multi-car inventory catalog homepage (/)
│   │   ├── WailtailLogo.tsx            # SVG brand asset rendering
│   │   └── YouTubePlaylistSection.tsx  # Driving chapters video embed & playlist timeline
│   ├── context/
│   │   └── AuthContext.tsx             # Firebase auth provider & role management
│   ├── data/
│   │   └── vehicleTaxonomy.json        # Curated 80+ collector vehicle make/model/chassis dataset
│   ├── hooks/
│   │   └── usePushNotifications.ts     # FCM Web Push subscription, VAPID token exchange, & permission hook
│   ├── services/
│   │   ├── auctionService.ts           # Core Firestore transactions, moderation, & bidding engine
│   │   ├── emailService.ts             # Consignment email client dispatcher
│   │   └── firebase.ts                 # Firebase app, db, auth, storage, and messaging initialization
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
   - **Catalog Status Predicate Normalization**: Exported helper predicates (`isLive`, `isUpcoming`, `isEnded`) in `VehicleCatalogGrid.tsx` ensuring draft, preview, and scheduled lots count cleanly under the Upcoming filter, guaranteeing zero uncounted or dropped inventory lots.
6. **Dedicated Listing Authoring Workspace (`/dashboard/listings/[id]/edit`)**:
   - Split-screen workspace with live public preview pane (desktop and mobile viewports).
   - 7 listing sections: Vehicle Identity, Editorial Narrative, Single-Source Technical Specifications, Showcase Chapters (01-04), Hero & Categorized Photo Gallery, YouTube Driving Videos, and CAD Financial Rules.
   - 100% blank draft isolation with nullish coalescing defaults (`$0 CAD` No Reserve).
7. **Full-Page Admin Operations Portal (`/admin`)**:
   - Role-gated full-screen dashboard (`AdminPortalPage.tsx`) featuring 5 administrative command tabs: Member Directory (formerly Bidder Registry), Consignment Applications, Vehicle Inventory & Lots, Live Bids Telemetry Ledger, and Platform Branding.
   - **Member Directory Management**: Paginated directory querying across all users with name, email, and UID filtering, plus a role dropdown filter (`ALL`, `ADMIN`, `SELLER`, `BIDDER`) and expandable bid history accordions.
   - **5th Admin Tab (Vehicle Inventory & Lots)**: Full-width inventory management suite with live CAD high bid tracking, status filter tabs (`All`, `Draft`, `Preview`, `Upcoming`, `Live`, `Ended`), real-time search, row-level workspace launch links, and lot deletion triggers.
   - **Multi-Select Bulk Action Engine**: Checkbox selection engine with floating action toolbar supporting batch status changes, bulk approvals/rejections, and batch deletions chunked safely into 150-item sets for Firestore batch write reliability.
   - **Cascading Deletion Controls**: Atomic service methods in `auctionService.ts` (`batchDeleteAuctions`, `batchDeleteConsignments`, `deleteListing`, `deleteConsignmentApplication`) preventing orphaned records across auctions and consignment submissions.
   - **1-Click Email Triage Deep-Links**: Actionable email CTAs (`/admin?tab=consignments&id=${appId}&action=approve|reject`) in `api/send-consignment-email.ts` with auto-filtering, modal surfacing, and history cleanup in `AdminPortalPage.tsx`.
   - Atomic moderation controls: 3-way role switching (`ADMIN` $\leftrightarrow$ `SELLER` $\leftrightarrow$ `BIDDER`), ban/unban toggling, email verification override, and permanent user deletion (`deleteUserRecord` delegating to `/api/admin-delete-user` for Auth identity deletion prior to Firestore document purging).
   - 1-click consignment intake approval & draft conversion (`convertConsignmentToDraftListing`) promoting consignors to `SELLER` and auto-generating vehicle listings.
8. **Unified User Account Activity Hub & Notification Center (`UserAccountHubModal.tsx`)**:
   - Global activity hub accessible to registered users directly from the navigation bar.
   - Dedicated **Saved Watchlist Tab** displaying user-saved vehicle lots (`UserProfile.watchlist`) with live anti-snipe countdown timers, CAD current high bids, reserve status badges, and inline removal (`toggleWatchlistLot()`).
   - **Notification Control Panel**: Provides an "Enable Live Outbid Alerts" toggle switch, real-time browser permission badges (`Active`, `Blocked`, `Disabled`), and iOS Safari PWA installation instructions.
   - Real-time bid telemetry with `★ LEADING` and `⚠️ OUTBID` indicators and quick bid prompts.
   - 4-stage Canadian offline CAD settlement checklist for won auctions (Wire/Draft, Title Transfer, Transport/Collection, VIN Handover) with direct seller contact credentials.
   - Seller lot inventory telemetry and consignment submission status tracking.
   - Real-time Firestore user profile listener (`subscribeToUserProfile`) synchronizing role modifications, watchlist state, and FCM push tokens instantly across the UI.
9. **Lot-Level Watch & Share Controls (`AuctionHeader.tsx`)**:
   - Contextual "Watch" and "Share" action controls relocated from the global navigation bar directly into the auction lot header.
   - Interactive "★ Watch" / "★ Watching" button dynamically bound to `toggleWatchlistLot()`, toggling saved status across Firestore user profiles and syncing aggregate watch counts.
   - "🔗 Share" action copying canonical lot URLs directly to the system clipboard with instant high-visibility toast notifications.
10. **Multi-Template Serverless Email Dispatcher & Dual-Branded Notifications (`api/send-consignment-email.ts`)**:
    - Multi-template serverless proxy handling vehicle consignment intake submissions (`type: 'consignment'`), private buyer inquiries (`type: 'inquiry'`), seller consignment receipts (`type: 'consignment_receipt'`), and verified bidder welcomes (`type: 'welcome_bidder'`) via Resend API (with SendGrid fallback).
    - Consignment applications compile 3-tier taxonomy, VIN, mileage, transmission, and structured location fields (`locationCity`, `locationProvince`, `locationCountry`) with Option A registered member auto-linking.
    - Private buyer inquiries generate structured HTML digest tables compiling inquirer contact details, inquiry topic, target lot title, and message text, dispatched with client error isolation.
    - Dual-branded HTML templates provide polished buyer onboarding guidelines and official seller application receipts with direct deep links.
11. **Terminal Firebase Security Rule Deployment Infrastructure**:
    - Direct rules deployment via `firebase.json` mapping to named database instance `ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e`, `.firebaserc` project binding (`studio-apps-483721`), and `"deploy:rules": "firebase deploy --only firestore:rules"` script in `package.json`.
    - Allows developers to deploy synchronized production `firestore.rules` directly from the terminal via `npm run deploy:rules` with zero drift.
12. **Hero Media Carousel & Scoped Lightbox Viewer (`HeroMediaCarousel.tsx`)**:
    - **Lightbox Dataset Isolation**: Hero lightbox modal state is scoped strictly to `heroImages`, resolving index mismatch bugs with the full categorized photo gallery archive.
    - **Mobile Viewport Optimization**: Removed cluttering overlays on mobile screens (`hidden sm:flex` for "Fullscreen Lightbox", `hidden sm:block` for bottom photo count bar).
    - **Ergonomic CTA Layout**: Relocated "Watch Video Playlist" button directly beneath the hero thumbnail strip on mobile (`sm:hidden`).
    - **Gestures & Zoom**: Supports touch swipe cycling (`onTouchStart`, `onTouchEnd`), full keyboard navigation (`Escape`, `ArrowLeft`, `ArrowRight`), and toggleable image zooming.
    - **Media Pending Fallback**: Neutral dark placeholder (`bg-zinc-900 border border-zinc-800 rounded-xl`) with a camera icon when no imagery is configured.
13. **Mobile Photo Gallery Truncation & Lightbox Swiping (`PhotoGalleryGrid.tsx`)**:
    - **8-Photo Initial Grid**: Capped initial mobile thumbnail display to an 8-photo grid (2x4) governed by `isMobileExpanded` state to prevent mobile DOM bloat and scroll fatigue.
    - **Expansion Controls**: High-contrast "Show All [X] Photos" and "Collapse Gallery" toggle button on mobile.
    - **Unbroken Lightbox Swiping**: Opening the lightbox modal from any truncated thumbnail grants access to all categorized vehicle images (`validImages.length`) with smooth touch swipe gestures.
14. **Progressive Web App (PWA) & FCM Web Push Notification Engine**:
    - **Vite PWA Plugin (`vite.config.ts`)**: Built with `vite-plugin-pwa` supporting `registerType: 'autoUpdate'`, standalone web manifest ("Wailtail Auctions", short name "Wailtail", Slate-900 `#0f172a` theme, `#020617` background), and 192x192 / 512x512 maskable PWA icons.
    - **Workbox Offline Caching**: Dual-strategy caching with `StaleWhileRevalidate` for app scripts, styles, and workers (30-day ceiling) and `NetworkFirst` (3s timeout, 7-day ceiling) for Firebase Storage vehicle imagery and Firestore data.
    - **Root-Scoped Background Service Worker (`public/firebase-messaging-sw.js`)**: Registered at root scope (`/`) with explicit `self.registration.showNotification()` handlers listening for `onBackgroundMessage` and native `push` events to trigger background OS desktop toasts and mobile notifications. Handles `notificationclick` client matching and active window focus/navigation (`clients.openWindow('/')`).
    - **Race-Condition Safe Hook Lifecycle (`src/hooks/usePushNotifications.ts`)**: Explicitly awaits `navigator.serviceWorker.ready` before push subscription and `getToken()` execution, guaranteeing the worker is active. Coordinates VAPID token exchange (`VITE_FIREBASE_VAPID_KEY`), browser permission tracking (`NotificationPermission`), and iOS Safari PWA standalone installation checks.
    - **Safe Firestore Token Merge Persistence**: Utilizes `setDoc(doc(db, 'users', user.uid), { fcmTokens: arrayUnion(token) }, { merge: true })` (and synchronized `bidders/{uid}.fcmTokens`) to prevent document-missing exceptions when saving or deleting tokens.
    - **Diagnostic FCM Error State Reporting**: Employs structured `[FCM Setup]` console tracing and high-visibility monospace diagnostic callout cards in `UserAccountHubModal.tsx` for surfacing raw FCM error codes and missing environment configuration.
15. **YouTube Video Series & Thumbnail URL Sanitization**:
    - Validates 11-character video IDs using regex (`/^[a-zA-Z0-9_-]{11}$/`).
    - Prevents 404 network errors in DevTools by only generating `mqdefault.jpg` URLs for validated IDs.
16. **Bulk Purge & Cache Sanitization**:
    - `purgeAllListings()` atomic deletion engine cleanses Firestore documents, media subcollections, and `localStorage` cache.
17. **Option B Administrative Soft Bid Retraction & Cascading Deletion Engine**:
    - **Soft Bid Retraction Audit Trail (`retractBid` in `auctionService.ts`)**: Retracted bids are never deleted from Firestore. Records are preserved with `status: 'retracted'`, `retractedAt`, `retractionReason`, `retractedBy`, and `retractedByName` to maintain an immutable, legally defensible audit trail.
    - **Atomic Telemetry Recalculation**: Executed within a Firestore transaction, `retractBid()` recalculates `currentBid`, `bidCount`, `highBidder`, and reserve met status across remaining active bids in real time.
    - **Moderation Dialog & Member Bid Ledger (`AdminPortalPage.tsx`)**: Interactive modal requiring explicit administrative justification before retraction, expandable member bid history accordions in the Member Directory, and visual strike-through styling with hoverable audit popovers in the Live Bids Telemetry Ledger.
    - **Human-Readable Moderator Resolution (`getAdminIdentifier()`)**: Automatically resolves raw administrator UIDs to human-readable identities across staff rosters and active sessions.
    - **Cascading Lot Deletions & Orphaned Bid Moderation**: 400-item chunked batch writes in `deleteListing()` and `batchDeleteAuctions()` eradicate parent listings, child media subcollections, settings documents, and bid records below Firestore's 500-operation ceiling. Orphaned bids from legacy lots surface an amber `ORPHANED BID (LOT DELETED)` fallback badge and remain safely retractable without missing document errors.
18. **Dynamic Launch Promotional Subsystem & Decoupled Telemetry Engine**:
    - **Low-Inventory Promo Injections (`VehicleCatalogGrid.tsx`)**: When catalog vehicle counts are sparse ($\le 2$ lots), the catalog automatically injects responsive promotional cards into empty grid slots to maintain editorial richness.
    - **Direct-Lot Promotional Banners (`AuctionHeader.tsx`)**: Delivers contextual top banners on deep-linked single-car lot pages with custom badges, action CTAs, and client dismissal tracking (`wailtail_dismissed_promos`).
    - **Centralized Campaign Control Suite (`AdminPortalPage.tsx`)**: Real-time management interface under Platform Branding featuring master switches, card creation, CTA routing (`consignment_modal`, `auth_modal`, `contact_modal`, `external_url`), audience segmentation (`all`, `guests_only`, `authenticated_only`), and date window scheduling.
    - **Promo Card Image Asset Uploader**: Supports image URLs and local image file uploads with canvas micro-compression (`compressImageDataUrl`) and Firebase Cloud Storage streaming (`uploadImageToStorage`), rendering responsive `aspect-[16/9]` media banners on promo cards.
    - **Decoupled Guest Telemetry (`promo_analytics`)**: Decouples click logging from admin-restricted settings into `promo_analytics/{promoId}` using atomic `increment(1)` writes. Grants public guest click logging without 403 Forbidden security exceptions while keeping campaign settings securely restricted to administrators.
19. **Serverless User Deletion & Session Defense Architecture (`/api/admin-delete-user.ts`, `AuthContext.tsx`)**:
    - **Serverless User Identity Deletion**: Dedicated `/api/admin-delete-user.ts` endpoint utilizing `firebase-admin` with ESM interop resolution (`(admin as any).default || admin`) and private key newline unescaping (`replace(/\\n/g, '\n')`) to securely delete Firebase Authentication identities (`admin.auth().deleteUser(uid)`), with self-deletion guards and non-blocking `auth/user-not-found` handling.
    - **Orphaned Session Revocation Guard**: `AuthContext.tsx` integrates both initial auth hydration verification and a live `onSnapshot` listener on `users/{uid}`. If an account is purged by an administrator, the session is instantly revoked (`signOut(auth)`), local state is wiped, an informative toast surfaces (`"This account has been deleted by an administrator."`), and the user is redirected to `/`.
    - **Strict Email Verification Enforcement**: Auto-logout post-signup prevents unverified access, unverified sign-in attempts are blocked across `AuthModal.tsx` and `AuthContext.tsx`, and `welcome_bidder` email dispatch is deferred until email verification is confirmed.

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

### Environment Configuration Requirements

The application relies on the following environment variables (configured in `.env.local` or host dashboard):

| Environment Variable | Requirement | Description |
| :--- | :--- | :--- |
| `VITE_FIREBASE_VAPID_KEY` | **Required** (Web Push) | Public Web Push VAPID key used by `getToken()` in `src/hooks/usePushNotifications.ts` to register FCM push notification subscriptions. |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | **Required** (Serverless Admin User Deletion) | JSON-serialized Firebase service account key credentials used by `/api/admin-delete-user.ts` for administrative user deletion. |
| `RESEND_API_KEY` | **Required** (Email Dispatch) | Secret API key for Vercel serverless email dispatch via Resend (`/api/send-consignment-email.ts`). |
| `GEMINI_API_KEY` | Optional | API secret for Gemini AI narrative assistance. |
| `APP_URL` | Optional | Deployment host URL used for self-referential links, OAuth callbacks, and API routing. |


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
