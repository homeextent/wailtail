# Wailtail Auction Platform — System Bible & Architectural Specification

## Auction Security Gate implementation checkpoint

PR #3 was independently accepted at head `293ffbb` and merged into `staging` on November 7, 2026 as `1bf4d6a`. The merge tree matches the reviewed head; post-merge CI and Vercel preview passed. The staging security integration milestone is complete. Production release and Firebase rules publication require a separate decision. The Phase 1 Verified Boutique Dealer Program milestone definitions remain in Section 11.

### Development workflow and worktree lifecycle

- `staging` is the integration branch; `main` is the production branch. Begin a focused task branch from clean, synchronized staging and submit a PR back into staging. Production promotion and Firebase rules publication require separate authorization.
- Directory names, checked-out branches and detached commits are distinct. Inspect `git status -sb`, `git branch --show-current` and `git worktree list` before edits, switching, moving or cleanup. Never treat a named folder as proof of its branch.
- The owner's active linked worktree is `wailtail-staging`. Its primary repository is `wailtail-auction`, which retains the shared Git metadata, objects, refs and stash. Keep the primary repository while linked worktrees depend on it; it is not necessarily checked out on `main`.
- Use `git worktree move` with absolute source and destination paths, after stopping processes and closing that workspace. `git -C` changes the base for relative destinations. Do not move or delete linked worktrees through the file manager.
- Preserve uncommitted edits and unique commits before cleanup. Inspect ignored filenames as well as normal status. Store credential-bearing backups outside Git with restricted permissions. Verify source archives and any Git bundles before removal. Force removal is reserved for the specific archived worktree after preservation checks; never force-push or discard unrelated changes.
- Use guarded demo emulators for routine mutation acceptance. The normal Vite server is not isolated from the configured Firebase project and needs its API backend. The cloud project `wailtail-stage3-test` is retained for separately controlled real-cloud Storage verification, not routine local feature work.

The repeatable setup, preview, archive and recovery procedures are in [Local development and worktree housekeeping](docs/local-development.md). Owner-specific locations there are a dated local inventory, not application configuration or universal paths. Retired worktrees do not imply deletion or merging of their GitHub branches. PR #2 and production Storage cutover remain separate from this completed staging milestone.

### Trusted application paths

- Seller discovery, draft reads, narrative and media edits, submission, and administrator-requested revisions use verified Firebase identity, assigned seller UID, draft state and revision checks. Submission records its review event in the same transaction. A submitted draft is read-only for the seller.
- Deployment has a single entry point at `api/router.ts`. Handler implementations and Firebase Admin helpers live under `server/api/` and are imported through a fixed allowlist. `vercel.json` routes `/api/<endpoint>` to this function before the SPA fallback, preserving existing HTTP paths and per-handler method, identity and authorization checks. Unknown API routes return JSON 404. The function has a 60-second execution budget. The browser emulator harness exercises the same router. Server module imports use explicit `.js` paths, and a compiled native Node regression test verifies all handler imports independently of the TypeScript development loader.
- Public catalog and lot detail use `/api/public-auctions`, with explicit field lists for auctions, media, bids and comments. Drafts and pending-review lots are excluded. Reserve amounts, seller contact information, bidder emails and other viewers' author IDs and votes stay private. Catalog and public settings poll every 30 seconds; lot detail polls every five seconds. Hidden tabs abort and suspend requests, refresh immediately on return, and unsubscribe on navigation. Administrator inventory and editor reads retain canonical access.
- Bid placement, administrator inventory creation, edits, bulk status changes, deletion, media saves and published image uploads use trusted endpoints. Mutations derive caller authority from revocation-aware token verification and the designated administrator allowlist where applicable. Bid placement preserves the two-minute soft close and writes the auction, both bid histories, a bid comment and notification records together.
- Comment authorship, edits, deletion, votes and pinning use server validation. Retraction uses the verified administrator identity, preserves both bid-history records, and recalculates the next active bid within the transaction. Post-settlement retraction requires separate review.
- Duplication reads the saved source and media on the server and creates a draft with cleared bidding, watch and settlement state. Bid reset removes only the selected lot's root and nested bids and bid comments, preserving ordinary comments and other auctions. Reset and deletion stop before any writes if the records exceed the bounded transaction. Reset of finalized sales requires separate review.
- Administrator settlement and `/api/auction-clock` use the server clock and canonical bid records. The public clock request accepts only an auction ID. It can start a scheduled lot when due or settle an expired lot. Settlement and its winner notification are recorded together, with repeat and concurrent requests checked transactionally.

### Workers and notifications

`GET /api/reconcile-auction-clock` accepts only the configured `CRON_SECRET` bearer token. It advances up to 25 due lots per invocation using the same clock and settlement logic. This worker requires a scheduler invocation after deployment. The countdown also invokes the public clock endpoint while a lot page is open.

Bid confirmations, outbid alerts and winner notifications are written to private `auctionNotificationOutbox` records. `GET /api/dispatch-auction-notifications` requires `CRON_SECRET` and `RESEND_API_KEY`. It fairly selects up to ten fresh or due-retry records per invocation and submits them concurrently to Resend using persisted recipients, sender and message content with a stable idempotency key. Records are marked `accepted` only after provider acceptance is confirmed. Provider errors and failed acknowledgements can be retried with the same payload. Transactional two-minute claims prevent concurrent workers from sending the same active attempt and allow interrupted workers to recover. Attempts and next eligibility are persisted, with exponential backoff from one minute capped at one hour. At most 24 attempts are allowed within 23 hours of creation, staying inside the provider's 24-hour idempotency retention. Invalid, exhausted or expired records are retained as `reconciliation_required` for operator review, with no automatic replay outside that boundary. Provider acceptance does not establish inbox delivery.

At release, configure a recurring caller for both workers and confirm `RESEND_FROM_EMAIL` uses an authorized sender. Set `FIREBASE_STORAGE_BUCKET` for trusted uploads. Scheduler invocation, actual provider credentials and delivery to an approved test mailbox remain operational acceptance items. Existing `mail`, `emails` and `emailLogs` records are outside the new notification worker.

### Verification and boundaries

CI verifies build and TypeScript checks, lint, endpoint regression tests, Firestore rules, native Node module loading, integrated Auth/Firestore/Storage workflows and headless Chrome. Coverage includes signed-out catalog and lot rendering, authenticated watch and inquiry controls, global branding persistence and seller narrative save/reload. Emulator assertions cover gallery order, video chapters, showcase edits, protected field continuity, private inquiry identity, notification deduplication, failed transactions and administrator permissions. Exact-commit CI and deployed preview evidence is recorded in PR #3.

The legacy compatibility audit is implemented. Watchlists and bounded own-account activity now use `/api/auction-member-actions`; no member reads canonical auction or bid collections directly. Private inquiries derive identity and recipient on the server, save inquiry and notification atomically, reject banned accounts and enforce a per-member interval. Legacy inquiry/bid-email dispatch is retired; administrative legacy notifications require verified designated-administrator authority. Public branding uses `/api/public-settings` with only `siteLogo`, `siteName` and `siteTagline`. Global settings and promotions remain administrator-write scoped. Platform uploads use create-only trusted Storage writes under `auctionPublic/common/`.

Broad catalog purge, legacy bidder purge, one-click consignment conversion and client-written promotion counters are deliberately disabled in this staging revision. New draft creation, selected-listing deletion, member bans and audited bid retractions remain available. Promotion counters are frozen; they are not a release prerequisite. Staging acceptance is bounded by these explicit exclusions rather than by implementing a broad purge or the planned dealer consignment-conversion milestone. See `docs/stage3-staging-acceptance.md`.

Recurring worker invocation, credentials and actual mailbox delivery remain operational deployment acceptance items. Storage migration, legacy PDF token revocation, production rules publication and demo cleanup remain separate production operations. Original M2.0A/M2.0B and dealer milestone history is preserved below.

## 1. Executive Architecture Overview

**Wailtail** is an enterprise-grade, multi-car private auction platform modeled after Bring-a-Trailer, engineered specifically for high-value collector automobiles. The platform supports multiple concurrent active and upcoming vehicle listings simultaneously, combining real-time bidding synchronization with editorial-grade vehicle storytelling, per-lot media configuration, multi-category gallery management, and a dedicated multi-listing authoring workspace.

### Technology Stack
* **Frontend Framework**: React 19 with TypeScript and Vite
* **Progressive Web App (PWA) & Offline Engine**: `vite-plugin-pwa` with Workbox runtime caching (`StaleWhileRevalidate` for scripts/styles, `NetworkFirst` for media/queries) and standalone Web Manifest (`name: "Wailtail Auctions"`, `short_name: "Wailtail"`, `#0f172a` theme)
* **Static Open Graph & Twitter Card Social Metadata (`index.html`)**: Pre-rendered Open Graph (`og:site_name`, `og:type`, `og:title`, `og:description`, `og:url`, `og:image`, `og:image:secure_url`, `og:image:type`, `og:image:width`, `og:image:height`, `og:image:alt`) and Twitter Card (`twitter:card`, `twitter:site`, `twitter:creator`, `twitter:title`, `twitter:description`, `twitter:image`, `twitter:image:alt`) tags in `index.html` targeting canonical domain (`https://www.wailtail.com/`), the generic platform social asset (`public/og-wailtail-platform.jpg`), and overarching platform branding ("Canada's Digital Vehicle Auctions | Buy & Sell in CAD"); guarantees 100% social preview card rendering for web crawlers (`facebookexternalhit`, X, WhatsApp, iMessage) without edge SSR or client-side JavaScript execution overhead
* **Branding & Favicon Delivery (`public/favicon.svg`, `index.html`)**: Standalone canonical whale-tail vector SVG asset delivered via `/favicon.svg?v=2` cache-busting query parameter in `index.html`, ensuring high-contrast browser tab rendering across light/dark OS chrome and bypassing aggressive Chromium / WebKit tab favicon caching
* **Background Push Service Worker & FCM**: Native background Service Worker (`public/firebase-messaging-sw.js`) utilizing Firebase compat SDKs and Firebase Cloud Messaging (`firebase/messaging`) Web Push API with VAPID key token exchange
* **Multi-Listing Architecture**: Dynamic catalog indexing with `/dashboard/listings/[id]/edit` dedicated workspace routing, `/admin` full-page portal, and multi-lot state hydration
* **Dynamic Dual-Slot Promotional & Cadence Engine**: Multi-surface campaign system featuring dual-slot independent announcement banners (full-bleed Catalog Homepage Ribbon and Direct-Lot Header Banner), admin-configurable catalog grid cadence injection (0, 6, 9, 12 lots with safe modulo cycling), low-inventory row padding ($\le 2$ lots), audience segmentation, date scheduling, image uploader, and deterministic admin-driven visibility (zero client-side `localStorage` dismissal suppression)
* **Decoupled Guest Telemetry Engine**: Atomic `promo_analytics/{promoId}` click counting using `increment(1)` writes, permitting public unauthenticated telemetry logging while securing campaign configuration
* **Google Analytics 4 (GA4) SPA Telemetry Engine**: `gtag.js` asynchronous bootstrap (`index.html`), reactive `document.title` pageview dispatching (`src/App.tsx`), `import.meta.env.DEV` development isolation, and collector conversion tracking (`src/utils/analytics.ts`)
* **Platform Feedback & Bug Reporting Pipeline**: Dynamic floating pill dock (`FloatingFeedbackWidget.tsx`) with mobile collision avoidance, category-driven feedback modal (`FeedbackModal.tsx`) with automatic client telemetry capture, dedicated `/feedback` Firestore collection, and serverless HTML email dispatch (`/api/send-consignment-email`) with dynamic category badges and mailto triage
* **Styling**: Tailwind CSS with custom editorial typographic scales
* **Real-Time Data Engine**: Google Cloud Firestore with snapshot listeners (`onSnapshot`)
* **Security & Auth**: Firebase Authentication & Firestore Security Rules (`firestore.rules`)
* **Host & Infrastructure**: Cloud Run containerized deployment, reverse proxied on port 3000
* **Serverless Edge Layer**: Vercel Serverless Functions (`/api/send-consignment-email`, `/api/youtube-playlist`, `/api/admin-delete-user`, `/api/ai-assistant` with Gemini 2.5 Flash)
* **Firebase Infrastructure & Named Database CLI Deployment**: `firebase.json` configuration binding explicitly to named database instance `ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e`, `.firebaserc` project binding (`studio-apps-483721`), synchronized production `firestore.rules`, and zero-drift terminal deployment pipeline via `npm run deploy:rules` (`firebase deploy --only firestore:rules`)

### 1.1 Platform Architecture & Routing Map

| Route / Surface | Component / Handler | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `/` & `/catalog` | `VehicleCatalogGrid.tsx` | Public | Multi-car vehicle catalog grid acting as primary homepage; features a full-bleed top announcement ribbon pinned flush beneath `Navbar.tsx`, live CAD bid telemetry, search, category filters (`All Lots`, `Live`, `Upcoming`, `Ended`) with normalized status predicates (`isLive`, `isUpcoming`, `isEnded`), and a unified promotional injection pipeline supporting low-inventory row padding ($\le 2$ lots) and admin-configurable grid cadence splicing ($> 2$ lots at 0, 6, 9, 12 intervals). |
| `/auctions/[id]` | `App.tsx` (Single Lot View) | Public | Focused single-car lot viewing with dynamic tab title hydration (`${auction.year} ${auction.make} ${auction.model} — Wailtail`), live anti-snipe countdown, direct-lot promotional header banner (`AuctionHeader.tsx`), sticky bid bar (`StickyBidBar.tsx`), hero carousel, showcase chapters, driving playlist, and public Q&A. |
| `/admin` | `AdminPortalPage.tsx` | `ADMIN` only | Full-page operations portal featuring 5 command suites: Member Directory / Member Directory Management (formerly Bidder Registry), Consignment Applications, Vehicle Inventory & Lots, Live Bids Telemetry Ledger, and Platform Branding (with real-time Promotional & Launch Campaign Manager). Features deep-link auth preservation (suspends route guard during `authLoading`, caches triage parameters in `sessionStorage` key `wailtail_pending_admin_deeplink`, prompts contextual login banner, and auto-restores to target triage modal upon sign-in), Multi-Select Bulk Action Engine, 1-click email triage deep-links (`/admin?tab=consignments&id=${appId}&action=approve|reject`), and cascading deletion controls. |
| `/dashboard/listings/[id]/edit` | `ListingEditorWorkspace.tsx` | `ADMIN`, `SELLER` | Dedicated split-screen authoring workspace with 60/40 reactive layout, desktop/mobile preview simulation, sticky 7-section progress stepper (`sticky top-16 self-start max-h-[calc(100vh-4.5rem)]`), Hagerty Canada valuation link integration, JSON schema import/export, role-gated administrative header tools (Import/Export JSON, + New Listing, and manual force-close overrides restricted to `ADMIN`), Section 1 required field error badges, seller lot dropdown filtering (`visibleAuctions`), and high-contrast ← Back to Dashboard navigation CTA button routing administrators to `/admin?tab=inventory` and sellers to `/` with the activity hub open. Features safe fallback route guarding that redirects `'new'`, missing, or unresolvable IDs to `/catalog` (or `/admin?tab=inventory`) with a "Listing lot not found" toast, eradicating runaway auto-creation loops. Integrates `PhotoGuideDrawer.tsx` within Section 5 for collector photography guidance and recommended shot lists (mirrored in `AdminPanelModal.tsx`). |
| User Activity Hub (Modal) | `UserAccountHubModal.tsx` | Authenticated | Global account activity modal accessible from top navigation; displays active bid telemetry (`LEADING` vs `OUTBID`), 4-stage offline CAD settlement checklist, seller lot telemetry, consignment status, and **Notification Control Panel** with "Enable Live Outbid Alerts" toggle and iOS Safari PWA installation guide. |
| Seller Social Marketing Kit (Modal) | `SocialPromoKitModal.tsx` | Authenticated (`ADMIN`, `SELLER`) | Decoupled global promotional modal enabling consignors and administrators to generate high-converting social graphics and enthusiast copy; managed via `App.tsx` root state (`isSocialKitOpen`, `socialKitAuction`) and triggered from `ListingEditorWorkspace.tsx` (top header), `UserAccountHubModal.tsx` (Seller Activity Hub), and `AdminPortalPage.tsx` (Vehicle Inventory table). |
| Platform Trust & Educational Guide (Modal) | `HowItWorksModal.tsx` | Public | Global educational modal providing tabbed guidance on "Buying on Wailtail" (0% buyer fees, 2-minute anti-sniping soft close, Pre-Purchase Inspections), "Selling on Wailtail" (retail enthusiast marketplace vs wholesale dealer clearinghouses, no 3rd-party inspector bottlenecks, no post-sale green/red light arbitration, direct private-party CAD wire settlement), and "Trust & Security" (zero-tolerance anti-shill defense, verified bidder identities, upfront transparency); accessible globally via `App.tsx` state (`isHowItWorksModalOpen`, `howItWorksTab`) and triggered from `Navbar.tsx` (desktop header and mobile menu), `Footer.tsx`, and contextual deep links. |
| Platform Legal Infrastructure (Modal) | `LegalModal.tsx` | Public | Tabbed modal dialog for platform Terms of Service (legally binding CAD bids, 0% buyer premium, 3-day direct offline settlement, as-is inspection disclaimers, consignor clean-title warranties) and Privacy Policy (PIPEDA compliance, winner disclosure, FCM token usage), triggered globally via `App.tsx` state (`isLegalModalOpen`, `legalModalTab`). |
| Consignment Intake & Seller Application (Modal) | `ConsignmentModal.tsx` | Public | Curation-gated seller submission modal with 3-tier vehicle taxonomy, client-side registered member detection banner (distinguished from legacy auto-link metadata), mandatory clickwrap agreement, and the contextual "Seller FAQ & Settlement Details" accordion directly addressing OMVIC dealer arbitration exemption, direct 100% CAD wire settlement before vehicle release, and consignor-provided photography with a secondary deep link to the Selling guide (`openHowItWorks('selling')`). |
| Global Footer | `Footer.tsx` | Public | Platform navigational footer presenting curated Canadian enthusiast vehicle auction copy, national tagline ("Consigning & Bidding Nationwide Across Canada 🇨🇦"), Legacy Marketplace link (https://marketplace.wailtail.com), direct vehicle submission inquiry trigger, "How It Works" educational modal trigger, Feedback & Bug Report trigger, and modal openers for Terms of Service and Privacy Policy. |
| Floating Feedback Dock | `FloatingFeedbackWidget.tsx` | Public | Ergonomic, dark slate floating pill anchored across all viewports with dynamic prompt label/badge support; features route-aware collision avoidance dynamically shifting on single lot views (`bottom-24 right-4`) to prevent obstruction of `StickyBidBar.tsx`. |
| Platform Feedback Modal | `FeedbackModal.tsx` | Public / Guest & Authenticated | Collector-grade dialog supporting 3 feedback categories (`bug`, `suggestion`, `general`), 10–1,500 character counter, auto-populated member contact credentials, and zero-friction client telemetry capture (URL, viewport dimensions, User Agent, UID/role) persisting to `/feedback` collection and dispatching via serverless email. |
| Background Service Worker | `public/firebase-messaging-sw.js` | Public / Worker | Standalone background service worker listening for FCM push messages (`onBackgroundMessage`), displaying native outbid, closing warning, and status notifications with deep linking and notification click focus. |
| `/api/send-consignment-email` | `server/api/send-consignment-email.ts` | Public / Serverless | Vercel serverless proxy endpoint dispatching structured HTML intake notifications via Resend API to platform administrators and dual-branded confirmation emails. |
| `/api/admin-delete-user` | `server/api/admin-delete-user.ts` | Verified designated administrator / Serverless | Server-authorized account deletion endpoint. Verifies a revocation-aware Firebase ID token, requires a verified designated administrator, rejects self-deletion and protected administrator targets, deletes the target Auth identity, then performs retryable server-side Firestore profile cleanup. |
| `/api/youtube-playlist` | `server/api/youtube-playlist.ts` | Public / Serverless | Vercel serverless proxy bypassing browser CORS to parse YouTube playlist XML Atom feeds into driving video chapters. |
| `/api/ai-assistant` | `server/api/ai-assistant.ts` | Authenticated (`ADMIN`, `SELLER`) / Serverless | Vercel serverless AI writing assistant and editorial synthesis engine leveraging Google Gemini 2.5 Flash with fallback candidate models, 4.5MB payload capacity, and 60-second execution budget. |

#### Reactive Document Title Synchronization (`src/App.tsx`)
The platform implements a centralized, reactive `useEffect` lifecycle hook in `App.tsx` that dynamically synchronizes `document.title` to the active application route and listing entity state, replacing legacy hardcoded fallbacks with structured branding:
- **Catalog Homepage (`/` & `/catalog`)**: Displays master branding `Wailtail — Curated Collector Car Auctions`.
- **Single Lot View (`/auctions/[id]`)**: Hydrates `${auction.year} ${auction.make} ${auction.model}${generation ? ' ' + generation : ''} — Wailtail` (e.g. *1988 Porsche 928 S4 — Wailtail*); if specific attributes are unresolved, falls back to `${auction.title} — Wailtail`, and gracefully falls back to the master catalog string (`Wailtail — Curated Collector Car Auctions`) while document queries are in-flight or undefined.
- **Admin Operations Portal (`/admin`)**: Synchronizes browser tab to `Admin Operations Portal — Wailtail`.
- **Listing Editor Workspace (`/dashboard/listings/[id]/edit`)**: Synchronizes browser tab to `Listing Editor: ${title} — Wailtail` (or `Listing Editor: Draft Listing — Wailtail`).
- **Route Teardown / Cleanup**: Effect unmount returns `document.title` cleanly to the default master catalog string.

### 1.2 Disaster Recovery & Backup Posture

To protect platform continuity, audit integrity, and high-value catalog transaction records against logical corruption, developer error, or infrastructure disaster, Wailtail implements a defense-in-depth recovery posture across 4 distinct layers:

| Layer | Protection Mechanism | Retention / Window | Recovery Objective / Scope |
| :--- | :--- | :--- | :--- |
| **Application Code** | Git / GitHub + Vercel Deployments | Continuous history | Instant rollbacks to previous immutable production deployment hashes. |
| **Database State (Logical Corruption)** | Cloud Firestore Point-in-Time Recovery (PITR) | 7-day continuous window | Microsecond-granularity database restoration against accidental bulk deletions, botched migrations, or data corruption on `ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e`. |
| **Cold Snapshots** | Firestore Scheduled Backups | 30-day retention | Automated daily cold snapshot exports stored in Google Cloud Storage for disaster recovery and long-term compliance audits. |
| **Media Assets & PDFs** | Cloud Storage Object Versioning | 14-day noncurrent retention (max 2 versions) | Automated lifecycle management on `gs://wailtail` preserving previous versions of overwritten or deleted inspection documents and vehicle media while preventing storage bloat. |

---


## 2. Core Firestore Data Schemas

### 2.1 `auctions` Collection

> **Historical production finding; staging correction accepted.** The earlier production baseline allowed authenticated auction mutations. PR #3 (`1bf4d6a`) subsequently implemented trusted mutation endpoints and restricted canonical auction reads/writes in staging. Current staging rules allow designated-administrator reads and no direct client auction writes; seller and administrator mutations use trusted server authorization. This resolves the implementation gap on staging, not the live deployment gate. Production rules and application behavior require separately approved rollout and verification; see [production-readiness review](docs/phase1-production-readiness.md).

Document ID: SEO title slug format `${slug}-${shortHash}` (e.g. `1988-porsche-928-s4-automatic-mtur4abv`), generated via `slugifyTitle(title)` and `generateShortHash()` in `createNewListing()` (or legacy `current` / specific auction UUID)
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
  hagertyValuationUrl?: string; // Optional direct URL to Hagerty Canada valuation report
  serviceRecordsUrl?: string; // Optional direct URL to external provenance cloud dossier (Google Drive, Dropbox, OneDrive)
  location: string;
  sellerId?: string; // Resolved UID of seller owning this auction lot
  sellerName: string;
  sellerEmail?: string; // Optional consignor contact email for winning bidder settlement
  sellerPhone?: string; // Optional consignor contact phone for winning bidder settlement
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
  winningEmailSent?: boolean; // Sentinel flag preventing duplicate winning bidder settlement notifications
  
  // Global Platform Branding Overrides
  siteLogo?: string;
  siteName?: string;
  siteTagline?: string;

  // Verified Boutique Dealer Integration (M1 Foundation)
  sellerType?: 'private' | 'dealer';
  dealerId?: string;
  dealerSnapshot?: DealerListingSnapshot;
  dealerDocFee?: 0; // Strictly enforced $0 CAD dealer doc fee
  taxHandling?: 'dealer_collects' | 'buyer_pays_at_registration' | 'requires_confirmation';
  taxDisclaimerVersion?: string;
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
  isPinned?: boolean; // Pinned seller/admin announcement indicator
  pinnedAt?: number; // Unix timestamp when pinned
  pinnedBy?: string; // UID of user/admin who pinned the comment
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

#### Showcase Chapter Lightbox Isolation & Gallery Independence
* **Dedicated Chapter Lightbox State (`activeLightboxPhoto`)**: `InlineShowcaseSection.tsx` maintains its own internal lightbox state (`activeLightboxPhoto`), rendering enlarged high-resolution chapter photos, titles, and captions independently of `fullGallery`. This enables chapter images uploaded directly via Section 4 (Curated Showcase Chapters) to enlarge cleanly with backdrop blur, Escape key dismissal, and window scroll locking without relying on the master photo archive.
* **Parent Gallery Index Safeguard (`idx !== -1` Check in `App.tsx`)**: In `App.tsx`, `handleOpenLightboxByUrl()` verifies that a clicked image URL exists within `currentMedia.fullGallery` (`idx !== -1`) before updating `selectedLightboxIndex`. This prevents unintended resets or fallbacks to gallery index 0 when interacting with isolated chapter photos not present in `fullGallery`.

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
* **Shared Canonical AI Modal Integration (`AiAssistantModal.tsx`)**: The AI Listing Writing Assistant (`AiAssistantModal.tsx`) also shares this canonical `vehicleTaxonomy.json` dataset and cascading pipeline, ensuring consistent Year/Make/Model/Generation validation during AI intake and guaranteeing seamless, 1:1 form hydration into Section 1 of the Listing Editor Workspace without data loss or mismatched taxonomy keys.

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
  
  // Historical Member Registration Metadata (Legacy Records Only; Discontinued on New M2.0A Submissions)
  registeredUserId?: string;    // Legacy UID of existing member (retained on historical records; not written on new submissions)
  isRegisteredUser?: boolean;   // Legacy flag indicating registered member submission (retained on historical records)
  registeredUserRole?: string;  // Legacy active role at submission (retained on historical records)
  sellerId?: string;            // Resolved UID of seller post-onboarding claim

  // Dealer Applicant Declarations (M1 Foundation)
  applicantType?: 'private' | 'dealer';
  submittedDealershipName?: string;
  dealershipName?: string;
  submittedDealerLicenseNumber?: string;
  dealerLicenseNumber?: string;
  submittedLicensingJurisdiction?: CanadianProvinceOrTerritory;
  licensingJurisdiction?: CanadianProvinceOrTerritory;
  dealershipOwnershipDeclaration?: boolean;
  legalSellerOfRecordDeclaration?: boolean;
}
```

#### Lifecycle State Transitions & Seller Workspace Claim Integration:
- **`status: 'rejected'`**: Marked when curation staff decline an intake submission. Automatically dispatches an asynchronous serverless rejection email (`type: 'consignment_rejected'`) via `/api/send-consignment-email` to `sellerEmail` (with fallback to `email`), conveying vehicle particulars and optional curator notes without blocking the administrative interface.
- **`convertedAuctionId`**: Generated during administrative 1-click approval (`convertConsignmentToDraftListing`). References the new draft listing created in `auctions/{convertedAuctionId}` pre-populated with vehicle taxonomy, location, and reserve parameters. The conversion workflow copies the submitted seller identity and contact details into the draft. A separate administrator approval workflow (`approveConsignmentAndPromoteSeller`) can promote an existing account to `SELLER` across `users` and `bidders` (preserving `ADMIN`); the self-service seller claim flow uses the trusted M2.0B endpoint documented below.
- **Seller Claim Onboarding Integration**: Approval notifications include a personalized onboarding claim deep-link (`/dashboard/listings/${convertedAuctionId}/edit?action=claim_seller&appId=${id}&lot=${convertedAuctionId}&email=${sellerEmail}`). When accessed, `AuthModal.tsx` activates an emerald claim banner and pre-fills the consignor's email. After authentication, `AuthContext.tsx` requests authorization through `POST /api/authorize-approved-consignor`. The endpoint verifies the Firebase ID token, revalidates the approved application inside a Firestore transaction, atomically updates the canonical `users/{uid}` and `bidders/{uid}` profiles, and safely links the converted auction without overwriting another seller's assignment. The client does not write role changes or optimistically promote the account.

#### M2.0A Consignment Access Control & Security Model:
- **Normalized Lowercase Seller Email**: All new submissions normalize `sellerEmail` via `(app.sellerEmail || '').trim().toLowerCase()` prior to database write, ensuring reliable alignment with lowercased authentication claims.
- **Creation Constraints & Discontinued Registration Metadata**: Guest (unauthenticated) submissions remain permitted. However, all non-admin submissions (guest or authenticated) must set `status: 'pending'` and are strictly barred from injecting administrator-controlled metadata or protected dealer verification fields (`sellerType`, `dealerId`, `dealerSnapshot`, `dealerDocFee`, `taxHandling`, `taxDisclaimerVersion`, `verifiedAt`, `verifierUid`, `verificationStatus`, `verificationMethod`, `verificationExpiresAt`, `verificationRecordVersion`, `reviewedAt`, `reviewedBy`, `convertedAuctionId`, `updatedAt`, `registeredUserId`, `isRegisteredUser`, `registeredUserRole`). New M2.0A submissions no longer write `registeredUserId`, `isRegisteredUser`, or `registeredUserRole` into application documents.
- **Legacy Records Retention & Backwards Compatibility**: Existing historical application documents may still contain legacy registration metadata (`registeredUserId`, `isRegisteredUser`, `registeredUserRole`). These historical records have not been migrated or deleted, and existing administrative and lookup workflows retain backwards compatibility with them.
- **Applicant Read Authorization**: Reading an application requires:
  1. An authenticated Firebase user (`isAuthenticated()`).
  2. A non-null Firebase Auth email claim (`request.auth.token.email != null`).
  3. A verified email address (`request.auth.token.email_verified == true`).
  4. Exact case-insensitive match between stored `sellerEmail` and the lowercased authenticated email claim (`resource.data.sellerEmail == request.auth.token.email.lower()`).
- **Token Claim Authorization vs. Client Identifiers**: Access authorization is derived strictly from the authenticated, cryptographically verified auth token email claim (`request.auth.token.email.lower()`). Client-supplied registration identifiers (such as `registeredUserId`) are not an authorization basis for applicant reads.
- **Modification & Deletion Lock**: Non-admin callers cannot update or delete consignment records under any circumstances (`allow update, delete: if isAdmin();`).
- **Dual Collection Parity**: Both `consignment_applications` and legacy `consignments` share this identical access control model.

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
  welcomeEmailSent?: boolean; // Firestore sentinel flag ensuring welcome email dispatches strictly once per verified account
  bannedFromBidding?: boolean;
  isBanned?: boolean;
  bannedAt?: number;
  banReason?: string;
  watchlist?: string[]; // Array of saved auction lot IDs
  fcmTokens?: string[]; // Registered FCM device tokens for Web Push outbid & auction alerts
  dealerId?: string; // Foreign key linking user profile to canonical dealer_profiles/{dealerId}
}
```

> **Security & Privacy Consideration (`dealerId` Public-Read Exposure)**: Under current Firestore rules, root documents in `users/{userId}` and `bidders/{userId}` allow public read access (`allow read: if true;`). Because Cloud Firestore rules do not provide field-level read filtering within publicly readable documents, `dealerId` is exposed to public reads wherever populated. This is an existing security/privacy consideration slated for M2 architectural review.

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

export type BannerConfig = LotHeaderBannerConfig;

export interface FloatingFeedbackConfig {
  enabled: boolean;
  label?: string; // e.g. "Feedback & Bug Report" or "✨ AI Assistant Feedback"
  badgeText?: string; // Optional callout tag (e.g. "BETA" or "NEW")
}

export interface PlatformPromoSettings {
  enabled: boolean;
  cadenceInterval?: number; // Configurable catalog grid promo injection interval: -1 (Launch Mode: Show All Active Cards), 0 (Low Inventory Only), 6, 9, or 12 lots.
  cards: PromoCardConfig[];
  lotHeaderBanner: LotHeaderBannerConfig;
  catalogBanner?: LotHeaderBannerConfig;
  feedbackWidget?: FloatingFeedbackConfig;
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

### 2.12 `feedback` Collection Schema

Path: `/feedback/{feedbackId}`
Stores member and guest feedback submissions, bug reports, and UX suggestions with automated client diagnostic telemetry:
```typescript
export interface PlatformFeedbackRecord {
  id?: string;
  category: 'bug' | 'suggestion' | 'general';
  message: string;
  reporterName?: string;
  reporterEmail?: string;
  userId?: string | null;
  userRole?: string;
  url: string;
  viewport: string;
  userAgent: string;
  timestamp: number;
  status: 'new' | 'reviewed' | 'resolved';
}
```
Access is governed by production Firestore security rules: public create (`allow create: if true;`) and administrator-only read/write (`allow read, update, delete: if isAdmin();`).

### 2.13 `dealer_profiles` Collection Schema (Private Canonical Records)

Path: `/dealer_profiles/{dealerId}`
Maintains authoritative, canonical business profile data for verified boutique automotive dealerships. Documents in this collection are strictly private to administrators for reading (`allow read: if isAdmin();`). All client writes are denied; the trusted M2.3 endpoint creates/updates profiles atomically with audit records:

```typescript
export type CanadianProvinceOrTerritory =
  | 'AB'
  | 'BC'
  | 'MB'
  | 'NB'
  | 'NL'
  | 'NS'
  | 'NT'
  | 'NU'
  | 'ON'
  | 'PE'
  | 'QC'
  | 'SK'
  | 'YT';

export interface DealerProfile {
  id: string;
  legalBusinessName: string;
  dbaName?: string;
  dealerLicenseNumber: string;
  licensingJurisdiction: CanadianProvinceOrTerritory;
  primaryRepresentativeUid: string;
  streetAddress: string;
  postalCode: string;
  city: string;
  province: CanadianProvinceOrTerritory;
  phone: string;
  displayPhonePublicly: boolean;
  website?: string;
  displayWebsitePublicly: boolean;
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'rejected' | 'suspended';
  verifiedAt?: number;
  verifierUid?: string;
  verificationMethod?: string;
  verificationExpiresAt?: number;
  verificationCaseId?: string;
  primaryRepresentativeEmail?: string;
  sourceReferenceDescription?: string;
  sourceReferenceType?: string;
  checkedAt?: number;
  contactVisibilityConsent?: { phone: boolean; website: boolean; recordedAt: number; recordedBy: string };
  createdAt: number;
  updatedAt: number;
}

export interface DealerListingSnapshot {
  dealerId: string;
  dealershipName: string;
  displayName?: string;
  dbaName?: string;
  city: string;
  province: CanadianProvinceOrTerritory;
  phone?: string;
  website?: string;
  verifiedAt: number;
  verificationRecordVersion: string;
  dealerLicenseNumber?: string;
  licensingJurisdiction?: CanadianProvinceOrTerritory;
}
```

> **Privacy, Legal Approval & Immutability Architecture for `DealerListingSnapshot`**:
> - **Type Capability vs. Approved Public Disclosure**: The optional `dealerLicenseNumber` and `licensingJurisdiction` fields exist in the TypeScript contract (`DealerListingSnapshot`) to accommodate prospective regulatory and compliance requirements. However, their inclusion in the type definition does not authorize public disclosure.
> - **Legal Approval Required**: These optional fields **must not** be populated in publicly readable auction snapshots until legal review explicitly approves their public visibility.
> - **Public-Safe Business Identity**: Public dealer presentation must strictly rely on approved public-safe business identity fields (`dealershipName`, `displayName`, `dbaName`, `city`, `province`, `phone`, `website`), with `phone` and `website` qualified as public only when their corresponding visibility controls (`displayPhonePublicly` and `displayWebsitePublicly`) are enabled as intended public-disclosure conditions.
> - **Canonical Profile and Disclosure Boundary**: The dealer's authoritative, private canonical profile (`/dealer_profiles/{dealerId}`) remains separate from the public auction snapshot. Regulatory licence details are intended to remain separate from publicly readable auction snapshots as a documented disclosure policy, rather than an independently enforced database restriction on administrator writes.
> - **Administrator-Controlled Snapshot**: Dealer snapshots are intended to preserve the dealer identity associated with an auction at the relevant point in time. Under current Firestore security rules, snapshot fields are protected from non-admin modification, while administrators retain write permissions. Consequently, the snapshot is administrator-controlled, not technically immutable against administrator changes at the database level.

### 2.14 `dealer_verification_audits` Collection Schema (Append-Only Audit Trail)

Path: `/dealer_verification_audits/{auditId}`
Preserves an immutable, chronological administrative audit ledger of dealer verification actions, method descriptions, and status changes. Readable strictly by administrators (`allow read: if isAdmin();`); all client writes are denied. The trusted M2.3 endpoint uses transaction.create for immutable audit events:

```typescript
export interface DealerVerificationAudit {
  id?: string;
  caseId: string;
  applicationId: string;
  source: 'consignment_applications' | 'consignments';
  dealerId: string | null;
  action: 'verified' | 'rejected' | 'suspended' | 'reviewed' | 'updated' | 'renewed';
  reason: string;
  administratorUid: string;
  administratorEmail: string;
  timestamp: number;
  revision: number;
  before: { review: Record<string, unknown>; profile: DealerProfile | null };
  after: { review: Record<string, unknown>; profile: DealerProfile | null };
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

### 3.3 Real-Time Clock-Driven Auction Lifecycle Transitions (`getEffectiveAuctionStatus`)
- **Status Evaluation**: The platform utilizes `getEffectiveAuctionStatus(startTime, endTime, status, now)` (`src/utils/formatters.ts`) to dynamically evaluate current timestamps against auction lifecycle boundaries:
  - `draft`: Retains draft state regardless of timestamp until deliberately published.
  - `sold`: Retains terminal sold state.
  - `now < startTime`: Evaluates dynamically as `upcoming`.
  - `now >= endTime`: Evaluates dynamically as `ended`.
  - `(endTime - now) <= 120 * 1000`: Evaluates dynamically as `ending_soon` within the final 2-minute soft-close window.
  - Otherwise evaluates as `active`.
- **Zero-Refresh UI Transitions**:
  - `formatAuctionCountdown()` internally invokes `getEffectiveAuctionStatus()`, triggering dynamic status changes in countdown clocks and UI badges across state boundaries (`upcoming` $\rightarrow$ `active` $\rightarrow$ `ending_soon` $\rightarrow$ `ended`) without requiring page reloads or user interaction.
  - `VehicleCatalogGrid.tsx` utilizes normalized predicates (`isLive`, `isUpcoming`, `isEnded`) driven by a 1-second interval ticker (`useEffect`), refreshing category filter tab counters and catalog lot card states automatically in real time.
- **Silent Background Firestore Reconciliation**:
  - In `AuctionHeader.tsx`, when an auction lot is active on screen and its persisted Firestore `status` diverges from its computed real-time `effectiveStatus` (e.g. crossing `startTime` from upcoming to live, or `endTime` from active to ended), a background reconciliation trigger automatically executes `updateAuctionStatus(auction.id, effectiveStatus)`.
  - Redundant writes are suppressed when `effectiveStatus === auction.status`.
  - This guarantees that backend database records synchronize silently with real-time clock thresholds as soon as any client accesses the lot.

### 3.4 Bidding Concurrency, Retry Loop & Outbid Email Dispatch
1. **Transaction Concurrency & Fast Exponential Backoff Retry Loop**:
   - Bidding operations in `placeBidWithAntiSnipe()` (`src/services/auctionService.ts`) execute inside Firestore atomic transactions (`runTransaction`) to preserve total ordering and prevent race conditions.
   - Implements a 4-attempt retry loop (`maxAttempts = 4`) backed by fast exponential backoffs (50ms, 150ms, 300ms) for transient database contention, allowing rapid recovery during intense closing-second bidding battles.
2. **Contention Error Mapping (`isTransientContentionError`)**:
   - Helper function identifies transient concurrency failures: error codes (`aborted`, `failed-precondition`, `unavailable`) and messages matching `does not match the required base version`, `version mismatch`, `stored version`, `contention`, or `concurrency`.
   - Isolates transient transaction conflicts from permanent validation rules (e.g., minimum bid increments, revoked privileges, or closed lots), mapping errors cleanly for client UX presentation without unhandled exceptions.
3. **Deduplicated Outbid Alerts & Transaction-Gated Dispatch**:
   - Evaluates `isDistinctBidder` by verifying the previous high bidder's UID and email diverge from the current bidder (`previousBidderId !== bidder.uid` and case-insensitive email comparison).
   - Email dispatch is deferred strictly outside and after `runTransaction` successfully commits, eliminating phantom outbid emails if the transaction aborts.
   - Triggers non-blocking dual dispatch: local queue alert (`sendOutbidAlertEmail`) and serverless email proxy (`sendOutbidNotificationEmail` targeting `/api/send-consignment-email` with `type: 'outbid_notification'`).
4. **Permanent Session Settlement Mutex, Atomic Transaction Sentinel & Winning Settlement Pipeline**:
   - **Dual-Layer Mutex Locks (`settledAuctionSessionIds` & `inFlightSettlementIds`)**:
     - Introduces a module-level permanent session mutex (`settledAuctionSessionIds = new Set<string>()`) in `src/services/auctionService.ts` to permanently lock settled lots from recurring settlement passes within an active browser tab session.
     - Accompanied by the ephemeral in-tab mutex lock (`inFlightSettlementIds = new Set<string>()`), preventing concurrent ticker invocations, background snapshot listeners, or manual admin force-close triggers from initiating duplicate settlement passes. Ephemeral locks release in `finally`, while permanent session IDs persist.
   - **Database-First Atomic Transaction Sentinel**:
     - `reconcileAuctionClosureAndNotifyWinner()` executes an atomic Firestore `runTransaction` that reads fresh document state directly from the database (`transaction.get(auctionRef)`) instead of relying on stale in-memory React component props.
     - Sentinel check: Aborts immediately with `{ status: 'already_sent' }` if `winningEmailSent === true`.
     - Atomically commits `winningEmailSent: true` and terminal lifecycle status (`sold` or `ended`) to the auction document *prior* to triggering the outbound HTTP fetch to `/api/send-consignment-email` (`type: 'winning_bid_confirmation'`), eliminating race conditions and duplicate dispatch email storms.
   - **Hierarchical Consignor Contact Fallback Resolution Chain**:
     - Resolves consignor contact credentials through a 4-tier fallback pipeline:
       - `sellerEmail`: `freshAuction.sellerEmail` $\rightarrow$ `users/{sellerId}.email` $\rightarrow$ `consignment_applications.sellerEmail` $\rightarrow$ `'contact@wailtail.com'`.
       - `sellerPhone`: `freshAuction.sellerPhone` $\rightarrow$ `users/{sellerId}.phone` $\rightarrow$ `consignment_applications.sellerPhone` $\rightarrow$ `undefined`.
     - Guarantees complete and populated consignor credentials in the winning bidder post-auction confirmation email and 4-Stage Offline Settlement Checklist.

---

## 4. Canadian Financial Standard & Odometer Compliance

1. **Currency**: All financial calculations, reserves, minimum bids, increments, and winner statements are standard **CAD ($)**.
2. **Odometer / Distance Units**:
   - Default: `km` (Kilometers) to align with Transport Canada and Canadian provincial licensing requirements (ICBC, Alberta Registries, ServiceOntario).
   - Toggle: Allows switching between `km` and `mi` on the fly in Section 1 of the Owner Control Center.
   - Clean display logic: Automatically appends `km` or `mi` if omitted in the raw numeric input.

---

## 5. Media & Asset Pipeline

### 5.1 Cloud Storage Asset Pipeline, Client-Side Upload Guards & PDF Viewer Architecture
1. **Firebase Cloud Storage HTTPS Pipeline**:
   - All uploaded vehicle photos, hero banners, and inspection documents are streamed directly to Firebase Cloud Storage (`gs://wailtail`) via `uploadImageToStorage()`.
   - Cloud Storage returns public HTTPS download URLs (`https://firebasestorage.googleapis.com/...`), taking ~120 bytes of text per photo inside Firestore documents.
   - Eliminates Firestore's 1MB per-document payload ceiling, allowing listings to host 100+ high-resolution vehicle photos.
2. **Client-Side Upload Guards & Micro-Compression Engine**:
   - **Client-Side 25MB PDF Document Guard**: Enforces an explicit 25MB client-side file size ceiling (`file.size <= 25 * 1024 * 1024`) on inspection document uploads across `ListingEditorWorkspace.tsx` and `AdminPanelModal.tsx`. Rejects oversized PDF files with an immediate error toast before network transmission.
   - **Client-Side 20MB Raw Photo Guard**: Enforces a 20MB client-side limit on raw photo uploads before processing.
   - **Micro-Compression Engine (`compressImageDataUrl`)**: Prior to bucket dispatch, raw image Data URLs undergo client-side HTML5 canvas micro-compression, scaling down excessively oversized imagery (max dimension 1200px, 75% quality JPEG). Serves as an essential fallback mechanism if non-storage or cached payloads are passed through form state.
   - **AI Assistant Canvas Micro-Compression Engine (`AiAssistantModal.tsx`)**: In addition to standard photo gallery compression, the AI Writing Assistant incorporates an automated client-side HTML5 canvas micro-compression pipeline for uploaded document and paperwork photos (scaling down to max dimension 1200px at 75% quality JPEG). This crushes ~5MB smartphone snapshots down to ~150KB, operating alongside a strict 3.0MB cumulative limit guard across all AI intake documents to safely fit within serverless request boundaries.
3. **900KB Document Payload Size Cap (`saveMediaConfig`)**:
   - `saveMediaConfig()` in `auctionService.ts` executes rigorous pre-flight payload sanitization and size enforcement.
   - Sets a strict internal threshold of 900KB (below Firestore's hard 1,048,576 byte limit) for serialized documents, guaranteeing zero `FirebaseError: Payload exceeds maximum allowed size` exceptions.
4. **Hero Carousel & Root Auction Lead Hero Sync**:
   - Ordered image array rendered in Bring-a-Trailer style carousel format with drag-and-drop reordering (`onDragStart`, `onDrop`) and positional nudges (`← Left` / `Right →`).
   - Automatically mirrors `leadHeroImage` to the root `auctions/{id}` document during master save operations to power catalog card thumbnails.
5. **Categorized Photo Grid & Maximized PDF Canvas Overhaul**:
   - 6 categorized sub-galleries: `exterior`, `interior`, `engine`, `underbody`, `docs`, `documentation`.
   - **Maximized PDF Viewer Canvas**: Expanded inspection report lightbox canvas across `PhotoGalleryGrid.tsx` and `ListingEditorWorkspace.tsx` to `max-w-5xl` / `max-w-6xl` at `h-[78vh]`, providing an expansive viewport for multi-page historical documents and inspection certificates.
   - **Consolidated Single-Row Control Toolbar**: Collapsed fragmented multi-row headers and detached bottom CTAs into a single unified horizontal top toolbar containing file icon, truncated document title, category badge, ghost "Open in New Tab" link, and prominent amber "Download" CTA.
   - **Native `#view=FitH` Embedding**: Appends `#toolbar=1&navpanes=0&view=FitH` URL parameters to embedded iframe sources, ensuring inspection PDFs automatically fit container width and present native browser zoom/pagination controls without manual user zooming.

### 5.2 Serverless YouTube Video Ingestion Pipeline
1. **Vercel Serverless Proxy Endpoint (`server/api/youtube-playlist.ts`)**:
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
   - Vercel Serverless Function hosted at `/api/send-consignment-email` (`server/api/send-consignment-email.ts`).
   - Supports a multi-mode payload interface via `type: 'consignment' | 'inquiry' | 'consignment_receipt' | 'welcome_bidder' | 'consignment_approved' | 'consignment_rejected' | 'outbid_notification' | 'winning_bid_confirmation' | 'feedback_report'` (defaulting to `'consignment'` if unspecified):
     - **Consignment Intake (`type: 'consignment'`)**: Handles incoming JSON payloads from the public consignment modal (`ConsignmentModal.tsx`) and dispatches structured HTML notification emails directly to curation administrators with 1-click admin triage deep-links. Includes case-insensitive admin recipient deduplication.
     - **Private Buyer Inquiries (`type: 'inquiry'`)**: Handles private direct inquiries dispatched from `ContactSellerModal.tsx`, transmitting prospective buyer messages and seller inquiry details directly to administrators/sellers with zero client-side credential exposure.
     - **Seller Consignment Receipt (`type: 'consignment_receipt'`)**: Dispatches a dual-branded HTML acknowledgment email directly to the consignor/seller applicant confirming receipt of their vehicle submission, summarizing vehicle particulars, detailing curation review timelines (1–2 business days), and linking to their member dashboard.
     - **Consignment Approved Notice (`type: 'consignment_approved'`)**: Dispatches a dual-branded emerald HTML acceptance notification to the seller (`sellerEmail`), summarizing approved vehicle specs and assigned lot reference, and presenting a prominent "Claim Your Seller Workspace" onboarding claim CTA button.
     - **Consignment Rejection Notice (`type: 'consignment_rejected'`)**: Dispatches a branded editorial HTML notification to the applicant (`sellerEmail` with fallback to `email`) conveying application status and submitted vehicle particulars with complete taxonomy fallback hydration.
     - **New Verified Bidder Welcome (`type: 'welcome_bidder'`)**: Dispatches a dual-branded HTML onboarding email to newly verified bidders celebrating their registration, presenting platform bidding guidelines, highlighting zero buyer fees, and providing 1-click exploration of live auctions.
     - **Outbid Notification (`type: 'outbid_notification'`)**: Dispatches an instant, transaction-decoupled outbid alert to displaced high bidders with current CAD high bid metrics, required minimum increment, and direct deep-link CTA back to the active vehicle auction.
     - **Winning Bid Confirmation (`type: 'winning_bid_confirmation'`)**: Dispatches official auction win documentation to the highest bidder upon terminal auction closure, presenting the winning CAD amount, consignor contact details, and the 4-stage Canadian offline settlement checklist.
     - **Platform Feedback & Bug Reporting (`type: 'feedback_report'`)**: Handles incoming community feedback and bug submissions from `FeedbackModal.tsx`, compiling reporter metadata, structured client diagnostic telemetry, message content, and dynamic category badges with 1-click direct mailto reply CTA.
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
   - **Consignment Approved Notification (`type: 'consignment_approved'`)**:
     - Subject line: `Consignment Approved: ${year} ${make} ${model} — Wailtail Auctions`.
     - Dual-branded dark/emerald HTML layout featuring:
       - Prominent "CONSIGNMENT APPROVED" emerald badge (`#064e3b` / `#34d399`).
       - Vehicle Particulars card displaying Year, Make, Model, Generation/Chassis, and assigned Lot Reference.
       - Primary call-to-action button ("Claim Your Seller Workspace") deep-linked directly to the listing editor with claim query parameters (`/dashboard/listings/${convertedAuctionId}/edit?action=claim_seller&appId=${appId}&lot=${convertedAuctionId}&email=${sellerEmail}`).
   - **Consignment Rejection Notification (`type: 'consignment_rejected'`)**:
     - Subject line: `[Wailtail] Consignment Application Update — ${vehicleTitle}`.
     - Branded editorial HTML layout with ruby accent border (`#ef4444`) and "APPLICATION UPDATE" status badge (`#450a0a` / `#f87171`).
     - Vehicle Particulars table showing Year, Make, Model, Generation/Chassis, and VIN with robust fallback hydration (`'Your Vehicle'` / `'N/A'`).
     - Courteous curation update message clarifying evaluation decisions and encouraging future submissions.
     - Includes parameter fallback resolution checking `sellerEmail` against `email` to guarantee reliable delivery.
   - **Verified Bidder Welcome Email (`type: 'welcome_bidder'`)**:
     - Subject line: `Welcome to Wailtail — Your Bidding Privileges Are Active`.
     - Dual-branded editorial HTML layout welcoming the user (`${displayName}`), outlining core platform tenets (Transparent CAD Bidding, 2-Minute Anti-Sniping Soft Closes, Zero Buyer Fees, Direct Settlement), and featuring a high-contrast CTA button linking directly to the live vehicle catalog (`/catalog`).
     - **Deferred Dispatch Pipeline**: `sendWelcomeBidderEmail()` is suppressed during raw account registration and dispatches strictly upon confirmed email verification (`currentUser.emailVerified || data.isEmailVerified`) or staff manual verification override in `/admin` (`setUserEmailVerified`). Dispatches are deduplicated via persistent `localStorage` sentinel keys (`wailtail_welcome_sent_${uid}`).
   - **Outbid Notification (`type: 'outbid_notification'`)**:
     - Subject line: `Outbid Alert: ${vehicleTitle} — Wailtail Auctions`.
     - Branded high-contrast HTML notification with dark styling and amber alert accenting (`#f59e0b`).
     - Parameters:
       - `auctionId` / `lotId` / `id`: Unique lot identifier used for URL deep-linking (`https://www.wailtail.com/auctions/${lotId}`).
       - `vehicleTitle`: Title of the vehicle lot.
       - `currentBid` / `currentHighBid`: Latest high bid in CAD.
       - `minimumIncrement` / `minRequiredBid`: Minimum increment required for counter-bidding.
       - `bidderEmail` / `email` / `userEmail`: Outbid recipient email address (required).
       - `bidderName` / `displayName`: Displaced bidder display name.
     - Includes vehicle summary, current high bid, next required minimum bid, and a prominent "Place Counter-Bid" CTA button deep-linking directly to the lot page.
   - **Winning Bid Confirmation (`type: 'winning_bid_confirmation'`)**:
     - Subject line: `Auction Won: ${vehicleTitle} — Wailtail Auctions`.
     - Dual-branded editorial HTML layout with emerald victory accenting (`#10b981`).
     - Parameters:
       - `auctionId` / `lotId` / `id`: Lot identifier.
       - `vehicleTitle`: Title of won vehicle lot.
       - `winningBid` / `currentBid`: Final closing CAD bid amount.
       - `winnerEmail` / `bidderEmail` / `email` / `userEmail`: Winning bidder recipient email address (required).
       - `winnerName` / `bidderName` / `displayName`: Winning bidder display name.
       - `sellerName`: Consignor / seller full name.
       - `sellerEmail`: Consignor direct email for settlement.
       - `sellerPhone`: Consignor direct contact phone number.
     - Displays winning financial breakdown, consignor direct contact credentials, 4-stage Canadian offline CAD settlement checklist (1. Bank Wire / Certified Draft, 2. Title & Bill of Sale, 3. Transport / Collection, 4. VIN Check & Key Handover), and direct link to the member dashboard.
   - **Platform Feedback & Bug Triage Digest (`type: 'feedback_report'`)**:
     - Subject line: `[Wailtail Feedback] ${catUpper}: ${reporterName || 'Visitor'} (${formattedDate})`.
     - High-contrast dual-branded dark container layout (`#0f172a` / `#020617`) with dynamic category badges:
       - `BUG / TECHNICAL ISSUE`: Crimson accent (`#450a0a` / `#ef4444`).
       - `SUGGESTION / IMPROVEMENT`: Sky blue accent (`#0c4a6e` / `#3b82f6`).
       - `GENERAL FEEDBACK`: Warm amber accent (`#451a03` / `#f59e0b`).
     - Structured **Reporter Details** table: Name, Email (active mailto link), Account UID (monospace font, 'Unauthenticated Guest' fallback), Active Role (`GUEST`, `BIDDER`, `SELLER`, `ADMIN`), and formatted UTC timestamp.
     - Structured **Client Diagnostics** table: Active URL (hyperlinked), Viewport dimensions (`${viewport}`), and Browser User Agent string.
     - Formatted **Submitted Message** block styled with `white-space: pre-wrap; word-break: break-word;`.
     - Actionable **Direct Mailto Reply Button**: High-contrast blue CTA button (`mailto:${cleanReporterEmail}?subject=Re:%20Wailtail%20Feedback%20Follow-up`) displayed when reporter email is supplied.

### 5.4 Serverless Administrator Account Deletion (`/api/admin-delete-user.ts`)

**Staging security status:** The former caller-supplied administrator identity vulnerability has been corrected in staging commit [`860042b`](https://github.com/homeextent/wailtail/commit/860042bc35fcc98246f6385a035fc08d3c84d01f). The endpoint now authorizes deletion from a verified Firebase Authentication identity; the client cannot assert administrator authority by supplying an `adminUid`.

1. **Request authentication and administrator authorization**:
   - Accepts POST requests only; missing or other HTTP methods receive HTTP 405.
   - Requires an `Authorization: Bearer <Firebase ID token>` header. Firebase Admin verifies the token with revocation checking enabled (`verifyIdToken(idToken, true)`).
   - Requires `email_verified === true` and an email matching the shared designated-administrator allowlist in `src/config/adminConfig.ts` (`DESIGNATED_ADMIN_EMAILS`, `normalizeEmail()`, and `isDesignatedAdminEmail()`).
   - Derives the acting administrator UID and email exclusively from the verified token. The request body contains only the target `uid`; caller-supplied `adminUid` is not accepted as an authority source.
   - Rejects self-deletion and protects both designated administrator accounts. The endpoint checks the target Auth identity's email and independently resolves the designated administrator Auth identities by allowlisted email before any target deletion or Firestore mutation. Unexpected lookup failures fail closed.
2. **Server-side Auth and Firestore deletion**:
   - Uses the shared Firebase Admin initializer in `api/_lib/firebaseAdmin.ts`, including the configured named Firestore database.
   - The server is the sole authority for deleting the Firebase Authentication identity and related Firestore profile records. The client service `deleteUserRecord(userId)` obtains the active user's ID token and sends one authenticated POST request containing only `{ uid }`.
   - After authorization, the endpoint deletes the target Auth identity. An `auth/user-not-found` result is treated as an already-absent Auth identity so a previously interrupted Firestore cleanup can be retried.
   - Firestore cleanup covers direct `users/{uid}` and `bidders/{uid}` documents plus legacy documents whose `uid` field exactly matches the target UID. It does not perform email-only deletion queries.
   - Exact-UID query failures and batch failures propagate as incomplete cleanup; the endpoint returns HTTP 500 with `admin/incomplete-deletion` rather than reporting success. Deletion references are deduplicated and writes are chunked to respect Firestore batch limits.
   - Firebase Auth deletion and Firestore cleanup are **not atomic**. If Auth deletion succeeds but Firestore cleanup fails, the client receives an error and an administrator can retry; the endpoint treats the missing Auth identity as retryable and attempts Firestore cleanup again.
3. **Client failure behaviour and tests**:
   - `deleteUserRecord()` fails closed on missing authentication, network errors, timeouts, malformed responses, unsuccessful HTTP status, or a response without `success: true`. It performs no client-side Firestore fallback deletion.
   - Regression coverage is in `tests/admin-delete-user.test.ts` (44 tests). The combined `npm run test:endpoint` suite runs 85 tests: 41 approved-consignor authorization tests and 44 administrator-deletion tests. The Firestore rules suite remains at 126 tests.
4. **Administrator identity protection limitation**:
   - The workflow protects designated administrator Auth accounts while those Auth identities exist. If a designated administrator's Auth identity has already been removed, lookup by email cannot recover that account's former UID. Absolute protection of orphaned administrator profile documents in that condition requires stable administrator UIDs to be added to protected server configuration. No UID is inferred or fabricated.
5. **Release boundary**:
   - This implementation is committed and pushed to `staging`; it is not a production deployment or production security sign-off.
   - Auction ownership and mutation authorization was subsequently accepted on staging through PR #3; its production rollout and verification remain separate.

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
* **Category Lightbox Scoping**: Scopes photo cycling (`prevPhoto`, `nextPhoto`), thumbnail strip navigation, and counter telemetry ("Photo X of [subset]") strictly to the active category subset in `PhotoGalleryGrid.tsx`. When a user filters by a category (e.g., Exterior, Interior, Engine) and opens the lightbox, navigation remains scoped within that category rather than bleeding across unrelated categories.

#### 4. Showcase Chapter Lightbox Isolation & Gallery Index Safeguard (`InlineShowcaseSection.tsx` & `App.tsx`)
* **Dedicated Chapter Lightbox State (`activeLightboxPhoto`)**: `InlineShowcaseSection.tsx` maintains its own dedicated internal lightbox state (`activeLightboxPhoto`), allowing high-resolution showcase chapter photos and captions to render independently of `fullGallery`. Directly uploaded chapter photos (outside `fullGallery`) enlarge cleanly with caption and title presentation, dark backdrop blur, Escape key dismissal listener, and window scroll locking (`document.body.style.overflow = 'hidden'`).
* **Parent Gallery Index Safeguard (`idx !== -1` Check in `App.tsx`)**: In `App.tsx`, `handleOpenLightboxByUrl()` verifies that the target image exists within `currentMedia.fullGallery` (`const idx = (currentMedia.fullGallery || []).findIndex((img) => img.url === url); if (idx !== -1) { setSelectedLightboxIndex(idx); }`). This prevents accidental gallery index fallbacks or resets to photo index 0 in the primary `PhotoGalleryGrid` lightbox modal when users click isolated chapter images uploaded directly via Section 4 rather than picked from `fullGallery`.

### 5.6 Serverless AI Writing Assistant & Editorial Synthesis Engine (`/api/ai-assistant`)
1. **Endpoint Architecture & Gemini 2.5 Flash Migration**:
   - Vercel Serverless Function hosted at `/api/ai-assistant` (`server/api/ai-assistant.ts`) powering Wailtail's AI Editorial Assistant modal (`AiAssistantModal.tsx`).
   - Integrated with Google Gemini generative AI using `gemini-2.5-flash` as primary synthesis engine, supported by a resilient candidate model fallback array (`gemini-flash-latest`, `gemini-2.0-flash`) that automatically cascades if rate-limiting or service deprecations occur.
   - Configured with `maxDuration = 60` (60-second Vercel execution timeout extension) and `maxOutputTokens: 8192` to accommodate deep, multi-paragraph vehicle history synthesis and complete 7-section listing draft generations.
2. **Serverless Payload Expansion & Edge BodyParser**:
   - Explicitly configured Vercel serverless edge body parser with `sizeLimit: '4.5mb'` (`export const config = { api: { bodyParser: { sizeLimit: '4.5mb' } } }`).
   - Accommodates multi-page PDF documents and high-resolution paperwork photos transmitted as Base64 data without encountering HTTP 413 "Request Entity Too Large" edge drops.
3. **Multi-Action Request Router**:
   - Supports 3 core operations via `action`:
     - `generate_interview`: Analyzes vehicle identity (Year/Make/Model/Chassis) and uploaded paperwork to formulate 3 targeted chassis-specific technical interview questions.
     - `synthesize_draft`: Synthesizes comprehensive listing drafts (title, subtitle, Section 1 specs, Section 3 technical details, and rich Section 4 editorial narrative chapters) from vehicle particulars, interview answers, and multimodal document context.
     - `refine_section`: Executes targeted editorial enhancements on individual listing sections (e.g. rewriting narrative chapters, summarizing documentation).
4. **Client-Side Integration, Gateway Error Normalization & Budgeting**:
   - Integrated via `src/services/aiService.ts` and `src/components/AiAssistantModal.tsx`.
   - Hardened HTTP fetch interceptors normalize edge 413 and 502 gateway responses before JSON parsing, cleanly presenting user-friendly actionable error messaging and preventing unhandled `JSON.parse` syntax exceptions (`Unexpected token 'R'`).
   - Client-side intake enforces a 3.0MB cumulative document limit guard and client-side canvas micro-compression (1200px max dimension at 75% quality JPEG) before payload transmission.
5. **Reordered Step 1 Intake Architecture & Interactive Provenance Engine**:
   - Reordered intake layout for seamless cognitive progression: (1) Vehicle Taxonomy Selection (Year, Make, Model, Generation), (2) Structured Provenance Drawers & Disclosures, (3) Multimodal Document & Paperwork Dropzone.
   - **Sticky Provenance Dock**: Quick-jump anchor pills pinned in a `sticky top-0 z-20` dock atop the modal content area, maintaining immediate accessibility without UI displacement during vertical scrolling.
   - **Structured Provenance Drawers & Collector Disclosure Fields**: Interactive, tab-navigable accordion drawers for Ownership, Services, Flaws, and Modifications, paired with dedicated collector transparency inputs for Odometer Integrity & Cluster Disclosures (TMU), Accident & Insurance Claims, and Known Mechanical Needs (`odometerIntegrity`, `accidentHistory`, `mechanicalNeeds`), compiled cleanly into structured narrative prompts via `compileSellerNotes()`.
   - **Step 3 Photo Handoff Guidance**: Informational callout card upon draft application and guided toast notifications directing sellers to Section 5 ("Hero Carousel & Full Photo Gallery") for full-resolution vehicle exterior and interior photography uploads.

### 5.7 Collector Photography Guide & Recommended Shot List (`PhotoGuideDrawer.tsx`)
1. **Component Architecture & Integration**:
   - Built as an ergonomic, collapsible helper drawer (`src/components/PhotoGuideDrawer.tsx`) embedded directly within Section 5 ("Hero Carousel & Full Photo Gallery") across both `ListingEditorWorkspace.tsx` and `AdminPanelModal.tsx`.
   - Collapsed by default (`isExpanded: false`) to ensure zero vertical displacement of the photo upload dropzone and existing gallery thumbnails, maintaining optimal authoring ergonomics while providing instant on-demand photography guidance.
2. **5 Core Visual Pillars**:
   - Structured guidance breaking down the required 85–120+ photo catalog standard for collector-grade digital vehicle auctions:
     1. **Exterior Walkaround (30–40 Photos)**: 4 corner 3/4 profiles (front-left, front-right, rear-left, rear-right), direct front, rear, and profile side views, wheels & tires (DOT date codes & remaining tread depth), lighting elements (headlights, taillights & signals on/off), and trim, glass, weatherstripping & emblems.
     2. **Cabin & Cockpit (20–30 Photos)**: Front & rear seats (driver outer bolster close-ups), steering wheel, dashboard & switchgear, gauges & odometer cluster with engine running, center console, shifter & infotainment/radio, headliner, door sills & chassis jamb stickers, frunk/trunk with tools, compressor & spare tire.
     3. **Powertrain & Mechanical (10–15 Photos)**: Complete engine bay overview (both driver & passenger sides), factory engine decals & warning stickers, engine & transmission serial number stampings, battery tray condition & wiring harness integrity, fluid reservoirs, belts, hoses & intake plumbing.
     4. **Undercarriage & Suspension (15–20 Photos)**: Lift/ramp shots showing front & rear suspension, steering rack, tie rods & sway bars, differential, transaxle & oil pan (dryness / leaks), rocker seams & floor pans (checking for corrosion or damage), complete exhaust system, catalytic converters & heat shields.
     5. **Transparency, Flaws & Paint Depth (10–15 Photos)**: Paint depth meter readings across metal panels, close-ups of stone chips, scratches, scuffs & curb rash, paint bubbling, corrosion or previous repairs, wear on high-touch surfaces (pedals, seat piping, carpets), and service records binder, original window sticker, books, invoices & spare keys.
3. **Collector Pro-Tips Banner**:
   - Embedded high-contrast dark amber callout box providing practical automotive photography guidelines:
     - **Lighting**: Shoot during golden hour (early morning or late afternoon) to avoid harsh midday reflections and deep shadows.
     - **Stance & Framing**: Park in an open, uncluttered setting and turn front wheels 45° toward the camera for 3/4 profile angles.
     - **Aspect Ratio**: Capture in landscape orientation (4:3 or 16:9) matching high-definition desktop and mobile showcase carousels.

### 5.8 Seller Social Marketing Kit & Canvas Compositor Engine (SocialPromoKitModal.tsx)
1. **Component Architecture & Integration**:
   - Built as a decoupled global modal (`src/components/SocialPromoKitModal.tsx`) hoisted at the root application level in `App.tsx` and governed via `isSocialKitOpen: boolean` and `socialKitAuction: Auction | null`.
   - Accessible across multiple management surfaces via standardized action triggers:
     - **Listing Editor Workspace (`ListingEditorWorkspace.tsx`)**: Header action button (`Social Kit`) allowing creators to immediately launch promotional generation for the active lot draft.
     - **Seller Activity Hub (`UserAccountHubModal.tsx`)**: Prominent action trigger (`🚀 Social Marketing Kit`) within the Consignor / Seller Activity Hub for all consigned lots.
     - **Admin Vehicle Inventory Table (`AdminPortalPage.tsx`)**: Dedicated row action button within the Vehicle Inventory & Lots table allowing platform administrators to generate marketing materials for any catalog lot.
2. **Static 4:3 Template Asset Pipeline & Layer Composition**:
   - High-energy client-side HTML5 Canvas graphic generator ($1200 \times 900\text{ px}$, 4:3 aspect ratio) compositing dynamic vehicle content over a pre-rendered static poster template (`public/social-promo-template-4x3.jpg`):
     - **Layer 1 (Base Template & Fallback)**: Draws `public/social-promo-template-4x3.jpg` at full dimensions ($1200 \times 900\text{ px}$) with baked Wailtail branding, high-voltage styling, and graphic accents, backed by a deep charcoal gradient fallback (`#06080e` to `#0d131f`) if asset loading fails.
     - **Layer 2 (Slot 1 Hero Angle Card)**: Primary hero vehicle photo positioned in the upper-right quadrant at `X: 510, Y: 140, W: 630, H: 410` (corner radius `r: 10`), rendered with aspect-fill cover scaling, deep orange drop shadow (`rgba(234, 88, 12, 0.4)`), and a 4.5px vibrant orange border stroke (`#ff5e00`).
     - **Layer 3 (Slot 2 Detail / Cockpit Card)**: Secondary vehicle detail or interior cockpit shot positioned in the lower-left quadrant at `X: 60, Y: 460, W: 450, H: 290` (corner radius `r: 8`), rendered with aspect-fill cover scaling, heavy dark drop shadow (`rgba(0, 0, 0, 0.85)`), and a 4px vibrant orange border stroke (`#ff5e00`).
     - **Layer 4 (Dynamic Typography Block)**: Positioned in upper-left negative space anchored at `brandX = 60, startY = 205`:
       - **Line 1 (Stage Headline)**: Heavy condensed italic typography (`Impact`, `Arial Narrow`, `Arial Black`, 38px) with horizontal gradient (`#ff4500` to `#ffa500`) and dark drop shadow (`rgba(0, 0, 0, 0.95)`), dynamically updating based on campaign stage (`UPCOMING AUCTION`, `AUCTION IS LIVE`, `ENDING SOON`).
       - **Line 2 (Vehicle Title)**: Intelligent sizing and word-wrapping across up to 2 clean lines (maximum width 440px) without ellipsis truncation, dynamically stepping font size (40px down to 32px or 28px) in bright white (`#ffffff`) with dark drop shadow.
       - **Line 3 (Custom Tagline / Reserve Badge)**: User-customizable highlight tagline or reserve status badge (`NO RESERVE` / `SELLING AT NO RESERVE`) rendered in warm amber (`#f59e0b`).
3. **CORS Security Architecture & Cloud Storage Bucket Configuration**:
   - **Cache-Busting Image Loader (`loadImageAsync`)**: To prevent tainted canvas security errors (`SecurityError: The operation is insecure`) during client-side PNG export (`canvas.toBlob` / `canvas.toDataURL`), images are loaded via `new Image()` with `crossOrigin = 'anonymous'` and appended cache-busting query parameter (`?wailtail_cors=1`).
   - **Google Cloud Storage Bucket CORS**: Configured cross-origin resource sharing (`Access-Control-Allow-Origin: *`, `GET`, `HEAD`) on Firebase Storage bucket `gs://studio-apps-483721.firebasestorage.app` via `cors.json`, enabling seamless browser canvas export (`handleDownloadGraphic`) for remote vehicle photography.
   - **Resilient Fallback**: If cross-origin image loading encounters an error, a secondary load without `crossOrigin` is attempted so the visual canvas preview remains visible in the modal.
4. **Enthusiast Copy Generator & Tracked UTM Referral Engine**:
   - **Channel-Specific Copy Templates**: 3 tailored copy variations written in an authentic, grounded Canadian enthusiast tone avoiding generic marketing clichés:
     - **Enthusiast Group Deep-Dive**: Long-form narrative tailored for marque Facebook Groups and specialist forums, highlighting mechanical specs, maintenance history, transparency disclosures, and 0% buyer fees.
     - **Marketplace Pitch**: High-conversion punchy pitch designed for marketplace feeds and collector car boards.
     - **X / Twitter Thread**: Multi-tweet structured breakdown with spec bullet points and call to action.
   - **Tracked Referral UTM Engine**: Generates canonical campaign tracking URLs with source and medium tags (`https://www.wailtail.com/auctions/[id]?utm_source=seller_social&utm_medium=social_kit`), supporting one-click clipboard copying (`🔗 Copy Link`) and external link verification (`↗ Test URL`).
5. **Phase 2 Multi-Format Aspect Ratio Roadmap**:
   - **Phase 1 (Complete)**: 4:3 Feed / Landscape format ($1200 \times 900\text{ px}$) using `public/social-promo-template-4x3.jpg` optimized for Facebook, forum boards, desktop feeds, and social landscape posts.
   - **Phase 2 (Planned)**: 9:16 Vertical Stories / Reels format ($1080 \times 1920\text{ px}$) using `public/social-promo-template-9x16.jpg` optimized for Instagram Stories, Facebook Stories, TikTok, and YouTube Shorts.
   - **Phase 2 (Planned)**: 1:1 Square Feed format ($1080 \times 1080\text{ px}$) using `public/social-promo-template-1x1.jpg` optimized for classic Instagram grid feeds and profile carousels.
   - **Phase 2 (Planned)**: Consignor referral analytics and UTM click-attribution tracking dashboard in the Seller Activity Hub.

---

## 6. Owner & Consignor Workflows

### 6.1 Owner Control Center (`AdminPanelModal.tsx`)
- **Quick Anchors**: Instant jump bar for 7 sections:
  1. Vehicle Identity & Header Specs (Title, VIN, Odometer with km/mi toggle, Engine, Gearbox, Exterior, Interior/Cabin, Title status, Highlights badge)
  2. Platform Branding (Site logo, Name, Tagline)
  3. Technical Specifications Table (Single-Source Mirror from Section 1 + Custom Specification rows)
  4. Curated Showcase Chapters (Editorial sub-stories with rich media)
  5. Hero Carousel & Full Photo Gallery (Drag-and-drop reordering, inline category tags, PDF document inspection uploads, PhotoGuideDrawer photography guidance)
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
  - **Collector Photography Guide Drawer (`PhotoGuideDrawer.tsx`)**: Integrated collapsible shot list drawer detailing recommended photo counts and framing standards across the 5 core visual pillars (Exterior, Cabin, Powertrain, Undercarriage, Flaws/Paint Depth) and golden hour composition pro-tips; defaults to collapsed to prevent layout displacement.

### 6.2 Dedicated Listing Authoring Workspace (`/dashboard/listings/[id]/edit`)
- **Multi-Car Inventory Architecture & Seller Lot Dropdown Filtering**:
  - Full support for multi-car inventory catalogs in Firestore (`auctions` collection and per-lot `media-${auctionId}` settings).
  - **"Select Vehicle Listing" Dropdown & Seller Filtering**: Located in the workspace header bar, allowing administrators to seamlessly switch between active and draft vehicle lots with automatic form state synchronization. When accessed by a seller account, `visibleAuctions` automatically filters the dropdown to show only lots owned by that seller (`lot.sellerId === user.uid || lot.sellerEmail === user.email`), while administrators retain full catalog visibility.
  - **Role-Gated Workspace Header Tools & Lifecycle Overrides**:
    - Header administrative controls (**Import JSON**, **Export JSON**, and **+ New Listing**) are gated behind an `isAdmin` check, hiding them from standard seller accounts.
    - Section 7 Auction Lifecycle Status overrides (`Ended - Manual Force Close`, `Sold - Settled Offline`) are restricted to administrators (`isAdmin`). Non-admin sellers are restricted to `Draft` and `Scheduled / Live (Automated Clock)`.
  - **Consolidated AI Controls & Overwrite Defense**:
    - Duplicate AI draft generation triggers have been completely purged from the top navigation header bar, Section 2 header, and Section 4 header.
    - Anchored the primary `✨ AI Writing Assistant` trigger exclusively in the Section 1 card header, eliminating fragmented authoring paths and safeguarding existing custom narrative edits from accidental, destructive overwrites.
  - **Zero-Lot Database Support & Snapshot Rules**:
    - Snapshot listeners in `App.tsx` and `AdminPanelModal.tsx` (`subscribeToAllAuctions`) are configured to support empty states (`list || []`), removing legacy length guards to allow clean operation on a pristine database.
    - All catalog views render the actual database state without forced ternary fallbacks.
  - **"+ New Listing" Workflow & SEO Title Slugs**: Modal prompt requesting Listing Title / Vehicle Lot Name; atomically provisions a new vehicle document in Firestore (`createNewListing`) using human-readable document IDs (`${slug}-${shortHash}`, e.g., `1988-porsche-928-s4-automatic-mtur4abv`) via `slugifyTitle(title)` and `generateShortHash()`, initialized with clean placeholders and default Canadian CAD financials ($1,000 start, $250 increment, 7-day duration) without overwriting existing listings.
  - **Runaway Listing Auto-Creation Guard & Fallback Redirection**:
    - Programmatic auto-creation `useEffect` invocations on `'new'` or missing lot IDs have been completely eradicated from `App.tsx` and `ListingEditorWorkspace.tsx`.
    - Eliminates the infinite recursive loop where uninitialized route states re-rendered and triggered duplicate `createNewListing()` calls against Firestore, which previously produced 150+ phantom lots.
    - Route resolution now implements strict fallback guarding: navigating to unresolvable, missing, or `'new'` lot IDs triggers an immediate safe redirect to `/catalog` (or `/admin?tab=inventory` for administrators) accompanied by a "Listing lot not found" notification toast.
  - **Optimistic State Hydration**: Immediately appends new lot to local state upon creation to ensure instantaneous UI feedback while bridging Firestore synchronization latency.
- **Full-Page Split-Screen Route & View Modes**:
  - Dedicated authoring workspace (`ListingEditorWorkspace.tsx`), offering 3 layout view modes:
    1. **Split Mode (Default)**: 60/40 reactive layout with left-pane form authoring and right-pane live public preview.
    2. **Edit Form Mode**: Expanded full-width layout (`w-full max-w-6xl mx-auto`) for focused content creation.
    3. **Preview Mode**: Dedicated full-screen live public preview with device toggles.
- **Sticky Vertical Progress Stepper**: Left-hand navigation tracking completion status across all 7 listing sections with live visual badges (`Complete`, `In Progress`, `Pending`), scroll anchoring, and sticky top pinning (`sticky top-16 self-start max-h-[calc(100vh-4.5rem)] overflow-y-auto`). Clipping `overflow-hidden` classes on parent layout wrappers are eliminated to guarantee that the navigation remains firmly pinned below the header bar during scrolling.
- **Responsive Preview Viewport**: Toggle between full Desktop mode and 390px Mobile simulated phone container with live state hydration.
- **100% Feature Parity Across All 7 Sections**:
  - **Section 1 (Vehicle Identity & 10-Row Form Layout)**:
    - **Master AI Writing Assistant Trigger**: Pinned exclusively in the Section 1 card header as the single consolidated entry point (`✨ AI Writing Assistant`) for full-lot draft synthesis, ensuring unified intake flow and eliminating overwrite risk.
    - **Required Field Error Badges & Highlighting**: Empty required inputs display high-visibility red error border rings (`border-red-500/80`) and accompanying text warning badges (`* VIN Required`, `* Make Required`, `* Model Required`, `* Year Required`, etc.), eliminating seller confusion surrounding the sticky sidebar "1 needed" stepper counter.
    - **10-Row Form Hierarchy**:
      - **Row 1 (Top Row)**: 4-column responsive grid featuring the 3-tier dependent vehicle taxonomy pipeline: **Year** select (1930–2026), **Make** dropdown, **Model** dropdown, and **Generation / Chassis Code** dropdown (with dynamic custom input fallbacks).
      - **Row 2**: Primary Listing Title input equipped with the inline `⚡ Auto-generate from Specs` helper trigger positioned directly adjacent to the "Listing Title" label text.
      - **Row 3**: Subtitle / Highlights Bar input for editorial headline summaries (e.g. `3.0L Flat-Six • 5-Speed 915 • Guards Red (027)`).
      - **Row 4**: 2-column grid featuring Vehicle Identification Number (VIN) uppercase text input and strict numeric Odometer reading (`[^0-9]` sanitization) paired with an interactive `km` / `mi` distance unit toggle.
      - **Row 5**: 2-column grid for Engine specification and standardized **Universal Gearbox Taxonomy** dropdown (12 universal transmission choices: 4-Speed Manual, 5-Speed Manual, 6-Speed Manual, 7-Speed Manual, Automatic / Torque Converter, Dual-Clutch Automatic (DCT), Automated Manual (SMG/F1/E-Gear), Continuously Variable Transmission (CVT), Single-Speed Direct Drive (EV), Sequential / Dog-Leg, Preselector / Semi-Automatic, Other / Custom Gearbox...) with dynamic custom text input fallback.
      - **Row 6**: 2-column grid for Exterior finish and Interior / Cabin specifications.
      - **Row 7**: Standardized Title & Registration Status dropdown with custom fallback entry.
      - **Row 8**: Structured 3-field vehicle location panel (City, Province / State, and Country).
      - **Row 9**: Grid controls featuring Seller / Consignor name (`sellerName`), Consignor Email (`sellerEmail`), Consignor Phone (`sellerPhone` with telephone character sanitization `[^0-9+\-() ]`), and the **Highlights Tag Badge** input.
      - **Row 10 (Bottom Row)**: Hagerty Canada Valuation Link (`hagertyValuationUrl`) optional URL input ensuring direct linking to third-party Hagerty valuation appraisal reports, accompanied by helpful context copy and an inline `[🔍 Look up on Hagerty Canada ↗]` quick-lookup link.
    - **`formatHighlightsBadge` Auto-Sync & `isBadgeOverridden` Manual Override Protection**:
      - The Highlights Tag Badge displays the prominent badge rendered in the public Vehicle Highlights sidebar (e.g. `"1978 Porsche 911 930"`).
      - When the user selects or updates Year, Make, Model, or Generation in Row 1, `formatHighlightsBadge(year, make, model, generation)` dynamically computes the badge label.
      - If the user manually customizes the badge field, `isBadgeOverridden` is immediately flagged `true`, safeguarding custom text from being overwritten by future taxonomy adjustments. If the field is subsequently cleared or reset to match the auto-generated string, `isBadgeOverridden` returns to `false`.
  - **Section 2 (Overview Narrative)**: Editable heading, markdown/prose multiline text area, and featured overview image with local upload, gallery picker modal, or URL entry with lightbox preview.
  - **Section 3 (Technical Specifications)**: Automatic real-time synchronization from Section 1 into Section 3 table and public highlights card, with support for appending, reordering, and deleting custom specification rows.
  - **Section 4 (Showcase Chapters)**: Narrative chapter cards with photo uploader (file upload, gallery modal picker, manual URL), multiline checkmark bullet highlights, dynamic technical spec key-value pills, and chapter reordering/deletion.
  - **Section 5 (Hero Carousel & Full Photo Gallery)**: Drag-and-drop and positional hero carousel reordering (`← Left` / `Right →`) with `★ Lead Hero` indicator; categorized gallery supporting exterior, interior, engine, underbody, and PDF inspection documents with non-clipping category selectors and high-visibility delete buttons. Integrated with the collapsible **Collector Photography Guide (`PhotoGuideDrawer.tsx`)** detailing the 5 visual pillars (Exterior Walkaround [30–40 photos], Cabin & Cockpit [20–30 photos], Powertrain & Mechanical [10–15 photos], Undercarriage & Suspension [15–20 photos], Transparency, Flaws & Paint Depth [10–15 photos]) along with golden hour composition and 45° front wheel alignment pro-tips, collapsed by default to prevent UI displacement.
  - **Section 6 (Videos & Driving Chapters)**: 1-click YouTube playlist video chapter ingestion via serverless proxy (`server/api/youtube-playlist.ts`), video metadata auto-fetching, driving chapter timeline cards with live thumbnail previews, and complete eradication of video duration metadata.
  - **Section 7 (Auction Financials & Schedule)**: Canadian Dollar (`CAD $`) financial ledger (starting bid, reserve, minimum increment), lifecycle status dropdown, interactive native datetime pickers with calendar trigger icons and native `.showPicker()` modal invocation styled with `[color-scheme:dark]`, and "Simulate Final 2 Minutes" Anti-Sniping test button.
- **Full Public Preview Parity & Demo Fallback String Purge**:
  - Legacy demo fallback strings (`9118200142`, `126,200 km`, `Guards Red`, `3.0L Flat-Six CIS`) are stripped across public components and workspace preview panes, cleanly rendering empty/unentered fields with `'—'`.
  - Live public header with dynamic countdown calculated via `formatAuctionCountdown`, starting/high bid, opening bid calculation sync (minimum bid = starting bid on zero-bid listings), reserve status pill, and key header specs.
  - Interactive `HeroMediaCarousel` with image navigation and lightbox triggers.
  - Section 2 & 3 Overview Narrative and synchronized "Vehicle Highlights" sidebar card with Zero Buyer Fees banner and Consignor Private Inquiry action.
  - Section 4 `InlineShowcaseSection` with photo lightboxes and highlight lists.
  - Section 6 `YouTubePlaylistSection` with video embed and chapter selectors.
  - Section 5 `PhotoGalleryGrid` with categorized filtering and full-screen lightbox modal.
  - Section 7 Financials & Scheduling Summary Card detailing soft-close rules and auction dates.
  - Branded Hagerty® Valuation Report CTA button rendered conditionally with `TrendingUp` icon, opening external reports via sanitized `https://` protocol (`formatExternalUrl`).
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
      sellerEmail?: string;
      sellerPhone?: string;
      highlightsBadge: string;
      hagertyValuationUrl?: string; // Optional direct URL to Hagerty Canada valuation report
      serviceRecordsUrl?: string; // Optional direct URL to external provenance cloud dossier (Google Drive, Dropbox, OneDrive)
      
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
  - "Import JSON" modal with syntax validation, schema key checks, and atomic state hydration across all sections (including `hagertyValuationUrl` and `serviceRecordsUrl`).
  - "Export JSON" action copying active listing state directly to clipboard as formatted JSON (including `hagertyValuationUrl` and `serviceRecordsUrl`).

### 6.3 Full-Page Admin Operations Portal (`/admin` via `AdminPortalPage.tsx`)
- **Dedicated Route & Access Control**:
  - Full-screen administrative command center gated strictly to authenticated accounts holding the `ADMIN` role (`userProfile?.role?.toUpperCase() === 'ADMIN'`).
  - Unauthorized visitors and non-admin users are automatically redirected to the root catalog route (`/`) with an alert notification.
  - Implements session authentication loading guards in `App.tsx` (`authLoading`) to prevent accidental redirect flashes during browser refreshes.
  - **Deep-Link Auth Preservation Pipeline (`App.tsx` & `AuthModal.tsx`)**:
    - When an unauthenticated visitor accesses an administrative deep-link (e.g. from an intake triage email `/admin?tab=consignments&id=${appId}&action=approve|reject`), `App.tsx` halts redirection while `authLoading` resolves.
    - If unauthenticated, it preserves the incoming query string in `sessionStorage` under the key `wailtail_pending_admin_deeplink` and surfaces `AuthModal.tsx` directly with an emerald administrative callout banner (`"Admin Authentication Required — Please sign in with an administrator account to review this consignment deep-link."`).
    - Once the user successfully authenticates as an administrator, `resolveAdminDeeplinkAfterAuth()` reads and purges the stored query parameters from `sessionStorage`, immediately redirecting the administrator to `/admin?${cleanParams}` without losing triage context.
- **5 Command Suites & Management Tabs**:
  - **1. Member Directory Tab** (`bidders` — Member Directory Management): Server-assisted paginated search (`fetchPaginatedBidders`) querying across `users` with client-side query filtering by display name, email, and UID. Configurable page limits with previous/next pagination controls. Includes a role filter dropdown (`ALL`, `ADMIN`, `SELLER`, `BIDDER`) for refined directory segmentation.
    - **Expandable Member Bid Ledger**: Click-to-expand bid history accordion displaying all historical bids placed by the user, breakdown counters for active vs. retracted bids, and an inline administrative "Retract" moderation button.
    - **Expandable Vehicle Portfolio Ledger (`🚗 Lots (N)`)**: Interactive accordion button beside the bid ledger trigger expanding an inline vehicle portfolio drawer for the member. Resolves associated vehicle lots with zero extra database reads via `getSellerLots(memberUid, memberEmail)`, matching resident inventory state by `lot.sellerId === memberUid` or normalized `lot.sellerEmail.toLowerCase() === memberEmail.toLowerCase()`. State isolation is maintained via an independent `expandedSellerLotUids` reactive Set state. Each lot card in the portfolio drawer displays vehicle thumbnail, title, VIN, CAD financial metrics (current bid/reserve status), status badge pills, and direct CTA action hooks (`Open in Listing Editor →` and `View in Inventory ↗`).
  - **2. Consignment Applications Tab** (`consignments`): Server-assisted paginated search (`fetchPaginatedConsignments`) querying `consignment_applications` with text filtering across applicant name, email, phone, make, model, and status filter pills (`all`, `pending`, `approved`, `declined`).
  - **3. Vehicle Inventory & Lots Tab** (`inventory` — 5th Admin Tab): Comprehensive full-width vehicle inventory management suite displaying active catalog lots, editable vehicle specifications, and status lifecycles.
    - Status filtering pills: `All`, `Draft`, `Preview`, `Upcoming`, `Live`, and `Ended`.
    - Real-time lot search filtering across make, model, VIN, and title.
    - Server-assisted client pagination (configurable page size with previous/next navigation).
    - Row-level controls: quick status dropdown switcher, live CAD high bid tracking, direct authoring workspace launch links (`/dashboard/listings/${id}/edit`), and single-lot deletion triggers.
    - **Seller Attribution & Cross-Tab Deep-Linking**: A dedicated 3rd sub-line in the SPECIFICATIONS table cell beneath the VIN displaying clickable seller attribution (`Seller: ${sellerName || sellerEmail}`). Clicking the attribution switches `activeTab` to `'bidders'`, seeds the directory search input with the seller credentials, and smoothly scrolls the matched member row into view. Displays fallback attribution (`Seller: Direct / Wailtail`) for unassigned direct platform listings.
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
    6. Cleanses URL query parameters (`clearUrlParams()`) via `window.history.replaceState` (`const cleanUrl = window.location.pathname; window.history.replaceState({}, document.title, cleanUrl);`) to guarantee that refreshing or bookmarking does not re-trigger triage confirmation modals.
- **Non-Blocking Single & Bulk Consignment Rejection Email Dispatches (`auctionService.ts`)**:
  - Whenever an application is rejected—either via single modal triage (`updateConsignmentStatus`) or the bulk toolbar (`batchUpdateConsignmentStatus`):
    - `auctionService.ts` executes an asynchronous dispatch to `/api/send-consignment-email` with payload `type: 'consignment_rejected'`.
    - Enforces recipient property fallback resolution (`sellerEmail` vs `email`), vehicle taxonomy fallback hydration (`year`, `make`, `model`, `generation`), and staff review notes pass-through.
    - All bulk rejection emails are fired concurrently using `Promise.allSettled` and non-blocking `try/catch` wrappers, guaranteeing that any third-party SMTP or Resend API latency/errors will not block the transactional Firestore batch status update or halt the administrative user experience.
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
  - **Administrator Account Deletion (`deleteUserRecord`)**: Client sends a revocation-aware Firebase ID token and target UID to `/api/admin-delete-user`; the server verifies the designated administrator allowlist, rejects self-deletion and protected administrator targets, deletes the Auth identity, and performs Firestore cleanup across direct profile documents and exact-UID legacy matches. Auth and Firestore operations are not atomic; incomplete cleanup returns an error and can be retried. The client has no Firestore fallback.
- **1-Click Consignment Approval Draft Conversion (`convertConsignmentToDraftListing`)**:
  - Administrators review pending vehicle consignment intake submissions and click `"Approve & Convert to Draft"`.
  - Atomically creates a fresh listing document in `auctions/{newAuctionId}` pre-populated with:
    - Vehicle identity: Year, Make, Model, Generation, VIN, Mileage, and Transmission.
    - Structured location fields: `locationCity`, `locationProvince`, `locationCountry`, and formatted `location`.
    - Editorial title auto-generated from taxonomy components.
    - Financial defaults: parsed reserve amount from `reserveExpectation` (or `$0 CAD` No Reserve), `$1,000 CAD` starting bid, `$250 CAD` minimum increment, and `status: 'upcoming'`.
  - Promotes the applicant to the `SELLER` role in Firestore across `users/{uid}` and `bidders/{uid}` (preserving `ADMIN`): checks legacy `app.registeredUserId` if present on historical records, or dynamically queries for an existing member record matching `app.sellerEmail` when a legacy registered user ID is unavailable.
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

### 6.6 Public Q&A Thread, Pinned Seller Announcements & URL Linkifier (`CommentSection.tsx`)
- High-visibility public discussion stream for vehicle inquiries, questions, and provenance notes.
- **Pinned Seller Announcement Subsystem**:
  - Allows verified sellers and platform administrators to pin an official announcement or provenance note directly to the top of the comment feed.
  - **Single-Pinned Constraint**: Enforced at the service layer in Firestore via `pinComment(auctionId, commentId, adminUid)`. Atomically iterates through active comments to unpin existing pinned entries before committing `isPinned: true`, `pinnedAt: Date.now()`, and `pinnedBy: adminUid`, ensuring strictly one pinned announcement per lot.
  - **Prioritized Feed Sorting & Visual Treatment**: Comments are sorted with pinned comments lifted to the very top, styled with amber borders, a prominent `📌 PINNED ANNOUNCEMENT` header badge, and an unpin action trigger for authorized sellers/admins (`unpinComment`).
- **Discussion Stream Regex URL Linkifier (`renderLinkedText`)**:
  - Comments dynamically parse raw text and convert HTTP and HTTPS URLs into styled, secure hyperlinks (`target="_blank"`, `rel="noopener noreferrer"`, `text-amber-400 hover:underline`).
  - Supports non-link text preservation and safe rendering of community documentation links.
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
- **Full-Bleed Catalog Homepage Announcement Ribbon**:
  - Pinned flush beneath `Navbar.tsx`, providing an edge-to-edge dark slate container (`bg-slate-900 border-b border-amber-500/20`) with inner `max-w-7xl` content alignment matching the vehicle grid.
  - Displays high-priority platform broadcasts with warm amber badge tags, actionable CTA buttons, and direct non-blocking telemetry logging (`recordPromoClick('catalog_banner', true)`).
- **Unified Catalog Grid Cadence Injection Pipeline**:
  - Operates on a unified injection pipeline supporting both low-inventory row padding ($\le 2$ lots) and populated cadence splicing ($> 2$ lots) governed by admin-configured `cadenceInterval` (0 [Disabled], 6, 9, 12 lots) using safe modulo cycling.
  - Injected promotional cards match catalog vehicle card dimensions, preserving grid alignment across responsive breakpoints.
- **Eradication of Client-Side Dismissal Suppression**:
  - Purged all ✕ dismiss buttons, dismissal handlers, and permanent `localStorage` caching (`wailtail_dismissed_promos`).
  - Promotional visibility is 100% deterministic, governed strictly by administrative enablement toggles, audience segmentation (`all`, `guests_only`, `authenticated_only`), and active scheduling dates.

### 6.8 Seller Onboarding Flow & Consignment Intake (`ConsignmentModal.tsx`)
- **"Sell Your Vehicle" Header Action**:
  - Prominent amber call-to-action button in `Navbar.tsx` and catalog banner header.
  - Opens `ConsignmentModal.tsx` for seller intake inquiries.
- **3-Tier Vehicle Taxonomy & Custom Fallbacks**:
  - Standardized Year select (1930–2026), Make selector, Model selector, and Generation/Chassis Code selector backed by `vehicleTaxonomy.json`.
  - Integrated `TAXONOMY_OTHER_CUSTOM` fallback text inputs for unlisted makes, bespoke models, or rare coachbuilt variants.
- **Universal Gearbox Taxonomy Symmetry**:
  - Transmission selector implements the universal 12-entry automotive gearbox taxonomy (4-Speed Manual, 5-Speed Manual, 6-Speed Manual, 7-Speed Manual, Automatic / Torque Converter, Dual-Clutch Automatic (DCT), Automated Manual (SMG/F1/E-Gear), Continuously Variable Transmission (CVT), Single-Speed Direct Drive (EV), Sequential / Dog-Leg, Preselector / Semi-Automatic, Other / Custom Gearbox...) matching `ListingEditorWorkspace.tsx`, complete with dynamic text input for custom configurations.
- **Strict Numeric & Telephone Input Sanitization**:
  - Odometer Reading input restricts characters strictly to numeric digits (`[^0-9]`).
  - Phone Number input restricts characters strictly to telephone characters (`[^0-9+\-() ]`), preventing malformed entries.
- **Mandatory Clickwrap Legal Agreement Checkbox**:
  - Controlled unchecked checkbox requiring explicit applicant agreement to Wailtail's Terms of Service and Privacy Policy before submission.
  - The submission button remains disabled until agreement is certified, ensuring PIPEDA compliance and legal defensibility.
- **Contextual Consignment FAQ Accordion ("Seller FAQ & Settlement Details")**:
  - Embedded collapsible accordion positioned directly above the clickwrap agreement checkbox and submission button (`isFaqOpen: false` by default to avoid vertical form displacement).
  - Directly resolves top Canadian consignor friction points and questions:
    1. **Retail Enthusiast Marketplace vs. Wholesale Dealer Arbitrations**: Explains that Wailtail is a curated digital auction for private collector vehicles—not a dealer-only wholesale clearinghouse. Transactions are direct private-party CAD sales without OMVIC dealer middleman arbitration bottlenecks, post-sale condition reports, or red/green light arbitration panels.
    2. **Direct 100% CAD Settlement Before Vehicle Release**: Confirms the consignor maintains possession of the vehicle and title until 100% of cleared funds settle directly into their Canadian bank account via verified wire transfer or certified draft.
    3. **Consignor-Provided Photography**: Explains that sellers provide their own high-resolution photography without mandatory 3rd-party inspector dispatch delays, while maintaining collector standards.
  - Integrates an inline secondary trigger button (`"Learn more in our Selling Guide →"`) invoking `openHowItWorks('selling')` to open `HowItWorksModal.tsx` pre-selected to the "Selling on Wailtail" tab.
- **Consignment Workflow Safeguards & Unvetted Draft Bypass Purge**:
  - Completely purged the unvetted "Ready to draft your listing right now?" bypass card, post-submission "Open Listing Workspace" CTA button, and `onLaunchDirectListing` prop from `ConsignmentModal.tsx`.
  - Applicants are strictly restricted to "Close & Return to Catalog", enforcing mandatory administrative curation, identity verification, and manual approval prior to draft workspace provisioning.
- **3-Column Structured Location Panel**:
  - Clean separation into City (`locationCity`), Province / State (`locationProvince`), and Country (`locationCountry`) with automatic composite string formatting (`formattedLocation`).
- **Client-Side Registered Member Detection (`onBlur`) & Legacy Auto-Link Distinction**:
  - **Client-Side Account Recognition**: When an applicant enters their email address and blurs the input, `checkUserAccountByEmail(email)` queries Firestore `users` to detect if the consignor is already a registered Wailtail member. If recognized, a green notification banner surfaces displaying their member name and role (`REGISTERED BIDDER` or `REGISTERED SELLER`) and auto-populates contact fields for applicant convenience.
  - **Historical vs. Current M2.0A Document Association**:
    - *Historical Behavior*: Prior submissions attached client-supplied registration metadata (`registeredUserId`, `isRegisteredUser: true`, and `registeredUserRole`) directly into the persisted consignment document.
    - *Current M2.0A Implementation*: New consignment submissions strictly omit these registration metadata fields and no longer write `registeredUserId`, `isRegisteredUser`, or `registeredUserRole` into application documents. Non-admin creation payloads attempting to set these fields are rejected by Firestore security rules (`firestore.rules`). Account association, administrative conversion (`convertConsignmentToDraftListing()`), and applicant read authorization operate via verified email claims matching normalized `sellerEmail`.
    - *Historical Records Retention*: Existing historical consignment documents may still contain legacy registration metadata. These records have not been migrated or deleted, and workflows retain backwards compatibility with both legacy documents and new M2.0A submissions.
- **Single-Pass Persistence & Consolidated Serverless Notification Pipeline (`auctionService.ts`)**:
  - **Normalized Lowercase Seller Email**: Consignment submissions normalize `sellerEmail` via `(app.sellerEmail || '').trim().toLowerCase()` before writing to Firestore, ensuring case alignment with authentication tokens.
  - **Primary Application Persistence & Error Propagation**: Submissions are written primarily to Firestore `consignment_applications` via `addDoc(collection(db, 'consignment_applications'), sanitizePayload(payload))`. If this primary write fails, the error propagates directly to the caller and the function aborts immediately; it does not fabricate synthetic application IDs or falsely signal success.
  - **Best-Effort Legacy Dual-Write**: For backwards compatibility, the application is also written to the legacy `consignments` collection (`setDoc(doc(db, 'consignments', createdId), sanitizePayload(payload))`) inside an isolated try/catch block. Failures on the legacy dual-write are logged as non-fatal warnings and do not invalidate or roll back a successful primary write.
  - **Non-Blocking Post-Persistence Notification Dispatch**: Serverless email notification dispatch (`/api/send-consignment-email`) occurs asynchronously after primary persistence with an isolated 5000ms timeout guard (`AbortController`). Because notifications are triggered post-persistence in a non-blocking background routine, email delivery latency or external mailer errors never halt execution or falsely report submission failure to the applicant.
  - Consolidates intake processing into a single-pass serverless execution, removing redundant client-side receipt dispatches and enforcing case-insensitive admin recipient deduplication in `/api/send-consignment-email`.
  - Immediately triggers dual notifications: structured intake digest with triage deep-links to curation staff, and dual-branded receipt confirmation to the consignor.
- **Seller Workspace Claim Onboarding Pipeline (`action=claim_seller`)**:
  - Upon consignment approval, the seller receives an email containing a dedicated claim onboarding deep-link targeting `/dashboard/listings/${convertedAuctionId}/edit?action=claim_seller&appId=${appId}&lot=${convertedAuctionId}&email=${sellerEmail}`.
  - When opened by an unauthenticated seller, `AuthModal.tsx` activates the registration tab, pre-fills the applicant's email address, and renders an emerald onboarding banner (`"Seller Onboarding & Listing Claim — Create your Wailtail account or sign in with your approved consignment email to claim your listing workspace."`).
  - **Approved-Consignor Server Authorization (M2.0B)**:
    - After authentication, `AuthContext.tsx` calls `POST /api/authorize-approved-consignor`; the client does not directly promote roles or assign auction ownership.
    - The endpoint verifies the Firebase ID token with revocation checking, derives identity from the verified token, and revalidates the matching approved application inside the Firestore transaction before making authorization writes.
    - The transaction atomically updates `users/{uid}` and `bidders/{uid}`, preserves designated administrator roles, and links a converted auction only when its seller assignment is empty or already belongs to the same UID. Conflicting assignments are left unchanged.
    - Firebase Auth `user.emailVerified` is the sole client-side email-verification authority. Firestore profile fields cannot independently establish verification or administrator authority.

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

### 6.11 Lot-Level Action Controls & Provenance Cloud Dossier Placement (`AuctionHeader.tsx`, `App.tsx`, `PhotoGalleryGrid.tsx`)
- Contextual action controls in `AuctionHeader.tsx` streamlined to focus on "Watch", "Share", and Hagerty Canada Valuation, keeping mobile headers uncluttered and preserving above-the-fold anti-snipe countdown timers and financial telemetry.
- **Top Header Ergonomics**:
  - The external Cloud Dossier button was removed from `AuctionHeader.tsx` LOT ACTIONS to eliminate mobile clutter and prevent visual noise in the bidding telemetry bar.
- **Dual-Surface Cloud Dossier Architecture**:
  - External cloud service records and provenance dossiers (`serviceRecordsUrl`) are seamlessly surfaced across two high-context locations:
    1. **Public Vehicle Highlights Sidebar Card (`App.tsx`)**: Prominent "Historical Records & Invoices (Cloud Dossier) ↗" button placed beneath the core technical specifications card, matching the listing editor workspace preview pane.
    2. **Featured Cloud Dossier Card in Gallery Records Tab (`PhotoGalleryGrid.tsx`)**: Dedicated high-contrast featured card in Section 5 ("Records & Title") with external provider detection (Google Drive, Dropbox, OneDrive, or generic cloud storage) and direct `target="_blank"` external navigation.
- **Interactive Watch Toggle ("★ Watch" / "★ Watching")**:
  - Real-time watch state (`isWatching`) synchronized with `userProfile.watchlist` array.
  - Clicking invokes `toggleWatchlistLot(user.uid, auction.id)`, updating Firestore `users/{uid}` and `bidders/{uid}` documents and syncing aggregate lot watch tallies via `toggleWatchAuction`.
  - Unauthenticated interactions trigger an informative toast directing visitors to log in or register.
  - High-contrast visual indicators: Amber solid background with ring highlight when active (`★ Watching`), slate bordered button when inactive (`★ Watch`).
- **Instant URL Clipboard Share ("🔗 Share")**:
  - Copies canonical auction URL (`window.location.href`) directly to clipboard via `navigator.clipboard.writeText()`.
  - Dispatches an instant high-visibility success toast notification (`Listing link copied to clipboard!`).
- **Hagerty® Canada Valuation Report Action**:
  - Prominent high-contrast CTA button rendered conditionally when `auction.hagertyValuationUrl` is defined.
  - Formatted via `formatExternalUrl()` to enforce case-insensitive `https://` protocol prefixing and prevent browser relative-URL path resolution failures.
  - Features the `TrendingUp` icon, opens in a new browser tab (`target="_blank"`, `rel="noopener noreferrer"`), and connects collectors directly to third-party Hagerty Canada market appraisal data.
  - Fully replicated in the split-screen authoring workspace live preview pane (`ListingEditorWorkspace.tsx`).

### 6.12 Global Navigation & Footer (`Navbar.tsx`, `Footer.tsx`)
- **User Profile Dropdown Positioning Repair (`Navbar.tsx`)**:
  - Replaced rigid fixed flex positioning with a dedicated `relative inline-block` wrapper ref (`userMenuRef`).
  - Dropdown menu is pinned with `absolute right-0 top-full mt-2 w-64 z-50` with high-contrast slate surfaces (`bg-slate-900 border border-slate-800 rounded-xl shadow-2xl`).
  - Completely resolves right-edge viewport clipping, vertical flex squishing, and overlapping with adjacent CTA buttons on smaller desktop and tablet screens.
  - Features outside-click listener (`handleClickOutside`) bound via React refs to guarantee clean teardown upon outside clicks or route navigation.
- **Global Footer Overhaul & Platform Copy (`Footer.tsx`)**:
  - Primary editorial description updated to reflect curated Canadian classic, collector, and enthusiast vehicle auctions.
  - Prominent national geographic tagline: `"Consigning & Bidding Nationwide Across Canada 🇨🇦"`.
  - Direct external routing to the Wailtail Legacy Marketplace ([https://marketplace.wailtail.com](https://marketplace.wailtail.com)).
  - Interactive "Consign a Vehicle" call-to-action opening the consignment intake workflow (`onOpenConsignment`).
  - Integrated legal compliance modal triggers invoking `LegalModal.tsx` directly into the designated active tab (`openLegalModal('terms')` or `openLegalModal('privacy')`).

### 6.13 Promotional & Launch Campaign Manager (`AdminPortalPage.tsx`, `VehicleCatalogGrid.tsx`, `AuctionHeader.tsx`)

The platform integrates a dynamic promotional subsystem designed to spotlight launch promotions, seller incentives, early-access membership perks, and high-visibility CTAs:

1. **Centralized Campaign Control Suite (`AdminPortalPage.tsx` under Platform Branding)**:
   - **Dual-Slot Independent Announcement Banners**:
     - Independent control suites for **Catalog Homepage Announcement Banner** (`catalogBanner`) and **Direct-Lot Header Banner** (`lotHeaderBanner`).
     - Each slot features independent master enablement toggles, badge text, headline/copy inputs, audience segmentation (`all`, `guests_only`, `authenticated_only`), date scheduling (`startDate`, `expiresAt`), CTA routing (`consignment_modal`, `auth_modal`, `contact_modal`, `external_url`), and live click telemetry tracking.
   - **Catalog Grid Promotional Cadence Controls**:
     - Admin-configurable cadence selector (`cadenceInterval`: -1 [Launch Mode: Show All Active Cards], 0 [Low Inventory Only], 6, 9, 12 lots) determining how frequently promotional cards are spliced into active catalog inventory rows.
     - Launch Mode (`cadenceInterval: -1`) overrides the low-inventory row-padding slot cap ($\le 2$ lots), allowing all active audience-matched promotional cards to be displayed concurrently and wrap naturally into multi-row grid layouts. On populated catalogs ($> 2$ lots), Launch Mode evenly interleaves all active campaign cards throughout catalog inventory rows for 100% impression visibility.
     - Standard cadence splicing utilizes safe modulo indexing (`index % cadenceInterval === 0`) ensuring promotional cards are injected at consistent intervals without layout disruption.
   - **Master Platform Switches**:
     - Global platform switch (`PlatformPromoSettings.enabled`) allows administrators to immediately activate or deactivate all promotional cards and banners across the platform.
     - Slot-level banner toggles (`catalogBanner.enabled`, `lotHeaderBanner.enabled`) and card-level toggles (`card.enabled`) provide granular switch controls.
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
   - **Unified In-Grid Cadence & Row Padding Pipeline**: When catalog vehicle inventory is low ($\le 2$ lots), the grid automatically injects active promotional cards (`promoCardsToInject`) into empty grid slots to maintain an editorial layout; when inventory is populated ($> 2$ lots), cards are dynamically spliced at the admin-selected cadence interval (6, 9, or 12 lots). Selecting Launch Mode (`cadenceInterval: -1`) overrides the low-inventory row-padding slot cap ($\le 2$ lots), allowing all active audience-matched promotional cards to be displayed concurrently and wrap naturally into multi-row grid layouts; on populated catalogs ($> 2$ lots), Launch Mode evenly interleaves all active campaign cards throughout catalog inventory rows for 100% impression visibility.
   - **Complete Eradication of Client Dismissal Suppression**:
     - Purged all ✕ dismiss buttons, dismissal handlers, and permanent `localStorage` caching (`wailtail_dismissed_promos`).
     - Campaign impressions are 100% deterministic, governed strictly by administrative enablement toggles, audience targeting, and schedule active windows.

3. **Dual-Slot Announcement Banners (`VehicleCatalogGrid.tsx`, `AuctionHeader.tsx`)**:
   - **Full-Bleed Catalog Homepage Announcement Ribbon (`VehicleCatalogGrid.tsx`)**: Pinned flush beneath `Navbar.tsx` with an edge-to-edge dark slate container (`bg-slate-900 border-b border-amber-500/20`), inner `max-w-7xl` alignment, warm amber badge/CTA styling, and non-blocking telemetry logging.
   - **Direct-Lot Promotional Header Banner (`AuctionHeader.tsx`)**: High-contrast banner rendered directly above vehicle titles on single-car lot pages (`/auctions/[id]`), optimized for conversion from direct social/forum traffic. Dismissal persistence (`LOT_HEADER_BANNER_ID`) in `localStorage` has been eradicated in favor of 100% deterministic admin control.

4. **Decoupled Guest Telemetry Engine (`promo_analytics`)**:
   - Telemetry execution (`recordPromoClick(promoId, isBanner)`) writes directly to independent documents in the `promo_analytics` collection using atomic Firestore `increment(1)` operations (`'catalog_banner'` for homepage ribbon interactions, `'lot_header_banner'` for single lot banners, and specific promo card IDs).
   - **Security Decoupling**: Solves permission errors (HTTP 403 Forbidden) for unauthenticated visitors by allowing public writes (`allow create, update: if true;`) to `promo_analytics`, while the root configuration `settings/promotions` remains locked strictly to administrators.
   - **Non-Blocking Telemetry Failover**: Wrapped in silent `try/catch` handlers to guarantee that analytics logging never degrades or blocks visitor navigation.
   - **Real-Time Staff Telemetry Feed**: `subscribeToPromoAnalytics` powers real-time click counter badges (`MousePointerClick`) in `AdminPortalPage.tsx`, displaying live interaction counts alongside each campaign asset.

5. **Floating Feedback & Bug Report Dock Controls (`AdminPortalPage.tsx`, `FloatingFeedbackWidget.tsx`)**:
   - **Administrative Campaign Management**: Dedicated management card in Platform Branding (`activeTab === 'branding'`) featuring an Emerald/Slate master toggle switch (`promoSettings.feedbackWidget.enabled`), custom dock label input (`label`, defaulting to "Feedback & Bug Report"), and optional callout badge text input (`badgeText`, e.g., "BETA", "NEW").
   - **Firestore Persistence**: State updates are persisted to the `settings/promotions` singleton document via `handleUpdateFeedbackWidget()` and `savePromoSettings()`, synchronizing across all visitor sessions via real-time snapshot listeners.
   - **Mobile Bid Bar Collision Avoidance**: Viewport and route-aware layout engine that detects when the user is on a single lot view (`/auctions/[id]`) and dynamically translates the widget positioning to `bottom-24 right-4` on mobile viewports ($< 768\text{px}$), completely clearing `StickyBidBar.tsx` high-bid metrics and bidding CTAs while resting at standard `bottom-6 right-6` on wider desktop screens and catalog/admin routes.

---

## 7. Security Rules & Permissions

### 7.1 3-Way Role Hierarchy (`ADMIN`, `SELLER`, `BIDDER`) & Permissions Matrix

Wailtail implements a tri-role access control model defined in `src/types.ts` via `UserRole = 'ADMIN' | 'SELLER' | 'BIDDER'`:

| Platform Capability | Guest / Anonymous | BIDDER | SELLER | ADMIN |
| :--- | :---: | :---: | :---: | :---: |
| Browse Catalog & View Vehicle Lots (`/`, `/catalog`, `/auctions/[id]`) | ✅ | ✅ | ✅ | ✅ |
| Submit Consignment Inquiry (`ConsignmentModal.tsx`) | ✅ (Guest Intake + Clickwrap) | ✅ (Email-Associated + Clickwrap; Legacy Auto-Link) | ✅ (Email-Associated + Clickwrap; Legacy Auto-Link) | ✅ (Email-Associated + Clickwrap; Legacy Auto-Link) |
| Place Real-Time Anti-Snipe Bids (`BidModal.tsx`) | ❌ | ✅ (Unbanned + Mandatory Clickwrap) | ✅ (Unbanned + Mandatory Clickwrap) | ✅ (Mandatory Clickwrap) |
| Watchlist Auctions & Receive High-Bid Alerts | ❌ | ✅ | ✅ | ✅ |
| Post Community Comments & Discussion Questions | ❌ | ✅ (`Verified Bidder`) | ✅ (`Seller`) | ✅ (`Staff / Admin`) |
| Reply with Official Verified Badges in Comments | ❌ | ❌ | ✅ (`SELLER`) | ✅ (`STAFF / ADMIN`) |
| Access User Activity Hub Modal (`UserAccountHubModal.tsx`) | ❌ | ✅ | ✅ | ✅ |
| View Won Lots & 4-Stage Offline CAD Settlement Checklist | ❌ | ✅ | ✅ | ✅ |
| Access Dedicated Listing Workspace (`/dashboard/listings/[id]/edit`) | ❌ | ❌ | ✅ (Filtered to Owned Lots via `visibleAuctions`) | ✅ (All Catalog Lots) |
| Authoring Workspace Header Tools (Import JSON, Export JSON, + New Listing) | ❌ | ❌ | ❌ (Role-Gated) | ✅ |
| Manual Auction Force-Close & Offline Settlement Lifecycle Overrides | ❌ | ❌ | ❌ (Restricted to Draft / Scheduled) | ✅ (`Ended`, `Sold`) |
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
      allow create: if isAuthenticated() &&
        (!request.resource.data.keys().hasAny(['sellerType', 'dealerId', 'dealerSnapshot', 'dealerDocFee', 'taxHandling', 'taxDisclaimerVersion']) || isAdmin());
      allow update: if isAuthenticated() &&
        (isAdmin() || !request.resource.data.diff(resource.data).affectedKeys().hasAny(['sellerType', 'dealerId', 'dealerSnapshot', 'dealerDocFee', 'taxHandling', 'taxDisclaimerVersion']));
      allow delete: if isAuthenticated();

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
      allow create: if isAuthenticated() && (!('dealerId' in request.resource.data) || isAdmin());
      allow update: if isAdmin() || (isOwner(userId) && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['dealerId']));
      allow delete: if isOwner(userId) || isAdmin();
    }

    match /bidders/{bidderId} {
      allow read: if true;
      allow create: if isAuthenticated() && (!('dealerId' in request.resource.data) || isAdmin());
      allow update: if isAdmin() || (isOwner(bidderId) && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['dealerId']));
      allow delete: if isOwner(bidderId) || isAdmin();
    }

    // Dealer Profiles (Private Canonical Records)
    match /dealer_profiles/{dealerId} {
      allow read: if isAdmin();
      allow write: if false;
      allow delete: if false;
    }

    // Dealer Verification Audits (Append-only Administrative History)
    match /dealer_verification_audits/{auditId} {
      allow read: if isAdmin();
      allow create: if false;
      allow update, delete: if false;
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
    match /feedback/{feedbackId} {
      allow create: if true;
      allow read, update, delete: if isAdmin();
    }

    match /consignment_applications/{appId} {
      allow create: if isAdmin() || (
        request.resource.data.status == 'pending' &&
        !request.resource.data.keys().hasAny([
          'sellerType',
          'dealerId',
          'dealerSnapshot',
          'dealerDocFee',
          'taxHandling',
          'taxDisclaimerVersion',
          'verifiedAt',
          'verifierUid',
          'verificationStatus',
          'verificationMethod',
          'verificationExpiresAt',
          'verificationRecordVersion',
          'reviewedAt',
          'reviewedBy',
          'convertedAuctionId',
          'updatedAt',
          'registeredUserId',
          'isRegisteredUser',
          'registeredUserRole'
        ])
      );
      allow read: if isAdmin() || (
        isAuthenticated() &&
        request.auth.token.email != null &&
        request.auth.token.email_verified == true &&
        resource.data.sellerEmail == request.auth.token.email.lower()
      );
      allow update, delete: if isAdmin();
    }

    match /consignments/{consignmentId} {
      allow create: if isAdmin() || (
        request.resource.data.status == 'pending' &&
        !request.resource.data.keys().hasAny([
          'sellerType',
          'dealerId',
          'dealerSnapshot',
          'dealerDocFee',
          'taxHandling',
          'taxDisclaimerVersion',
          'verifiedAt',
          'verifierUid',
          'verificationStatus',
          'verificationMethod',
          'verificationExpiresAt',
          'verificationRecordVersion',
          'reviewedAt',
          'reviewedBy',
          'convertedAuctionId',
          'updatedAt',
          'registeredUserId',
          'isRegisteredUser',
          'registeredUserRole'
        ])
      );
      allow read: if isAdmin() || (
        isAuthenticated() &&
        request.auth.token.email != null &&
        request.auth.token.email_verified == true &&
        resource.data.sellerEmail == request.auth.token.email.lower()
      );
      allow update, delete: if isAdmin();
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

    match /emailLogs/{logId} {
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

4. **Git Post-Commit Hook Pipeline & Knowledge Base Synchronization (`scripts/post-commit`)**:
   - To maintain an automated, zero-drift documentation mirror for external AI tools and the Gemini Gem Knowledge Base, the repository includes a tracked post-commit hook at `scripts/post-commit`.
   - **Activation**:
     ```bash
     cp scripts/post-commit .git/hooks/post-commit && chmod +x .git/hooks/post-commit
     ```
   - **Mirrored Artifacts**: Automatically mirrors `README.md`, `CHANGELOG.md`, `SYSTEM_BIBLE.md`, and `firestore.rules` to the local Google Drive Knowledge Base directory (`/home/jeremy/GoogleDrive/06_WEBSITES/WailTail.com/auction`) upon every successful commit with non-blocking error tolerance (`2>/dev/null || true`).
   - **Operational Distinctions**:
     - *Google Drive Sync vs. Gemini Gem*: Drive synchronization occurs continuously on commit. Gemini Gem Knowledge Bases freeze context upon session launch; new chat sessions must be created to mount updated context.
     - *Local Mirroring vs. Live Rules Deployment*: Mirroring `firestore.rules` to Google Drive does not deploy rules to production. Live Firestore rules deployment must be executed explicitly via `npm run deploy:rules`.

### 7.5 Serverless Edge & Administrator Account Deletion Architecture (`/api/admin-delete-user.ts`)

The account-deletion endpoint is a trusted server-side administrative operation. Its security model is documented in Section 5.4 and implemented in `server/api/admin-delete-user.ts`.

- **Caller authentication**: POST only; requires a Bearer Firebase ID token verified by Firebase Admin with revocation checking (`verifyIdToken(idToken, true)`).
- **Administrator authorization**: requires a verified email matching the shared designated-administrator allowlist. The acting administrator identity is derived from the verified token, never from request-body identity fields.
- **Protected identities**: rejects self-deletion and both designated administrator targets. It checks the target Auth email and independently resolves current designated administrator Auth UIDs by allowlisted email. Unexpected lookup errors fail closed.
- **Server-owned deletion**: the client sends only `{ uid }`; the server deletes the Auth identity and then removes direct `users/{uid}` / `bidders/{uid}` profiles and legacy documents with an exact matching `uid` field. Email-only document deletion is prohibited.
- **Retry semantics**: Auth and Firestore are separate systems and cannot be deleted atomically. If Firestore queries or batch commits fail after Auth deletion, the endpoint returns HTTP 500 (`admin/incomplete-deletion`). A retry tolerates the already-missing Auth identity and retries Firestore cleanup. Query errors must never be swallowed or converted into success.
- **No client fallback**: `deleteUserRecord()` fails closed and never performs client-side Firestore deletion if the request fails.
- **Verification**: 44 administrator-deletion regression tests plus 41 approved-consignor endpoint tests (85 combined endpoint tests); 126 Firestore rules tests. Roo Code reported lint, TypeScript, production build and test checks passing before the staging commit. The staging commit itself must still be distinguished from a successful CI run.
- **Known limitation**: if a designated administrator Auth identity is already absent, lookup by email cannot recover its former UID. Protecting orphaned profile records in that exceptional state requires stable administrator UIDs in protected server configuration. Do not invent or assume those UIDs.
- **Release status**: committed to staging in `860042bc35fcc98246f6385a035fc08d3c84d01f`; not production-deployed. Auction ownership and mutation authorization was subsequently accepted on staging through PR #3; its production rollout and verification remain separate.

### 7.6 Authentication Security & Session Defense (`AuthContext.tsx` & `AuthModal.tsx`)

The platform implements multi-layer session defense mechanisms in `src/context/AuthContext.tsx` and `src/components/AuthModal.tsx` to maintain absolute data integrity and prevent unauthorized access:

1. **Orphaned Session Revocation Guard**:
   - **Initial Auth Restoration Guard**: During `onAuthStateChanged` hydration, if Firebase Auth returns an authenticated user but their corresponding Firestore profile `users/{currentUser.uid}` does not exist (and registration is not actively pending), `AuthContext` instantly treats the session as orphaned/deleted.
   - **Real-Time Deletion Listener**: An active `onSnapshot` listener on `users/{currentAuthUser.uid}` monitors live document state. If an administrator deletes the account in the Member Directory while the user is actively browsing:
     - Immediately executes `signOut(auth)` via `fbSignOut`.
     - Flushes local state (`user: null`, `userProfile: null`).
     - Dispatches a prominent high-visibility toast notice: `"This account has been deleted by an administrator."`.
     - Instantly redirects the client to the root homepage (`/`).

2. **Strict Email Verification Enforcement (M2.0B Correction A & B)**:
   - **Authoritative Firebase Auth Verification**: Following M2.0B Security Correction A, email verification state (`isEmailVerified`) derives strictly from `user.emailVerified` on the authenticated Firebase user instance. Mutable Firestore profile fields (`userProfile.isEmailVerified`) never independently establish verification, authentication trust, or administrator authority.
   - **Auto-Logout Post-Signup**: When a user registers an account via email and password, `AuthContext.tsx` dispatches a verification email and immediately calls `signOut(auth)` to terminate the automatic Firebase client auto-login.
   - **Unverified Login Blocking**: During sign-in attempts in `AuthModal.tsx` and session evaluation in `AuthContext.tsx`, accounts where `!currentUser.emailVerified` are blocked from session hydration, immediately signed out, and prompted with an informative verification notice. Authenticated state is only unlocked upon Firebase Auth email link confirmation (or pre-verified Google OAuth credentials).
   - **Credentialed Status Checks (`checkEmailVerification`)**: Enables users to verify their email status without an existing session by submitting credentials (`email` and `pass`). The routine signs in, reloads the user instance via `currentUser.reload()`, and if `currentUser.emailVerified === true`, mirrors `isEmailVerified: true` across both `users/{uid}` and `bidders/{uid}` collections in Firestore while returning full authenticated session state.
   - **Deferred Welcome Email Dispatch**: To guarantee that welcome emails are only received by genuine, confirmed recipients, `sendWelcomeBidderEmail` (`type: 'welcome_bidder'`) is suppressed during initial signup. It is triggered strictly after verification is confirmed by Firebase Authentication (`currentUser.emailVerified === true`), with duplicate deliveries guarded via `welcomeEmailSent` in Firestore state.
   - **Firestore Self-Verification Defense (Correction B)**: Security rules in `firestore.rules` mandate that writing `isEmailVerified: true` on `users` or `bidders` documents requires `request.auth.token.email_verified == true`. Client-side demo self-verification (`manualVerifyForDemo`) is deprecated and disabled.

3. **Google OAuth Direct State Hydration (`signInGoogle`)**:
   - Executes pop-up authentication via `signInWithPopup(auth, googleProvider)`.
   - **Zero-Refresh Direct Hydration**: Removes listener suppression flags and hydrates `user` and `userProfile` states directly (`setUser(cred.user); setUserProfile(profile);`), eradicating manual page reloads.
   - **Pre-Verified Credentials**: Sets `isEmailVerified: true` immediately, respecting Google OAuth's trusted verification status.
   - **Ban Enforcement**: Checks `profile.isBanned || profile.bannedFromBidding`, triggering immediate sign-out (`fbSignOut`) and error rejection if the member has been restricted.
   - **Admin Privileges Assignment**: Cross-references user email against `ADMIN_EMAILS`, provisioning `role: 'admin'` for authorized staff and default `role: 'bidder'` for standard members.

### 7.7 Continuous Knowledge Base Ingestion Pipeline

To provide external AI coding assistants and the Gemini Gem Knowledge Base with immediate, accurate architectural and rule context, the repository implements an automated post-commit documentation mirror pipeline.

1. **Local Git Hook Script (`scripts/post-commit`)**:
   Because `.git/hooks/` configurations are local to each clone and intentionally untracked by Git, the canonical hook script is maintained in source control at `scripts/post-commit`:
   ```sh
   #!/bin/sh
   TARGET="/home/jeremy/GoogleDrive/06_WEBSITES/WailTail.com/auction"
   mkdir -p "$TARGET"
   cp README.md CHANGELOG.md SYSTEM_BIBLE.md firestore.rules "$TARGET/" 2>/dev/null || true
   ```
   Developers activate the hook locally via:
   ```bash
   cp scripts/post-commit .git/hooks/post-commit && chmod +x .git/hooks/post-commit
   ```

2. **Mirrored Knowledge Base Assets**:
   On every successful local commit, the hook copies four foundational repository files to Google Drive:
   - `README.md` — Quickstart, developer workflows, and feature overview.
   - `CHANGELOG.md` — Version history, recent releases, and unreleased platform updates.
   - `SYSTEM_BIBLE.md` — Definitive ground-truth system architecture, workflows, and schemas.
   - `firestore.rules` — Production Firestore security rules and RBAC helpers.

3. **Target Ingestion Directory**:
   `/home/jeremy/GoogleDrive/06_WEBSITES/WailTail.com/auction`

4. **Architectural Distinction: Local Knowledge Base Ingestion vs. Live Database Rule Deployment**:
   - **Local Knowledge Base Ingestion**: The `scripts/post-commit` hook copies files locally to the Google Drive directory strictly for AI context ingestion and documentation continuity. **Committing changes and mirroring `firestore.rules` does NOT deploy rules to Firebase Cloud.**
   - **Live Database Rule Deployment**: Deploying `firestore.rules` to live Google Cloud Firestore (GCP project `studio-apps-483721`, named database instance `ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e`) must still be executed explicitly via:
     ```bash
     npm run deploy:rules
     ```
     This triggers `firebase deploy --only firestore:rules` via `firebase-tools`, validating syntax and uploading rules directly to the production cloud database.

5. **Operational Behavior with Gemini Gem Sessions**:
   Google Drive mirrors files continuously in real time. However, Gemini Gem Knowledge Bases freeze context per chat session upon initialization. Newly synced updates in Google Drive become visible to Gemini Gems only upon starting a new chat session.

---

## 8. Progressive Web App (PWA), Social Metadata & FCM Engine Architecture

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

### 8.7 Static Open Graph & Twitter Card Social Metadata Pipeline (`index.html`)

To maximize launch impact and viral reach across social networks and direct messaging applications, the platform implements pre-rendered, static Open Graph and Twitter Card social metadata directly within the root `index.html` entry document.

#### 1. Rationale in Client-Side Vite React SPAs
Traditional Single-Page Applications (SPAs) built with Vite and React perform routing and DOM rendering strictly on the client side. Web crawlers, scrapers, and preview link expanders—including Facebook external hit (`facebookexternalhit`), X/Twitterbot (`Twitterbot`), WhatsApp, Apple Messages (`iMessage`), Slack, Discord, and LinkedIn—do not execute JavaScript when parsing links. Instead, they make shallow, fast HTTP GET requests that only examine the initial raw HTML document returned by the origin server.

If social tags are injected or updated asynchronously via client-side libraries (e.g., `react-helmet`, `react-helmet-async`, or `useEffect`), web crawlers receive an unpopulated `<head>`, failing to display preview rich cards (resulting in fallback grey boxes or missing media thumbnails).

Following the platform's initial single-car launch campaign centered on the 1988 Porsche 928, static social metadata in `index.html` transitioned to an overarching generic digital platform card (`public/og-wailtail-platform.jpg`). Embedding this static platform metadata directly into `index.html`:
* **Guarantees 100% Preview Card Delivery**: Social crawlers immediately parse pre-baked Open Graph and Twitter Card metadata on the first byte without executing JavaScript.
* **Eliminates Server-Side Rendering (SSR) & Edge Overhead**: Obviates the need for running complex, costly server-side rendering nodes (such as Next.js, Remix, or edge workers with Chromium/Puppeteer prerendering) just for crawler metadata resolution.
* **Optimizes Edge CDN Caching**: Allows static HTML to be cached globally at edge CDN locations with sub-millisecond Time to First Byte (TTFB).

#### 2. Tag Specification & Launch Attributes
The static head payload in `index.html` specifies canonical Open Graph and Twitter Card tags configured for the overarching digital vehicle auction platform:

| Tag / Property | Attribute Value | Purpose & Architectural Role |
| :--- | :--- | :--- |
| `og:site_name` | `Wailtail Auctions` | Identifies the overarching collector vehicle auction platform brand. |
| `og:type` | `website` | Defines the Open Graph schema entity type for web crawlers. |
| `og:title` | `Wailtail — Canada's Digital Vehicle Auctions \| 0% Buyer Fees` | Clear, SEO-optimized title showcasing vehicle auction platform and 0% buyer fees. |
| `og:description` | `Canada's modern digital vehicle auction platform. Transparent CAD bidding, 0% buyer fees, and AI-powered listing creation. Buy and sell nationwide.` | Compelling editorial summary highlighting CAD bidding, 0% buyer fees, and AI listing creation. |
| `og:url` | `https://www.wailtail.com/` | Canonical launch URL establishing domain authority and eliminating duplicate link indexing. |
| `og:image` | `https://www.wailtail.com/og-wailtail-platform.jpg` | Absolute HTTPS URL to the high-resolution generic platform preview card asset. |
| `og:image:secure_url` | `https://www.wailtail.com/og-wailtail-platform.jpg` | Secure HTTPS target for strict SSL verification crawlers. |
| `og:image:type` | `image/jpeg` | Explicit MIME type enabling instant image ingestion by social bots. |
| `og:image:width` | `1200` | Recommended standard width ensuring instantaneous high-resolution card rendering without crawler layout reflow. |
| `og:image:height` | `630` | Standard 1.91:1 aspect ratio height preventing letterboxing or awkward image cropping. |
| `og:image:alt` | `Wailtail Digital Vehicle Auctions — Buy and Sell Nationwide Across Canada` | Accessible descriptive text for screen readers and search indexing. |
| `twitter:card` | `summary_large_image` | Specifies X/Twitter's prominent full-width hero photo card format for maximum visual conversion. |
| `twitter:site` | `@wailtail` | Official Twitter handle attribution for platform origin. |
| `twitter:creator` | `@wailtail` | Official Twitter handle attribution for platform creator. |
| `twitter:title` | `Wailtail — Canada's Digital Vehicle Auctions \| 0% Buyer Fees` | Matches Open Graph title for brand consistency across X/Twitter feeds. |
| `twitter:description` | `Canada's modern digital vehicle auction platform. Transparent CAD bidding, 0% buyer fees, and AI-powered listing creation. Buy and sell nationwide.` | Matches Open Graph description providing key platform terms in Twitter link previews. |
| `twitter:image` | `https://www.wailtail.com/og-wailtail-platform.jpg` | High-resolution platform preview asset mapped to X/Twitter card preview containers. |
| `twitter:image:alt` | `Wailtail Digital Vehicle Auctions — Buy and Sell Nationwide Across Canada` | Accessible image description ensuring compliance across Twitter clients. |

### 8.8 Google Analytics 4 (GA4) SPA Telemetry & Conversion Pipeline

The platform incorporates an enterprise-grade Google Analytics 4 (GA4) telemetry engine architected specifically for single-page applications (SPAs), pairing client-side route tracking with high-intent collector conversion attribution.

#### 1. Data Stream Configuration & Global Bootstrap (`index.html`)
- **Canonical Measurement ID**: `G-GQZ2L1RQ9M`
- **Asynchronous Script Ingestion**: Loaded asynchronously in `<head>` via Google Tag Manager (`googletagmanager.com/gtag/js?id=G-GQZ2L1RQ9M`) to ensure non-blocking page execution.
- **Suppression of Default Pageviews**: The initialization snippet explicitly sets `{ send_page_view: false }`:
  ```javascript
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-GQZ2L1RQ9M', { send_page_view: false });
  ```
  In a client-side Vite React application, allowing the default `gtag` script to emit an automatic `page_view` triggers an unhydrated landing hit before React completes routing resolution and state hydration. This leads to duplicate hits, mismatched titles, and distorted bounce metrics.

#### 2. SPA Tracking Mechanics & Reactive Document Title Synchronization (`src/App.tsx`)
In modern SPAs, navigation occurs via virtual DOM reconciliation and HTML5 History API (`pushState` / `replaceState`) without full-document browser reloads. To achieve accurate analytics:
- **Lifecycle Binding**: `trackPageView(path, title)` is dispatched directly beneath `App.tsx`'s centralized `document.title` synchronization `useEffect`.
- **Title Hydration Guarantee**: By executing immediately following `document.title` resolution, route pageviews capture fully hydrated, SEO-optimized titles (e.g. `1988 Porsche 928 S4 — Wailtail`, `Admin Operations Portal — Wailtail`, `Listing Editor: ... — Wailtail`, or `Wailtail — Curated Collector Car Auctions`) across all route transitions.
- **Authentication Guarding**: Pageview dispatching coordinates with `authLoading` suppression filtering to avoid registering transitional loading states as standalone page views.

#### 3. Telemetry Service Architecture (`src/utils/analytics.ts`)
The telemetry service wraps Google Analytics interactions in a typed, resilient utility layer:
- **Safe Window Typing**: Declares global `Window` interface extensions for `dataLayer?: any[]` and `gtag?: (...args: any[]) => void`.
- **Fail-Open Ad-Blocker Guards**: Every dispatch operation safely checks `typeof window !== 'undefined' && typeof window.gtag === 'function'` within `try/catch` wrappers. If ad-blockers, tracking blockers, or strict privacy network shields block `gtag.js`, the platform fails open silently with non-blocking warnings, preventing any impact on bidding, consignment, or browsing.
- **Development & Staging Isolation**: Evaluates `import.meta.env.DEV` to divert local and staging telemetry into structured console debug logs (`console.debug('[GA4 Telemetry]', eventName, params)`), preventing developer actions and automated staging tests from contaminating production GA4 properties.

#### 4. Custom Event Payload Schemas
High-intent collector actions are instrumented across core conversion funnels:

| Event Name | Trigger Location | Purpose & Conversion Value | Payload Schema |
| :--- | :--- | :--- | :--- |
| `bid_placed` | `src/components/BidModal.tsx` | Dispatched immediately upon successful Firestore bid submission, capturing active buyer intent, lot association, and financial volume in CAD. | `{ auction_id: string, vehicle_title: string, value: number, currency: 'CAD' }` |
| `consignment_submitted` | `src/components/ConsignmentModal.tsx` | Dispatched on successful intake form submission, capturing seller inventory pipeline volume and vehicle dimensions. | `{ vehicle_year: string \| number, vehicle_make: string, vehicle_model: string }` |
| `provenance_view` | `src/components/AuctionHeader.tsx`, `src/App.tsx` | Dispatched when a collector clicks high-intent external provenance verification dossiers (cloud service folders or Hagerty Canada valuation reports). | `{ auction_id: string, link_type: 'cloud_dossier' \| 'hagerty_valuation' }` |

---

## 9. Verified Boutique Dealer Identity & Security Architecture (M1 & M1.1 Milestones)

### 9.1 Executive Summary & Boutique Dealer Initiative
The Verified Boutique Dealer initiative establishes the data models, identity relationships, and database-level security policies required to support professional, licensed boutique automotive dealerships on Wailtail alongside traditional private-party sellers.

High-value automotive auctions present unique regulatory, tax, and licensing challenges when inventory is consigned or sold by licensed dealers rather than private individuals. In Canada, licensed motor vehicle dealers operate under provincial regulatory frameworks (such as OMVIC in Ontario, VSA in British Columbia, or AMVIC in Alberta) and are subject to mandatory retail disclosure obligations, documentation fee transparency, and distinct sales tax collection mandates.

M1 and M1.1 established the foundational dealer identity schemas. M2.2 intake is now accepted on staging; M2.3 manual verification is accepted on staging via PR #7 (`d3c5cc5`). Listing attribution remains M2.4, and public dealer showroom profiles are excluded from Phase 1.

### 9.2 Dealer Identity Architecture

The dealer identity model separates business entity records, individual user authentication accounts, and vehicle listings:

1. **Canonical Dealer Profile (`dealer_profiles/{dealerId}`)**:
   - The authoritative record for a dealership entity is stored in `/dealer_profiles/{dealerId}`.
   - Captures legal business name, trade name / DBA name, provincial dealer license number, licensing jurisdiction (`CanadianProvinceOrTerritory`), primary representative user UID, physical operating address, verified phone number, website, and public visibility toggles (`displayPhonePublicly`, `displayWebsitePublicly`).
   - Maintains trusted verification status metadata (`verificationStatus`, `verifiedAt`, `verifierUid`, `verificationMethod`, `verificationExpiresAt`).
   - Readable strictly by platform administrators; profile mutations go through the trusted M2.3 endpoint and all client writes are denied.

2. **User Profile Linkage (`UserProfile.dealerId`)**:
   - Individual registered users (`users/{userId}` and `bidders/{userId}`) link to a dealership entity via an optional `dealerId` foreign key.
   - **Access Boundaries**: Associating a `dealerId` with a user account establishes organizational identity but does not inherently grant authoring, editing, or administrative permissions over another user's lots or dealer inventory.
   - **Phase 1 Representation Model**: Under the Phase 1 specification, each verified dealership is represented by a single primary authorized representative (`primaryRepresentativeUid`). Multi-user dealership staff hierarchies and role delegations are deferred to future roadmap phases.
   - **Current Source Privacy Boundary**: Source Firestore rules restrict user/bidder root reads to the exact owner or designated administrators. Dealer profiles/cases/audits are administrator-readable only; identity reservations are server-only. Source privacy protections do not establish live rule publication.

3. **Auction Listing Snapshot (`dealerSnapshot`)**:
   - When an auction is consigned by or assigned to a verified boutique dealer, the lot document in `/auctions/{auctionId}` captures:
     - `sellerType: 'dealer'` (versus `'private'`).
     - `dealerId: string` referencing the canonical profile.
     - `dealerDocFee: 0` strictly enforcing Wailtail's platform rule: dealers consigning on Wailtail may not charge buyers additional documentation or administrative fees ($0 CAD).
     - `taxHandling`: Tax treatment indicator (`'dealer_collects'` | `'buyer_pays_at_registration'` | `'requires_confirmation'`).
     - `taxDisclaimerVersion`: Version identifier for regulatory tax disclosures.
     - `dealerSnapshot: DealerListingSnapshot`: An administrator-controlled denormalized snapshot preserving essential public-safe dealership identity attributes (`dealershipName`, `displayName`, `dbaName`, `city`, `province`, `phone`, `website`, `verifiedAt`, `verificationRecordVersion`) along with optional type-contract fields (`dealerLicenseNumber`, `licensingJurisdiction`). Public display of `phone` and `website` is conditional on their respective visibility controls (`displayPhonePublicly` and `displayWebsitePublicly`) being enabled; these controls represent intended public-disclosure conditions rather than an implemented user-facing opt-in workflow or enforcement mechanism.
   - **Point-in-Time Architecture vs. Security Enforcement**:
     - The denormalized snapshot is designed to preserve the dealer identity associated with an auction at the relevant point in time, ensuring historical lot records maintain their active dealership identity even if the canonical profile later changes.
     - Under current Firestore security rules, dealer snapshot fields are protected from non-admin modification. However, administrators retain the ability to modify protected auction fields under current rules (`isAdmin() || ...`). Therefore, the snapshot is administrator-controlled, not technically immutable against administrator changes.
   - **Dealer License Visibility & Disclosure Policy**:
     - Although optional `dealerLicenseNumber` and `licensingJurisdiction` fields exist in the TypeScript contract (`DealerListingSnapshot`), their presence in the contract does not authorize public exposure.
     - These fields **must not** be populated in publicly readable auction snapshots until formal legal review explicitly approves their public disclosure.
     - Public dealer identification relies on approved public-safe business identity attributes. Regulatory licence details are maintained in the administrator-only canonical dealer profile and are intended to remain separate from publicly readable auction snapshots. This separation is a disclosure policy, not an independently enforced restriction on administrator writes.

### 9.3 Dealer Verification Architecture & Separation of Concerns

1. **Business-Level Verification vs. Vehicle-Level Curation**:
   - Business entity verification is strictly decoupled from individual vehicle listing curation.
   - A dealer achieving verified status confirms that the business is a legitimate, licensed boutique motor vehicle dealer in its declared Canadian jurisdiction.
   - Verification of the dealership does not bypass or relax individual vehicle listing curation: every vehicle consigned by a verified dealer undergoes standard Wailtail editorial review, provenance verification, mechanical disclosure auditing, and photography inspection before being scheduled or approved for auction.

2. **Manual Administrator Control**:
   - Dealer verification is strictly administrator-controlled. No automated or self-service verification pathways exist.
   - Only authorized platform administrators (`isAdmin()`) can transition a dealership's `verificationStatus` or generate an approved `dealerSnapshot`.

3. **Separation of Applicant Declarations from Verified Metadata**:
   - Consignment application documents (`consignment_applications` and `consignments`) support dealer applicant declarations (`applicantType`, `dealershipName`, `submittedDealershipName`, `dealerLicenseNumber`, `submittedDealerLicenseNumber`, `licensingJurisdiction`, `submittedLicensingJurisdiction`, `dealershipOwnershipDeclaration`, `legalSellerOfRecordDeclaration`).
   - These applicant fields represent unverified consignor declarations. They are strictly segregated from trusted administrator-verified metadata fields.

4. **Immutable Verification Audit Ledger (`dealer_verification_audits`)**:
   - All verification decisions and status changes are recorded in an independent collection `/dealer_verification_audits/{auditId}`.
   - Captures `dealerId`, `action` (`'verified'` | `'rejected'` | `'suspended'` | `'reviewed'` | `'updated'`), `status` (`'pending'` | `'verified'` | `'rejected'` | `'suspended'`), `verifierUid`, `verificationMethod`, `sourceReferenceDescription`, `sourceReference`, `notes`, and timestamps.
   - To guarantee regulatory and evidentiary compliance, audit records are completely separate from mutable dealer profiles and are strictly append-only: administrators can read and create audit records, while updates and deletions are permanently blocked (`allow update, delete: if false;`).

### 9.4 Database Security Posture & Non-Admin Access Boundaries

Production Cloud Firestore security rules (`firestore.rules`) enforce strict authorization boundaries around dealer identity and verification metadata:

1. **The Six Protected Verification Metadata Fields**:
   Platform security rules identify and strictly protect all six trusted verification metadata fields across consignment applications:
   - `verifiedAt`
   - `verifierUid`
   - `verificationStatus`
   - `verificationMethod`
   - `verificationExpiresAt`
   - `verificationRecordVersion`

2. **Creation & Update Restrictions for Non-Admin Users**:
   - **Consignment Applications (`consignment_applications` & `consignments`)**:
     - Non-admin callers cannot create an application containing any of the six trusted verification fields or dealer listing snapshot attributes (`sellerType`, `dealerId`, `dealerSnapshot`, `dealerDocFee`, `taxHandling`, `taxDisclaimerVersion`).
     - Non-admin callers cannot update any of the six verification fields, dealer listing fields, or applicant dealer declarations (`applicantType`, `dealershipName`, `dealerLicenseNumber`, etc.).
     - Unauthenticated and authenticated non-admin users retain full capability to submit standard private-seller consignment applications and perform safe non-protected updates (e.g., updating vehicle condition notes).
   - **Auctions (`auctions/{auctionId}`)**:
     - Non-admin users cannot create or update auctions containing protected dealer fields (`sellerType`, `dealerId`, `dealerSnapshot`, `dealerDocFee`, `taxHandling`, `taxDisclaimerVersion`). Administrators retain permissions to modify auction fields under current rules; therefore, the snapshot is administrator-controlled rather than technically immutable against administrative changes.
   - **User Profiles (`users/{userId}` & `bidders/{bidderId}`)**:
     - Non-admin users cannot set `dealerId` during account creation and cannot alter or clear `dealerId` during profile updates. Only administrators can assign or modify dealer associations.
     - **Current Source Privacy Boundary**: Exact account owners and designated administrators may read user/bidder records; public reads are denied. This supersedes the earlier M1 public-read exposure and does not claim live rule publication.
   - **Dealer Profiles & Audits (`dealer_profiles` & `dealer_verification_audits`)**:
     - Non-admin users have zero read, write, update, or delete access to either collection.

3. **Security Verification Probe (18/18 Checks Passed)**:
   - The security rules were rigorously validated in an authenticated non-admin browser session using a temporary client probe (`DealerRulesSecurityProbe.tsx`) targeting live Firestore rules:
     - **2 Creation Rejection Checks**: Confirmed that non-admin creation payloads injecting protected verification fields were rejected with 403 Permission Denied across both `consignment_applications` and `consignments`.
     - **2 Creation Success Checks**: Confirmed that standard non-admin consignment application creation succeeded in both collections.
     - **12 Update Rejection Checks**: Confirmed that 6 separate update attempts—each targeting one of the six protected verification fields individually—were rejected with 403 Permission Denied across both collections ($6 \times 2 = 12$).
     - **2 Update Success Checks**: Confirmed that ordinary non-protected updates (modifying `notes`) succeeded in both collections.
   - All synthetic test records were cleaned up immediately following probe execution, the probe component was cleanly unmounted and purged from the repository, and the production build succeeded with zero errors.

4. **Scope & Testing Boundaries (Explicit Limitations)**:
   - **Actual Testing Conducted**: Authenticated non-admin negative authorization probes and positive baseline creation/update checks against live project rules.
   - **Testing NOT Conducted (Do Not Claim)**:
     - No Firebase Local Emulator Suite testing was conducted (probes executed directly against live cloud database rules).
     - No exhaustive full-codebase Firestore security audit across unrelated collections was performed.
     - Positive administrator-write authorization tests for protected fields were not performed in this probe run.
     - End-to-end dealer consignment intake, verification approval, and listing conversion workflows were not executed.
     - Historical M1 probe scope only. Current M2.2 intake is accepted on staging; M2.3 verification is accepted on staging via PR #7 (`d3c5cc5`); dealer catalog badges remain M2.5 work.
     - This release represents foundational M1/M1.1 milestone completion, not full Phase 1 platform delivery.

### 9.5 Production Deployment & Release Status
- **Production Merge Commit**: `cbae9be76c339a4eb8b03fa13fcebdfe80353dda`.
- **Promotion Route**: Merged from `staging` into `main` via PR #1; `staging` synchronized with `main` at promotion baseline.
- **Vercel Production Status**: Confirmed **Ready** and active.
- **Cloud Firestore Rules**: Separately deployed to named database instance `ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e` on GCP project `studio-apps-483721`.
- **Smoke Testing**: Completed successful production smoke tests across homepage catalog rendering, single lot auction detail views, user authentication lifecycle, and public consignment intake submission. Confirmed test application arrival in the Admin Consignment Pipeline.
- **Upcoming Work**: M2 Dealer Application Intake UI, Administrative Verification Dashboard, and Dealer Catalog Integration.

### 9.6 Security, Privacy & Architectural Considerations (M2 Roadmap Review)

Following the M1 and M1.1 foundation, three specific architectural boundaries distinguish implemented security guarantees from intended architecture and outstanding security considerations:

1. **Dealer License Visibility & Legal Approval Boundary**:
   - **Type Capability vs. Authorized Disclosure**: The TypeScript interface `DealerListingSnapshot` includes optional fields `dealerLicenseNumber?: string` and `licensingJurisdiction?: CanadianProvinceOrTerritory`. These optional fields exist in the TypeScript contract to support anticipated regulatory compliance structures. However, their existence in the contract does not authorize public exposure.
   - **Mandatory Pre-Disclosure Condition**: These fields **must not** be populated in publicly readable auction snapshots until formal legal review explicitly approves their visibility across applicable Canadian regulatory jurisdictions.
   - **Public Dealer Identification**: Public dealer identification should strictly use approved public-safe business identity fields (`dealershipName`, `displayName`, `dbaName`, `city`, `province`, `phone`, `website`), with `phone` and `website` qualified as public only when their corresponding visibility controls (`displayPhonePublicly` and `displayWebsitePublicly`) are enabled. These controls represent intended public-disclosure conditions rather than an implemented user-facing opt-in workflow or enforcement mechanism.
   - **Canonical Profile Separation**: The dealer's authoritative regulatory licence details are maintained in the private canonical dealer profile (/dealer_profiles/{dealerId}), which is currently accessible only to administrators. These details are intended to remain separate from publicly readable auction snapshots. Although optional licence fields exist in the DealerListingSnapshot TypeScript contract, their inclusion in public auction records is not authorized pending formal legal review. The current Firestore rules do not independently prevent administrators from populating these fields; this restriction is presently a documented disclosure policy rather than a database-enforced control.
   
2. **Snapshot Immutability vs. Administrator Control**:
   - **Point-in-Time Snapshot Architecture**: Dealer snapshots are architected to preserve the dealer identity associated with an auction at the relevant point in time, protecting historical auction listings against subsequent modifications to the canonical dealer profile.
   - **Security Enforcement**: Under current Firestore security rules (`/auctions/{auctionId}`), dealer snapshot fields are protected from non-admin creation and modification.
   - **Administrative Capabilities**: Administrators retain the ability to modify protected auction fields under current rules (`isAdmin() || ...`).
   - **Architectural Distinction**: Therefore, the snapshot is **administrator-controlled**, not technically immutable against administrator changes. The current implementation does not enforce absolute or database-level immutability for auction dealer snapshots.

3. **Public-Read Exposure of User and Bidder Documents (`dealerId` Linkage)**:
   - **Implemented Rule Behavior**: Current Firestore security rules permit unrestricted public reads on user and bidder root documents (`/users/{userId}`: `allow read: if true;` and `/bidders/{bidderId}`: `allow read: if true;`).
   - **Linkage Exposure**: Because Cloud Firestore security rules evaluate permissions at the document level and do not provide field-level read restrictions within otherwise publicly readable documents, `dealerId` is exposed to public reads wherever it exists in those documents.
   - **Status as Existing Consideration**: This is an existing security/privacy consideration within the platform's collection architecture, not a newly implemented restriction or regression.
   - **M2 Review Scope**: The M2 review should consider whether dealer identity linkage needs more restrictive read exposure (such as isolating sensitive linkage attributes into non-public subcollections or private authorization projections) without disrupting existing platform behavior, user profile hydration, or community attribution.

---

## 10. Consignment Application Security Hardening (M2.0A Milestone)

### 10.1 Strategic Context & Release Posture
- **Implementation Status**: Fully implemented, verified with local unit testing, committed, deployed to production, and verified with production QA on November 5, 2026.
- **Release Posture**: M2.0A is deployed to production, with Cloud Firestore security rules successfully deployed to GCP project `studio-apps-483721` (`ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e`), and required production QA confirmed on November 5, 2026.
- **Milestone Scope**: This section records the M2.0A Consignment Application Security Hardening baseline. M2.0B trusted server-side role authorization and its security corrections have since been implemented and verified on staging; they are documented in Section 11.4. M2.0B is not production-approved.

### 10.2 Final M2.0A Security & Authorization Model
The M2.0A security model hardens consignment application intake and access control across Cloud Firestore rules (`firestore.rules`):

1. **Permitted Guest & Authenticated Creation**:
   - Guest (unauthenticated) submissions remain permitted to preserve low-friction intake for prospective collectors.
   - Non-admin callers (both guest and authenticated) must set `status: 'pending'` on creation.
   - Non-admin callers cannot create an application containing administrator-controlled metadata or protected dealer verification fields:
     - 12 Protected dealer fields: `sellerType`, `dealerId`, `dealerSnapshot`, `dealerDocFee`, `taxHandling`, `taxDisclaimerVersion`, `verifiedAt`, `verifierUid`, `verificationStatus`, `verificationMethod`, `verificationExpiresAt`, `verificationRecordVersion`.
     - 7 Administrative & user linkage fields: `reviewedAt`, `reviewedBy`, `convertedAuctionId`, `updatedAt`, `registeredUserId`, `isRegisteredUser`, `registeredUserRole`.
   - Administrators (`isAdmin()`) bypass creation restrictions.
   - **Discontinued Registration Metadata on New Submissions**: New M2.0A consignment submissions no longer write `registeredUserId`, `isRegisteredUser`, or `registeredUserRole` into application documents.
   - **Historical Records Preserved**: Existing historical application documents may still contain legacy registration metadata. These historical records have not been migrated or deleted, and compatibility is maintained without altering historical records.

2. **Verified-Email Applicant Read Authorization**:
   - Reading an application document requires:
     1. An authenticated Firebase user (`isAuthenticated()`).
     2. A non-null Firebase Auth email claim (`request.auth.token.email != null`).
     3. A verified email flag (`request.auth.token.email_verified == true`).
     4. Exact match between stored `sellerEmail` and the lowercased authenticated email claim (`resource.data.sellerEmail == request.auth.token.email.lower()`).
   - Authorization is strictly derived from the authenticated, verified email claim in the Firebase Auth token (`request.auth.token.email`). The security model does **not** rely on client-supplied or unverified `registeredUserId` document properties, and client-supplied registration identifiers are not an authorization basis for applicant reads.
   - Unauthenticated users, authenticated users with unverified emails, authenticated users lacking email claims, and unrelated authenticated users are denied read access (403 Permission Denied).
   - Administrators retain full access to read individual documents and execute collection-wide administrative queries.

3. **Complete Non-Admin Modification & Deletion Lock**:
   - Non-admin application updates are completely denied (`allow update: if isAdmin();`).
   - Non-admin application deletions are completely denied (`allow delete: if isAdmin();`).
   - Administrators retain exclusive authority to mutate application status, perform reviews, convert applications to draft listings, and purge application records.

4. **Symmetric Dual-Collection Coverage**:
   - Both the primary `consignment_applications` collection and the legacy `consignments` collection enforce the identical security rules and authorization model.

### 10.3 Client Persistence & Notification Lifecycle (`auctionService.ts`)
1. **Normalized Lowercase Seller Email**:
   - `submitConsignmentApplication()` automatically trims and lowercases `sellerEmail` (`(app.sellerEmail || '').trim().toLowerCase()`) on new submissions prior to persistence, ensuring case consistency with Firebase Auth token email claims.
2. **Primary Persistence Error Propagation**:
   - Primary persistence to `consignment_applications` propagates errors directly to the caller. If the primary write fails, the function aborts and throws; it never returns synthetic or fallback application IDs.
3. **Best-Effort Legacy Dual-Write**:
   - Secondary writes to the legacy `consignments` collection execute within an isolated `try/catch` block as non-fatal best effort. Failures in legacy writes are logged as warnings and do not invalidate or roll back a successful primary write.
4. **Post-Persistence Non-Blocking Notification Dispatch**:
   - Consolidated serverless email notification dispatch (`/api/send-consignment-email`) executes asynchronously post-persistence with an isolated 5000ms timeout guard (`AbortController`). SMTP latency or third-party delivery issues will not halt execution or falsely report consignment submission failure to the user.

### 10.4 Firestore Security Rules Emulator Verification
- **Target Named Database**: Verification was conducted against the project's named Firestore database instance: `ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e` on GCP project `studio-apps-483721`.
- **83 Passing Unit Tests (`tests/firestore.rules.test.ts`)**:
  - Executed via Firebase Local Emulator Suite command: `npm run test:rules` (`firebase emulators:exec --only firestore 'node --import tsx --test tests/firestore.rules.test.ts'`).
  - **41 Checks per Collection ($41 \times 2 = 82$)**: Symmetrically validated across both `consignment_applications` and `consignments`:
    - Guest creation of pending application without administrative metadata (permitted).
    - Authenticated applicant creation of pending application (permitted).
    - Guest and authenticated non-admin attempts to create with `status: 'approved'` (denied).
    - Non-admin injection of administrative metadata on create (`reviewedAt`, `reviewedBy`, `convertedAuctionId`, `updatedAt`, `registeredUserId`, `isRegisteredUser`, `registeredUserRole`) (all denied).
    - Verified-email applicant read authorization for matching email (permitted).
    - Matching but unverified email read attempts (denied).
    - Authenticated user without email claim read attempts (denied).
    - Verified but unrelated email applicant read attempts (denied).
    - Collection-wide query authorization for administrators (permitted) vs. unscoped query rejection for non-admins (denied).
    - Email-scoped collection query authorization for verified applicants (permitted).
    - Complete denial of non-admin update attempts (denied).
    - Complete denial of non-admin delete attempts (denied).
    - Administrator update and delete capabilities (permitted).
    - All 12 protected dealer declaration and verification metadata fields rejected on non-admin create.
    - Historical document read access without new metadata for authorized applicants and administrators (permitted).
    - Explicit verification that access authorization does not depend on client-supplied `registeredUserId`.
  - **1 Database Isolation Check**: Validated named database configuration and verified that tests run isolated from the default database instance.
- **Testing Scope & Limitations**:
  - Unit tests were executed locally within the Firebase Local Emulator Suite using `@firebase/rules-unit-testing`.
  - Emulator testing validates rule logic in emulation; it does **not** constitute live production penetration testing. Production rules were separately deployed to GCP project `studio-apps-483721` (`ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e`) and verified with production QA on November 5, 2026.
  - Full production compilation and typechecking succeeded with zero errors (`npm run build`).

### 10.5 Milestone Boundaries & Outstanding Work
- **M2.0A Status**: Consignment application security hardening is complete, deployed to production, with Cloud Firestore rules deployed and required production QA passed on November 5, 2026. New submissions no longer write legacy registration metadata (`registeredUserId`, `isRegisteredUser`, `registeredUserRole`), applicant reads require verified email claims matching normalized `sellerEmail`, and creation/modification locks prevent unauthorized state tampering. Historical application records are retained without migration or deletion.
- **M2.0B Status**: Trusted server-side role authorization and its security corrections are implemented and verified on staging. Client-side role elevation and demo self-verification have been removed; approved-consignor authorization is performed by the trusted Firebase Admin endpoint, and user/bidder role and verification protections are enforced by Firestore rules. M2.0B is **not production-approved**. Account-deletion and auction mutation protections have subsequently been implemented and verified on staging; deployment, Storage cutover and operational production acceptance remain separate.
- **Deployment Status**: Production deployment and Cloud Firestore rules deployment (`npm run deploy:rules`) are complete and verified in production.

---

## 11. Authoritative Phase 1 Roadmap: Verified Boutique Dealer Program

### 11.1 Executive Summary & Current Program Status
The Wailtail Verified Boutique Dealer Program establishes an institutional-grade, legally compliant operational framework enabling verified boutique automotive dealerships in Canada to consign and auction collector vehicles alongside private sellers.

**Authoritative Program Status (as of November 13, 2026)**:
- **M1.0 — Dealer Foundation and Data Architecture**: **COMPLETE**.
- **M1.1 — Dealer Verification Metadata and Security Hardening**: **COMPLETE**.
- **M2.0A — Consignment Security and Persistence Hardening**: **COMPLETE — PRODUCTION QA PASSED** (Deployed to production, Cloud Firestore security rules deployed to GCP project `studio-apps-483721`, production QA verified on November 5, 2026).
- **M2.0B — Trusted Server-Side Role Authorization**: **VERIFIED ON STAGING — NOT PRODUCTION-APPROVED** (security corrections and Correction D complete; subsequent security implementation accepted on staging; production rollout/operational gates remain).
- **M2.1**: **ACCEPTED ON STAGING** (PR #5, `e7de147`, passing post-merge checks and owner-confirmed local visual/functional acceptance). See [M2.1 acceptance](docs/m2-1-consignment-review.md).
- **M2.2**: **ACCEPTED ON STAGING** (PR #6, `74d9089`, passing post-merge checks and Jeremy-confirmed local acceptance/synchronization).
- **M2.3**: **ACCEPTED ON STAGING** (PR #7, `d3c5cc5`; Jeremy locally accepted reviewed head `75d3641`, approved the merge and confirmed clean local staging synchronization; exact-head/post-merge CI and Vercel checks passed). See [M2.3 acceptance](docs/m2-3-dealer-verification.md).
- **M2.4**: **ACCEPTED ON STAGING** (PR #9, `4a55362`; owner locally accepted `d0ce29f`, approved merge and confirmed clean synchronization; post-merge CI/Vercel passed). See [M2.4 scope and acceptance](docs/m2-4-dealer-listings.md).
- **M2.5**: **ACCEPTED ON STAGING** (PR #10, `49efa36`; owner local acceptance and synchronization confirmed; post-merge CI and Vercel passed).
- **M2.6 — Optional Private Application Photo Uploads**: **PLANNED — SEPARATELY GATED** (Not a prerequisite for core dealer program completion).

The System Bible is the authoritative single source of truth for milestone scope, sequencing, dependencies, operational boundaries, and acceptance criteria.

Jeremy locally accepted reviewed head `8f6a1f3`, explicitly approved PR #10, and confirmed a clean local staging checkout synchronized to merge `49efa36` on November 13, 2026. Exact-head CI run `43451784085`, post-merge CI run `43454275497` and Vercel checks passed. Production promotion and live Firebase publication remain separate. Core implementation through M2.5 is accepted on staging; formal Phase 1 completion still requires the production and pilot criteria in Section 11.7. See [Phase 1 production-readiness review](docs/phase1-production-readiness.md). M2.6 remains separately gated and non-blocking.

### 11.2 Phase 1 Strategic Objectives
1. **Curated Commercial Integrity**: Support licensed Canadian boutique automotive dealers with curated collector inventory while preserving Wailtail's enthusiast-first, peer-to-peer auction culture.
2. **Transparent Canadian CAD Financial Model**: Uphold a zero-friction fee structure for Phase 1: $0 dealer listing fees, 0% platform success commissions, strictly prohibited dealer documentation fees ($0 CAD dealer doc fee), and 0% buyer premiums.
3. **Provincial Regulatory Compliance**: Architect identity, disclosures, and seller warranties to align with Canadian motor vehicle dealer governance (e.g., OMVIC in Ontario, VSA in British Columbia, AMVIC in Alberta) without Wailtail assuming regulatory co-endorsement or dealer-of-record liability.
4. **Defense-in-Depth Security**: Enforce administrative-only control over verification credentials, immutable audit logs, strict token-based authorization, and trusted server-side role assignment.
5. **Decoupled Editorial & Identity Curation**: Maintain strict architectural and operational separation between dealership business verification and individual vehicle lot curation.

### 11.3 Commercial & Product Scope Boundaries
To ensure execution velocity and regulatory clarity, Phase 1 strictly enforces the following commercial and product boundaries:

- **Exclusive Vehicle Ownership & Seller of Record**: Consigning dealers must be the registered legal owner and sole seller of record for every consigned vehicle. No brokered vehicles, third-party consignments-to-dealer, or private-owner pass-through inventory are permitted under any circumstances.
- **Authorized Representation**: In Phase 1, each verified dealership is represented by exactly one primary authorized representative (`primaryRepresentativeUid`). Multi-user dealership staff accounts, sub-user access delegation, and shared login credentials are strictly prohibited and out of scope.
- **Manual Administrator Verification**: Dealer verification is performed manually by Wailtail administrators. No self-service or automated verification pathways exist.
- **Verification Decoupled from Lot Curation**: Verification of a dealership entity confirms business legitimacy only. It does not grant automatic lot approvals or bypass individual vehicle provenance inspection and editorial review.
- **Private Canonical Profiles**: Dealer profiles (`dealer_profiles/{dealerId}`) remain strictly private and accessible only to administrators. There are no public dealer profile landing pages or showcase directories in Phase 1.
- **Showroom Location Precision**: Public dealer showroom location disclosures are strictly limited to City and Province (city-level precision only). Specific street addresses are withheld from public catalog listings.
- **Conditional Contact Disclosure**: Dealership phone numbers and websites are displayed on vehicle lots only when the dealer explicitly opts in via dedicated visibility flags (`displayPhonePublicly`, `displayWebsitePublicly`).
- **Dealer License Disclosure Policy**: Dealer license numbers and licensing jurisdictions are captured privately for compliance auditing. They **must not** be populated in publicly readable auction snapshots until formal legal counsel provides jurisdiction-specific authorization.
- **No Regulatory Endorsement**: Approved dealer presentation badges indicate platform identity verification only and must explicitly disclaim provincial regulatory endorsement.
- **Tax Handling Model**: The platform provides informational tax indicators (`taxHandling`, `taxDisclaimerVersion`) to clarify whether sales tax is collected by the dealer at settlement or paid by the buyer upon registration. The platform executes no automated tax calculations.
- **Zero-Dollar Commercial Model**: Phase 1 operates without financial transaction processing: $0 dealer listing fees, $0 platform commission, $0 dealer documentation fees, and $0 buyer fees.
- **Explicit Phase 1 Exclusions**: The following capabilities are explicitly deferred to future phases:
  - Stripe or merchant payment integrations.
  - Billing, credits, deposits, subscriptions, invoicing, or refunds.
  - Dealership staff permission hierarchies or multi-seat access.
  - Consignment broker or private pass-through inventory.
  - Public dealer showcase directories or branded microsites.
  - Dealership inventory analytics, fleet management tools, or CRM integrations.

### 11.4 Milestone Blueprint & Execution Sequencing

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             PHASE 1 ROADMAP OVERVIEW                             │
├────────────────────┬───────────────────────────────────────┬─────────────────────┤
│ Milestone          │ Title & Description                   │ Status              │
├────────────────────┼───────────────────────────────────────┼─────────────────────┤
│ M1.0               │ Dealer Foundation & Data Architecture │ COMPLETE            │
│ M1.1               │ Dealer Verification Security          │ COMPLETE            │
│ M2.0A              │ Consignment Security & Persistence    │ COMPLETE (PROD QA)  │
│ M2.0B              │ Trusted Server-Side Authorization     │ VERIFIED (STAGING) │
│ M2.1               │ Admin Consignment Review              │ ACCEPTED (STAGING)  │
│ M2.2               │ Dealer Application Intake             │ ACCEPTED ON STAGING │
│ M2.3               │ Manual Dealer Verification & Profiles │ ACCEPTED ON STAGING │
│ M2.4               │ Dealer Vehicle Listing Integration    │ ACCEPTED ON STAGING │
│ M2.5               │ Public Dealer Presentation & Badging  │ ACCEPTED ON STAGING │
│ M2.6               │ Optional Application Photo Uploads    │ PLANNED (GATED)     │
└────────────────────┴───────────────────────────────────────┴─────────────────────┘
```

#### M1.0 — Dealer Foundation and Data Architecture
- **Status**: **COMPLETE**.
- **Objectives**: Establish foundational TypeScript interfaces, data models, and database security rules to support verified dealer entities and dealer auction metadata.
- **Business Rationale**: Provides the data contracts required for dealer identity, audit records, and listing snapshots without altering existing private seller workflows.
- **Key Deliverables**:
  - `CanadianProvinceOrTerritory` 13-region union type in `src/types.ts`.
  - Canonical `DealerProfile` interface for private dealership records.
  - `DealerListingSnapshot` interface capturing immutable snapshot attributes for vehicle auctions.
  - `DealerVerificationAudit` interface tracking administrative verification history.
  - Core `Auction` interface extensions: `sellerType?: 'private' | 'dealer'`, `dealerId?: string`, `dealerSnapshot?: DealerListingSnapshot`, `dealerDocFee?: 0`, `taxHandling`, and `taxDisclaimerVersion`.
  - `UserProfile` and `BidderProfile` identity linkage via optional `dealerId?: string`.
  - Consignment application applicant declaration schemas (`applicantType`, `dealershipName`, `dealerLicenseNumber`, etc.).
  - Initial Cloud Firestore rules (`firestore.rules`) restricting `/dealer_profiles` and `/dealer_verification_audits` to administrators and blocking non-admin user/bidder `dealerId` modifications.
- **Dependencies**: Baseline multi-car platform architecture.
- **Exit Criteria**: All data schemas compile cleanly; non-admin users cannot create or mutate dealer profiles or inject `dealerId` on user accounts.

#### M1.1 — Dealer Verification Metadata and Security Hardening
- **Status**: **COMPLETE**.
- **Objectives**: Harden database access rules across consignment applications to protect all trusted administrator verification fields.
- **Business Rationale**: Prevents malicious consignors or unauthorized callers from spoofing verified dealer credentials or falsifying verification metadata.
- **Key Deliverables**:
  - Strict audit action literals (`'verified' | 'rejected' | 'suspended' | 'reviewed' | 'updated'`) and status literals (`'pending' | 'verified' | 'rejected' | 'suspended'`) in `src/types.ts`.
  - Explicit protection of all six trusted administrator verification fields in `firestore.rules`: `verifiedAt`, `verifierUid`, `verificationStatus`, `verificationMethod`, `verificationExpiresAt`, and `verificationRecordVersion`.
  - Symmetric rules coverage across both `consignment_applications` and legacy `consignments` collections.
  - Non-admin creation and modification locks preventing mutation of applicant declarations or verification metadata.
  - Authenticated security probe (`DealerRulesSecurityProbe.tsx`) validating 18/18 negative and positive authorization checks against live Cloud Firestore rules.
  - Production promotion via PR #1 to `main` (commit `cbae9be76c339a4eb8b03fa13fcebdfe80353dda`), Vercel production deployment, and Firestore rules deployment to GCP project `studio-apps-483721`.
- **Dependencies**: M1.0 completion.
- **Exit Criteria**: 18/18 security probe checks pass; clean production deployment; production smoke tests verified.

#### M2.0A — Consignment Security and Persistence Hardening
- **Status**: **COMPLETE — PRODUCTION QA PASSED**.
- **Objectives**: Harden consignment application access authorization, decouple applicant reads from unverified client data, lock non-admin mutations, and stabilize persistence.
- **Business Rationale**: Secures seller application data under PIPEDA privacy standards, prevents data tampering, and ensures resilient intake without false failure alerts.
- **Key Deliverables**:
  - Verified-email applicant read authorization (`request.auth.token.email_verified == true` matching lowercased `sellerEmail`).
  - Authorization derived strictly from verified Firebase Auth token email claims rather than unverified client-supplied identifiers (`registeredUserId`).
  - Strict creation safeguards: non-admin submissions require `status == 'pending'` and reject all 12 protected dealer fields and 7 administrative metadata fields.
  - Discontinuation of legacy registration metadata (`registeredUserId`, `isRegisteredUser`, `registeredUserRole`) on new submissions while maintaining non-destructive compatibility with historical records.
  - Non-admin update and delete locks (`allow update, delete: if isAdmin();`).
  - Normalized lowercase `sellerEmail` formatting on intake persistence in `auctionService.ts`.
  - Primary persistence error propagation without synthetic fallback IDs; non-fatal legacy dual-write; non-blocking notification dispatch with 5000ms timeout guard.
  - 83 passing unit tests in Firebase Local Emulator Suite targeting named database instance `ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e` (`npm run test:rules`).
  - Deployed to production, Cloud Firestore rules deployed to GCP project `studio-apps-483721`, and required production QA verified on November 5, 2026.
- **Dependencies**: M1.1 completion.
- **Exit Criteria**: 83/83 rules unit tests pass; production deployment verified; Cloud Firestore rules deployed; production QA confirmed.

#### M2.0B — Trusted Server-Side Role Authorization & Security Corrections
- **Status**: **VERIFIED ON STAGING — PRODUCTION ROLLOUT PENDING**.
- **Objectives**: Replace the former client-driven self-service approved-consignor claim and role-promotion path with trusted server-side authorization, protect canonical user/bidder role and verification fields, and enforce Firebase Authentication as the sole email-verification and administrator authority. The separate administrator-initiated consignment approval workflow remains governed by designated administrator identity and Firestore admin permissions.
- **Business Rationale**: Eliminates vulnerabilities where client-side code (`elevateApprovedConsignor`) promotes users to `'seller'` under client-controlled `isOwner(uid)` Firestore rules, and where mutable Firestore fields (`isEmailVerified`) could substitute for cryptographic Firebase Authentication token claims.
- **Key Deliverables & Corrections**:
  - Secure serverless endpoint `/api/authorize-approved-consignor` utilizing Firebase Admin SDK with reusable initialization and named database instance targeting (`ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e`).
  - Cryptographic validation of caller ID tokens with active token revocation verification (`admin.auth().verifyIdToken(idToken, true)` — Correction C).
  - Server-side verification that the authenticated user's verified email matches an approved consignment application document (`status == 'approved'`) with support for historical email casing.
  - Atomic, trusted server-side role assignment across `users/{uid}` and `bidders/{uid}` collections, preserving administrator roles against demotion.
  - Safe seller-to-auction linkage with conflict detection, preventing overwrites of existing lot assignments.
  - Removal of client-side role elevation mutations (`elevateApprovedConsignor`) and legacy demo self-verification (`manualVerifyForDemo`) from `AuthContext.tsx`.
  - Establishment of Firebase Authentication as the sole email-verification authority (`isEmailVerified = Boolean(user?.emailVerified)` — Correction A) and administrative root of trust (`isAdmin = Boolean(user?.email && isDesignatedAdminEmail(user.email) && user.emailVerified === true)`), integrated with Firebase user reload on auth hydration.
  - Hardening of Firestore security rules (`firestore.rules` — Correction B) to deny non-admin users the ability to mutate `role` fields, dealer fields, or self-verify via `isEmailVerified: true` without matching `request.auth.token.email_verified == true`.
  - **Correction D — Transactional Approval Revalidation & Retry-Safe Results**: Candidate application documents are re-read inside the Firestore transaction; promotion proceeds only while an application still exists, remains approved, and matches the verified token email. Transaction result arrays are scoped to each callback execution so SDK retries cannot contaminate the final response.
  - **Comprehensive unit and integration test coverage**: 126 passing Firestore rules emulator unit tests and 41 passing isolated M2.0B endpoint and administrative authority unit tests, including current and legacy application revocation and transaction callback retry coverage. The separate administrator account-deletion hardening adds 44 regression tests; the combined `npm run test:endpoint` suite therefore contains 85 tests.
- **Dependencies**: M2.0A production baseline.
- **Remaining production release gates**: Account deletion and auction ownership/mutation protections are implemented and verified on staging (PR #3 security acceptance). They are not evidence of live deployment. Verify production application/rules rollout, Storage cutover, worker scheduling, credentials and real delivery before release; see [production-readiness review](docs/phase1-production-readiness.md).
- **Exit Criteria**: Non-admin users cannot mutate protected `role` fields or self-verify via Firestore; self-service approved-consignor claims are authorized through the trusted backend endpoint; administrator-initiated role changes remain restricted to designated administrators; application approval is revalidated transactionally; token revocation is enforced; 126 rules tests and 41 endpoint tests pass; production blockers must be resolved before production promotion.

#### M2.1 — Administrative Consignment Application Review
- **Status**: **ACCEPTED ON STAGING**.
- **Objectives**: Build a dedicated, read-only administrative inspection view within the Admin Consignment Pipeline for reviewing submitted consignment and dealer applications.
- **Business Rationale**: Empowers curators to thoroughly evaluate submitted vehicle particulars, condition disclosures, and applicant credentials before making approval or rejection decisions.
- **Key Deliverables**:
  - Dedicated read-only application detail inspection modal in `AdminPortalPage.tsx`.
  - Comprehensive surfacing of vehicle taxonomy, mechanical condition, contact details, and location data.
  - Clear visual demarcation distinguishing applicant-submitted declarations from administrator-verified information.
  - Audit trail displaying submission timestamps, review history, and curator assignments.
  - Private administrative review notes and internal curator annotations.
  - Safeguards ensuring opening or inspecting applications never triggers implicit status transitions.
- **Dependencies**: M2.0B completion.
- **Exit Criteria**: Curators can inspect complete application records; administrative notes persist securely; viewing records never mutates document status; private seller curation workflows remain intact.

Implementation contract:
- `ConsignmentReviewModal.tsx` is opened from `AdminPortalPage.tsx`; submitted fields remain read-only. Additional captured fields are surfaced without inventing missing disclosures. Existing linked canonical dealer profile information is presented separately and is never written by this feature.
- `/api/admin-consignment-review` uses revoked-token checking, verified email and the existing designated-administrator allowlist. It accepts only read, append-note and assignment commands, with validated source/ID and allowlisted assignees.
- Private state lives in `consignmentReviews/{source}:{applicationId}` with server-authored append-only `events`. Client writes are denied even for administrators. Explicit saves transactionally append an event and advance a revision; stale writes conflict, and repeated command IDs cannot duplicate notes or impersonate another author. Inspection creates no review document and never writes an application.
- History is paginated at 50 events. Existing `reviewedAt`/`reviewedBy` are displayed as legacy metadata; missing past events are not reconstructed. New history covers M2.1 note/assignment actions, not historical status transitions or the existing separate status controls.
- Legacy collection fallback and same-ID source separation are preserved. No migration, role expansion, dealer approval/conversion, notification, Storage operation or production rule publication is included.
- See [M2.1 acceptance and release boundary](docs/m2-1-consignment-review.md) for checks and limitations. PR #5 merged as `e7de147`; post-merge checks and owner local acceptance are recorded. Production remains separate.

#### M2.2 — Dealer Application and Intake
- **Status**: **ACCEPTED ON STAGING** (PR #6, `74d9089`; owner local visual/functional acceptance confirmed).
- **Objectives**: Introduce structured boutique dealer intake capabilities into the consignment application workflow.
- **Business Rationale**: Enables prospective boutique dealers to submit verified commercial credentials and formal declarations during initial platform intake.
- **Key Deliverables**:
  - Dealer applicant classification toggle in `ConsignmentModal.tsx` (`applicantType: 'private' | 'dealer'`).
  - Structured dealer intake fields: legal business name, trade name / DBA, provincial dealer license number, and licensing jurisdiction dropdown (`CanadianProvinceOrTerritory`).
  - Primary authorized representative contact details.
  - Mandatory clickwrap declarations:
    1. Exclusive vehicle ownership warranty (confirming dealership owns the consigned vehicle with clean title).
    2. Legal seller-of-record declaration (confirming dealership acts as legal seller and assumes statutory retail obligations).
    3. Prohibition of third-party brokered or private pass-through inventory.
  - Client-side and server-side validation enforcing all required dealer fields and declarations.
- **Dependencies**: M2.1 completion.
- **Exit Criteria**: Dealers can submit complete commercial applications; missing declarations block submission; submitted records persist securely with pending status without exposing administrative metadata.

Implementation contract:

- New private and dealer form submissions use `/api/submit-consignment`. It strictly allowlists fields, normalizes email, validates the current declaration version/terms, and enforces all dealer details plus three true boolean declarations. Contacts remain applicant-provided, not trusted identity links.
- Explicit checkbox assent controls button availability; required text/select fields use native field-specific validation and server checks. FormData captures visible control values, including autofill, rather than using stale React text state to silently lock submission.
- The existing `submittedDealershipName` field stores the submitted legal business name; `submittedDbaName` is optional. Licensing jurisdiction uses the 13-region Canadian union. Existing `sellerName`, `sellerEmail` and `sellerPhone` carry primary representative contacts for dealers.
- The server alone assigns `status: pending`, `submittedAt`, `declarationAcceptedAt` and the recognized declaration version. The same transaction creates canonical and legacy application copies plus a server-only command hash. Repeated unchanged submission IDs deduplicate; different content/collisions conflict, and partial writes do not produce success.
- Candidate rules deny direct non-admin dealer/application-declaration writes in both collections. Legacy private writes and designated-administrator authority remain compatible; old records are not migrated. Canonical dealer profiles, private M2.1 records, roles and verification fields remain protected.
- M2.1 shows the submitted business details, three declarations, wording version and acceptance timestamp as unverified application information.
- Notifications retain the existing best-effort client dispatch after a confirmed new save. An unchanged retry suppresses repeat dispatch; a lost first response may therefore leave a receipt unsent. Durable mailbox delivery/reconciliation is outside this milestone.
- See [M2.2 acceptance and local preview](docs/m2-2-dealer-intake.md). For all visual implementations, Jeremy must confirm a local visual/functional review before approving the PR merge. Automated browser checks do not substitute for that review.

#### M2.3 — Manual Dealer Verification and Canonical Profile Creation
- **Status**: **ACCEPTED ON STAGING** (PR #7, reviewed head `75d3641`, merge `d3c5cc5`, November 8, 2026).
- **Acceptance evidence**: Jeremy confirmed the revised interface and representative selection locally before explicitly approving the merge. Exact-head CI run `42505627075` (attempt 2), post-merge CI run `42507149793` and Vercel checks passed; the owner confirmed clean local staging synchronization at `d3c5cc5`. See the M2.3 guide for linked evidence. No production promotion or live Firebase rules/index publication is claimed.
- **Local review follow-up**: Exact email/UID account lookup is designated-admin-only, returns minimal eligibility data, requires explicit selection and makes no linking writes. Save rechecks authoritative Auth and transactional conflicts. Method/source dropdowns guide human review; Other retains custom methods and source descriptions always remain required. Local timezone-labelled date controls convert to absolute timestamps; no fixed verification duration is assumed.
- **Implementation boundary (2026-11-08)**: [M2.3 acceptance and local preview](docs/m2-3-dealer-verification.md). Dedicated view is reached through Consignment Pipeline → View application → Manage dealer verification. Strict admin endpoint atomically writes canonical profile, exact verified-Auth UID associations, identity claims, private case revision and append-only before/after audit. Rejected/pending guests need no canonical profile. Licence/representative reassignment and legacy profile adoption are excluded. Explicit future expiry, manual evidence and contact consent are recorded; dealer seller mutations use a shared server eligibility guard. No vehicle approval, role promotion, conversion or public snapshot is included. Source rules/index changes require a separately approved live rollout; no deployment is claimed. Future visual changes require Jeremy’s local visual/functional review before their PR merge approval.
- **Objectives**: Build administrative verification tooling to review dealer credentials, verify provincial regulatory licenses, generate canonical dealer profiles, and log audit trails.
- **Business Rationale**: Enforces strict human verification of dealer credentials before granting boutique dealer status, ensuring regulatory compliance.
- **Key Deliverables**:
  - Dedicated Dealer Verification management interface within `AdminPortalPage.tsx`.
  - Manual verification workflow enabling administrators to record verification methodology (e.g., OMVIC registry check, provincial corporate registry verification).
  - Creation of canonical `dealer_profiles/{dealerId}` records capturing verified legal entities, primary representatives, and public contact visibility toggles.
  - Linking verified `dealerId` to the authorized representative's user profile (`users/{userId}` and `bidders/{userId}`).
  - Append-only audit record creation in `dealer_verification_audits/{auditId}` for every verification, modification, suspension, or rejection.
  - Verification expiry tracking and administrative suspension controls.
  - Operational separation ensuring dealer verification remains independent of vehicle lot curation.
- **Dependencies**: M2.2 completion.
- **Exit Criteria**: Only administrators can create or update dealer profiles; all verification actions generate immutable audit records; suspension instantly halts dealer listing capabilities; zero automatic lot curation approvals.

#### M2.4 — Dealer Vehicle Listing Integration
- **Status**: **ACCEPTED ON STAGING** (PR #9, `4a55362`; owner local acceptance and synchronization confirmed).
- **Bounded implementation (2026-11-08)**: [M2.4 scope and acceptance](docs/m2-4-dealer-listings.md). Canonical dealer applications only; explicit admin vehicle curation creates one protected draft/media record with atomic approval, command/audit records, current verification/representative/link checks, case revision and inspected-application fingerprint. Legacy/private conversion remains disabled. Creation-time snapshots omit private licence/address/evidence; public projection remains unchanged until M2.5. Dealer doc fee is server-locked at CAD $0; a dedicated audited draft-only tax control defaults to requires confirmation and gates forward publication. Snapshot reassignment/refresh and dealer duplication are excluded. Existing seller authoring routes authorize assigned UIDs without automatic global role promotion; email-based consignor authorization cannot promote dealer applicants or rebind dealer lots. Financial settlement and historical visibility are not automatically changed on later expiry/suspension. Source rules, production and local owner acceptance remain separately gated.
- **Objectives**: Integrate verified dealer attribution and point-in-time dealer snapshots into vehicle draft and listing authoring workflows.
- **Business Rationale**: Connects approved dealer inventory to the dealer's verified business identity while ensuring immutable historical lot records and fee compliance.
- **Key Deliverables**:
  - Approved dealer attribution in `convertConsignmentToDraftListing()` and `ListingEditorWorkspace.tsx`.
  - Protected assignment of `dealerId` and creation of point-in-time `dealerSnapshot` on `auctions/{auctionId}`.
  - Snapshot population using approved public-safe dealership metadata (`dealershipName`, `displayName`, `dbaName`, `city`, `province`, conditional `phone` and `website`).
  - Strict enforcement of $0 documentation fee (`dealerDocFee: 0`).
  - Tax handling indicator configuration (`taxHandling`, `taxDisclaimerVersion`).
  - Listing Editor controls allowing authorized dealer representatives to manage draft narrative and media while protecting dealer verification snapshot fields from tampering.
- **Dependencies**: M2.3 completion.
- **Exit Criteria**: Dealer vehicle drafts correctly link to verified dealer identities; dealer snapshot is protected from non-admin modification; $0 doc fee is locked; dealer representative can edit narrative and media for assigned lots.

#### M2.5 — Public Dealer Presentation and Auction Integration
- **Status**: **ACCEPTED ON STAGING** (PR #10, `49efa36`; owner local acceptance and synchronization confirmed; post-merge CI and Vercel passed).
- **Bounded implementation**: [M2.5 scope and acceptance](docs/m2-5-public-dealers.md). Dedicated public-safe projection; current canonical verification/expiry and representative match gate badges and contact disclosures. Snapshot name/city/province remain historical attribution. Contacts additionally require current consent for the identical snapshot value; no automatic snapshot refresh. Failure suppresses claims/contacts while leaving historical lots and settlement intact. Catalog cards, lot disclosures and dealer social templates share the public summary; no raw profile/snapshot publication. Verification is manual WAILTAIL review and recorded declarations, not regulatory endorsement or condition/ownership guarantee. No live Firebase publication or production promotion is included.
- **Objectives**: Deliver polished, transparent public dealer presentation elements across the catalog grid, auction lot headers, and promotional marketing kits.
- **Business Rationale**: Enhances buyer trust and marketplace transparency by clearly distinguishing verified boutique dealer inventory from private party lots.
- **Key Deliverables**:
  - Distinctive "Verified Boutique Dealer" badges on catalog cards (`CatalogCard.tsx`) and auction headers (`AuctionHeader.tsx`).
  - Privacy-conscious showroom disclosures: City and Province only (no street addresses).
  - Conditional contact displays: dealership phone number and website rendered only when explicit opt-in flags (`displayPhonePublicly`, `displayWebsitePublicly`) are active.
  - Clear legal disclaimers stating verification confirms platform identity and exclusive inventory ownership without implying provincial regulatory endorsement.
  - Dealer license number and jurisdiction strictly excluded from public display pending formal legal counsel authorization.
  - Tailored social marketing templates in `SocialPromoKitModal.tsx` highlighting verified boutique dealer provenance.
- **Dependencies**: M2.4 completion.
- **Exit Criteria**: Public auction lots render verified dealer badges; street addresses and license numbers are withheld; phone/website display adheres to opt-in flags; disclaimers render accurately across all viewports.

#### M2.6 — Optional Private Application Photo Uploads
- **Status**: **PLANNED — SEPARATELY GATED**.
- **Objectives**: Provide an optional multi-photo upload mechanism within initial consignment intake to assist curation triage.
- **Business Rationale**: Improves early curation evaluation by enabling applicants to submit photos during initial intake. Separately gated so it does not block completion of the core dealer program.
- **Key Deliverables**:
  - Optional multi-image upload dropzone in `ConsignmentModal.tsx` (recommending 5+ photos covering exterior, interior, engine, and flaws).
  - Client-side image preview, reordering, and deletion before submission.
  - Secure upload directly to private Firebase Cloud Storage buckets (`consignment_uploads/{appId}/*`).
  - Private Cloud Storage security rules restricting asset access strictly to the authenticated applicant and administrators.
  - Association of image download URLs or storage paths with the consignment application document in Firestore.
  - Administrative curation review in `AdminPortalPage.tsx` with 1-click photo transfer into the Listing Editor Workspace media gallery upon approval.
  - Automated or administrative cleanup routine purging orphaned storage assets from abandoned submissions.
- **Dependencies**: M2.1 completion. **Explicitly independent of M2.2–M2.5**; does not gate core dealer program delivery.
- **Exit Criteria**: Applicants can optionally upload images; unauthenticated or unauthorized users cannot access uploaded photos; binary data is never stored in Firestore; core dealer program can launch with or without M2.6.

### 11.5 Release Governance & Quality Gates
Every milestone in the Phase 1 roadmap must satisfy rigorous, independent release governance gates before promotion:

1. **Independent Milestone Gates**: Each milestone possesses dedicated design specifications, implementation scope, test suites, documentation updates, and production verification criteria. No milestone may claim completion based on downstream or partial work.
2. **Staging Validation Gate**: All functionality, database migrations, and security rules must be fully deployed and tested on the `staging` branch. Unit tests, emulator tests, and manual regression checks must pass 100%.
3. **Explicit Production Promotion Authorization**: Promotion from `staging` to `main` requires an authorized Pull Request, clean branch synchronization, and explicit engineering sign-off. Merging directly to `main` without staging validation is strictly forbidden.
4. **Separate Cloud Firestore Rules Deployment**: Cloud Firestore security rules deployments are separate manual operations executed via `npm run deploy:rules`. Code builds or Vercel deployments do not deploy database security rules.
5. **Build Verification vs. Milestone Completion**: Successful TypeScript compilation (`npm run build`) is a prerequisite but does not alone establish milestone completion.
6. **Production QA Evidence Gate**: Milestones cannot be closed or recorded as complete in release history without verified production QA evidence, including live database verification, security rule probes, and production smoke testing.

### 11.6 Founding Dealer Pilot Objectives & Key Performance Indicators (KPIs)
Prior to declaring broad public availability of the boutique dealer program, Wailtail will conduct a controlled Founding Dealer Pilot with 3 to 5 hand-selected Canadian boutique collector vehicle dealerships.

**Pilot Strategic Objectives**:
- Validate the operational viability of manual dealer verification with live regulatory bodies (e.g., OMVIC, VSA).
- Validate the dealer onboarding experience, inventory intake, and draft authoring workflows.
- Confirm buyer receptivity and trust regarding dealer badges, tax indicators, and $0 doc fee disclosures.
- Stress-test the exclusive vehicle ownership warranty and ensure zero pass-through or brokered inventory reaches the platform.

**Pilot Key Performance Indicators (KPIs)**:
1. **Verification Cycle Time**: Average time from dealer application submission to manual administrative verification decision $\le 48\text{ hours}$.
2. **Listing Curation Turnaround**: Average time from dealer inventory submission to curated draft ready for scheduling $\le 72\text{ hours}$.
3. **Exclusive Ownership Integrity**: 100% compliance with exclusive ownership warranties; 0 incidents of brokered, third-party, or private-owner pass-through inventory.
4. **Fee Compliance**: 100% adherence to the zero-dollar fee model; 0 dealer documentation fee infractions ($0 CAD doc fee strictly upheld).
5. **Regulatory & Advertising Compliance**: 0 provincial regulatory complaints, advertising infractions, or consumer disclosure disputes across all pilot lots.
6. **Dealer Satisfaction Score**: Net promoter satisfaction score $\ge 90\%$ among pilot dealers regarding listing presentation and curation support.

### 11.7 Definition of Phase 1 Completion
The Wailtail Phase 1 Verified Boutique Dealer Program is formally defined as complete when:
1. **Core Milestones Delivered**: Milestones M1.0, M1.1, M2.0A, M2.0B, M2.1, M2.2, M2.3, M2.4, and M2.5 are fully implemented, verified in staging, promoted to `main`, deployed to production with active Cloud Firestore security rules, and validated with documented production QA evidence.
2. **Separately Gated Milestones**: Milestone M2.6 (Optional Private Application Photo Uploads) is either completed or formally confirmed as decoupled from the core dealer release.
3. **Founding Dealer Pilot Executed**: The Founding Dealer Pilot has concluded with all 6 pilot KPIs satisfied.
4. **Documentation Synchronized**: All system bibles, API references, user documentation, and changelogs reflect the production state with zero roadmap or status contradictions.

---

## 12. Development Workflow & Continuous Integration

### 12.1 GitHub Actions CI Workflow

The canonical automated validation workflow is defined in `.github/workflows/ci.yml`.

**Workflow triggers**:
- Pushes to `staging` and `main`.
- Pull requests targeting `staging` and `main`.
- Manual execution through `workflow_dispatch`.

**Execution environment**:
- GitHub-hosted `ubuntu-latest` runner.
- Node.js 22, with npm dependency caching.
- Java 21 (Temurin distribution) for Firebase Emulator Suite execution.
- 30-minute job timeout.
- Read-only repository contents permission.

### 12.2 Required CI Validation Sequence

The workflow installs dependencies with `npm ci`, ensuring installation follows the committed `package-lock.json`, and executes these gates sequentially:

1. **Production build and TypeScript** — `npm run build` executes `tsc && vite build`. Both TypeScript compilation and the Vite production bundle must complete successfully.
2. **Static analysis** — `npm run lint` executes ESLint across the repository with unused-directive reporting and zero-warning tolerance.
3. **Endpoint tests** — `npm run test:endpoint` executes the Node test runner against `tests/authorize-approved-consignor.test.ts`, covering endpoint and authorization behaviour.
4. **Firestore security rules tests** — `npm run test:rules` starts the Firebase Firestore emulator and executes `tests/firestore.rules.test.ts` through `@firebase/rules-unit-testing`.

**Local validation equivalent**:

```bash
npm ci
npm run build
npm run lint
npm run test:endpoint
npm run test:rules
```

Java 21 is required for the emulator-backed Firestore rules test suite. The package script `npm test` runs both endpoint and rules test suites; build and lint remain separate commands.

### 12.3 ESLint Adoption Boundaries

ESLint is configured through the flat configuration in `eslint.config.js`, using the JavaScript and TypeScript recommended configurations and React Hooks rules. The critical `react-hooks/rules-of-hooks` rule is enforced as an error. The `react-hooks/exhaustive-deps` rule and selected pre-existing TypeScript/JavaScript rules are intentionally not enforced as part of this initial progressive-adoption configuration. A passing lint job therefore confirms compliance with the currently enabled rules; it must not be represented as exhaustive static analysis or proof that all legacy code patterns have been remediated.

### 12.4 Verified Staging CI Baseline — November 5, 2026

The first fully successful execution of the configured workflow was GitHub Actions run [#42092748121](https://github.com/homeextent/wailtail/actions/runs/42092748121), associated with staging commit [`a28f8b0eaabbaeacd285a2b268212884d4c0bb07`](https://github.com/homeextent/wailtail/commit/a28f8b0eaabbaeacd285a2b268212884d4c0bb07), titled **Add ESLint and enforce CI lint checks**.

**Recorded result**:
- Production build and TypeScript checks: **PASSED**.
- ESLint: **PASSED**.
- Endpoint suite: **41 passed, 0 failed**.
- Firestore security rules suite: **126 passed, 0 failed**.
- GitHub Actions job: **completed successfully**.

These counts describe the test results from the identified run; future code changes must be validated by their own CI execution. Emulator tests validate the configured rules against the emulator and do not replace live production security testing.

### 12.5 CI, Staging Verification & Production Release Are Separate Gates

A successful CI run establishes that the checked commit passed the automated build, lint, endpoint, and emulator test commands. It does **not**:
- Deploy application code or serverless functions to production.
- Deploy Cloud Firestore security rules (which remain a separate explicit operation using `npm run deploy:rules`).
- Promote `staging` to `main` or authorize a production release.
- Establish that outstanding production security blockers have been resolved.
- Replace manual regression testing, production smoke testing, or production QA evidence.

All production promotion remains subject to the release governance and explicit authorization requirements in Section 11.5. M2.0B, account deletion and auction mutation protections are verified on staging; production rollout, Storage cutover and operational acceptance remain separately gated. Staging acceptance does not establish production completion.

