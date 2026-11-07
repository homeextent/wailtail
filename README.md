# Wailtail Collector Car Auction Platform

## Auction security implementation review

The staging compatibility audit is implemented in this PR. Watchlists, member activity and private inquiries use authenticated server operations. Public branding exposes three approved display fields; platform image uploads use the trusted administrator uploader. Designated administrators retain member moderation and global/promotion configuration under candidate rules. Broad catalog purge, legacy bidder purge, one-click consignment conversion and client promotion counters are explicitly disabled. Create drafts and delete selected listings through Vehicle Inventory instead. See [Stage 3 staging acceptance](docs/stage3-staging-acceptance.md) for the release boundary and coverage.

PR #3 on `security/auction-security-gate` introduces trusted seller editing, public field projections, bidding, administrator inventory and gallery operations, comment authorization, bid retraction, scoped bid reset, draft duplication, and transactional settlement. Review and staging acceptance are pending. Production release and Firebase rules publication are separate decisions.

Deployment uses one Vercel Function, `api/router.ts`, to stay within the Hobby plan function limit. Handler implementations and shared server helpers live in `server/api/`. `vercel.json` preserves existing `/api/<endpoint>` URLs through an explicit allowlist router, ahead of the SPA fallback. New endpoint implementations belong in `server/api/` and must be added to the router. Each handler retains its own method and authorization checks. Server imports use explicit `.js` extensions for native Node ESM. Endpoint tests also compile and load every handler in native Node, without the development loader.

Use the demo emulator environment for verification. Run `npm run build`, `npm run lint`, `npm run test:endpoint`, `npm run test:rules`, `npm run test:seller-emulator`, and `npm run test:auction-browser`. CI runs these checks. For interactive inspection, `npm run test:seller-browser` serves synthetic seller, administrator and public routes on port 4178. The normal `npm run dev` uses the checked-in Firebase project configuration.

Unattended start and expiry use `GET /api/reconcile-auction-clock`. Auction notification delivery uses `GET /api/dispatch-auction-notifications`. Each requires a scheduler bearer token matching `CRON_SECRET`. Delivery additionally requires `RESEND_API_KEY`, and `RESEND_FROM_EMAIL` is stored with the message when queued. Trusted uploads require `FIREBASE_STORAGE_BUCKET`. The deployment scheduler must invoke both workers regularly, and actual email delivery still needs an authorized mailbox check. Tests mock the provider and verify stable retry keys, not inbox delivery. Pending messages older than one hour are marked for reconciliation.

Wailtail is a modern, Bring-a-Trailer style vehicle auction platform designed for curated classic, collector, and enthusiast cars. It features clean Canadian CAD financials, soft-close anti-sniping protection, real-time bidding telemetry, rich editorial showcase chapters, and a multi-car vehicle catalog architecture.

---

## 1. System Architecture

### Frontend & Application Stack
- **Framework**: React 19 + TypeScript + Vite
- **Seller Social Marketing Kit & Canvas Graphic Compositor (`SocialPromoKitModal.tsx`, `public/social-promo-template-4x3.jpg`)**: Decoupled promotional toolkit and HTML5 Canvas graphic compositor ($1200 \times 900\text{ px}$) compositing dynamic vehicle photography and typography over a pre-rendered static poster template. Features visual 2-slot image selection with orange border framing (`#ff5e00`), condensed automotive headline typography (`Impact` / condensed heavy italic), intelligent two-line title wrapping, dynamic campaign stage gradient switching (`Upcoming`, `Live Now`, `Ending Soon`), 3 enthusiast copy generator templates, and tracked UTM referral link generation (`?utm_source=seller_social&utm_medium=social_kit`). Hoisted globally via `App.tsx` state and triggered across the Listing Editor Workspace, Seller Activity Hub, and Admin Vehicle Inventory.
- **AI Listing Writing Assistant & Editorial Synthesis Engine (`AiAssistantModal.tsx`, `api/ai-assistant.ts`)**: 3-step authoring wizard (Ingestion, Chassis Interview, Editorial Hydration) integrating multimodal document intake (PDFs and vehicle paperwork photos), structured provenance accordion drawers (Ownership, Services, Flaws, Modifications), dedicated collector disclosure fields (odometer integrity, accident history, mechanical needs), sticky dock navigation, Step 3 photo handoff guidance directing sellers to Section 5, client-side HTML5 canvas micro-compression (downscaling to max 1200px at 75% quality JPEG to compress 5MB camera snapshots to ~150KB), 3.0MB cumulative intake budgeting, and unified 3-tier vehicle taxonomy integration with safe draft hydration.
- **Platform Trust & "How It Works" Educational Engine (`HowItWorksModal.tsx`, `App.tsx`)**: Global tabbed educational onboarding modal styled with dark slate architecture (`bg-slate-900 border-slate-700/60`), amber accents, and backdrop blur. Provides dedicated guidance across 3 pillars: "Buying on Wailtail" (0% buyer fees in CAD, 2-minute anti-sniping soft closes, Pre-Purchase Inspections), "Selling on Wailtail" (retail enthusiast marketplace vs wholesale dealer clearinghouses, no 3rd-party inspector bottlenecks, no post-sale green/red light arbitration, direct private-party CAD wire settlement), and "Trust & Security" (zero-tolerance anti-shill defense, verified bidder identities, upfront transparency). Bound to root `App.tsx` state (`isHowItWorksModalOpen`, `howItWorksTab`) and accessible via `Navbar.tsx` (desktop header and mobile menu), `Footer.tsx`, and contextual consignment deep links.
- **Collector Photography Guide & Recommended Shot List (`PhotoGuideDrawer.tsx`)**: Collapsible helper drawer embedded in Section 5 ("Hero Carousel & Full Photo Gallery") across `ListingEditorWorkspace.tsx` and `AdminPanelModal.tsx`. Details the 5 core visual pillars (Exterior Walkaround [30–40 photos], Cabin & Cockpit [20–30 photos], Powertrain & Mechanical [10–15 photos], Undercarriage & Suspension [15–20 photos], Transparency, Flaws & Paint Depth [10–15 photos]) along with golden hour composition, 45° front wheel alignment, and landscape orientation pro-tips; collapsed by default to prevent layout displacement.
- **Platform Legal Infrastructure & PIPEDA Compliance (`LegalModal.tsx`, `Footer.tsx`)**: Global modal dialog providing tabbed access to Terms of Service (legally binding CAD bids, 0% buyer premium, 3-day direct offline settlement, as-is inspection disclaimers, consignor clean-title warranties) and PIPEDA-compliant Privacy Policy (winner contact disclosures, FCM push token lifecycle) triggered via global `App.tsx` state.
- **Mandatory Clickwrap Agreement Checkboxes (`BidModal.tsx`, `ConsignmentModal.tsx`)**: Un-checked controlled checkboxes requiring explicit agreement to Wailtail Terms of Service and Privacy Policy before bidding or submitting consignment intake inquiries, disabling submission buttons until checked.
- **Universal Automotive Gearbox Taxonomy**: Standardized 12-entry transmission taxonomy (4-Speed Manual, 5-Speed Manual, 6-Speed Manual, 7-Speed Manual, Automatic / Torque Converter, Dual-Clutch Automatic (DCT), Automated Manual (SMG/F1/E-Gear), Continuously Variable Transmission (CVT), Single-Speed Direct Drive (EV), Sequential / Dog-Leg, Preselector / Semi-Automatic, Other / Custom Gearbox...) across consignment intake and workspace authoring.
- **Strict Input Sanitization & Required Field Highlighting**: Strict digit-only sanitization (`[^0-9]`) on odometer fields, telephone character enforcement (`[^0-9+\-() ]`) on phone numbers, and prominent red error border rings (`border-red-500/80`) with text badges on required Section 1 editor inputs.
- **SEO-Friendly URL Document Slugs (`auctionService.ts`)**: Automatic generation of human-readable document IDs (`${slug}-${shortHash}`) in `createNewListing()` combining sanitized make/model/spec slugs with random short collision-resistant hashes.
- **Progressive Web App (PWA) & Offline Caching**: `vite-plugin-pwa` with standalone Web Manifest (`#0f172a` theme), Workbox `StaleWhileRevalidate` caching for scripts/styles, and `NetworkFirst` runtime caching for Firebase Storage assets
- **Static Open Graph & Twitter Card Social Metadata**: Pre-rendered static Open Graph (`og:site_name`, `og:type`, `og:title`, `og:description`, `og:url`, `og:image`, `og:image:secure_url`, `og:image:type`, `og:image:width`, `og:image:height`, `og:image:alt`) and Twitter Card (`twitter:card`, `twitter:site`, `twitter:creator`, `twitter:title`, `twitter:description`, `twitter:image`, `twitter:image:alt`) preview tags in `index.html` referencing canonical domain (`https://www.wailtail.com/`), version-controlled platform asset (`public/og-wailtail-platform.jpg`), and digital vehicle auction platform metadata (0% buyer fees, transparent CAD bidding, nationwide logistics), guaranteeing 100% social preview fidelity for web crawlers (`facebookexternalhit`, X, WhatsApp, iMessage) without edge SSR or client-side JavaScript execution overhead
- **FCM Web Push Notification Engine**: Firebase Cloud Messaging (FCM) Web Push with root-scoped background service worker (`/firebase-messaging-sw.js`), VAPID key token exchange (`VITE_FIREBASE_VAPID_KEY`), race-condition safe hook lifecycle (`usePushNotifications.ts`), safe Firestore token merge persistence (`users/{uid}` and `bidders/{uid}` via `setDoc` with `{ merge: true }`), and diagnostic error state reporting
- **Dual-Slot Promotional & Cadence Engine**: Multi-surface campaign engine featuring dual-slot independent announcement banners (full-bleed Catalog Homepage Ribbon and Direct-Lot Header Banner), admin-configurable catalog grid cadence injection (-1 [Launch Mode: Show All Active Cards], 0 [Low Inventory Only], 6, 9, 12 lots with safe modulo cycling), low-inventory row padding ($\le 2$ lots), dynamic CTA routing (`consignment_modal`, `auth_modal`, `contact_modal`, `external_url`), audience segmentation (`all`, `guests_only`, `authenticated_only`), date window scheduling, image upload pipeline, and deterministic campaign rendering with zero `localStorage` dismissal suppression.
- **Decoupled Guest Telemetry Engine (`promo_analytics`)**: Decoupled click tracking recording atomic `increment(1)` writes directly into `promo_analytics/{promoId}`, eliminating 403 Forbidden errors for unauthenticated guests while keeping campaign settings securely restricted to administrators.
- **Google Analytics 4 (GA4) SPA Telemetry & Conversion Engine**: Asynchronous global bootstrap (`index.html`) targeting Measurement ID `G-GQZ2L1RQ9M` with suppressed automatic landing hits (`send_page_view: false`), typed telemetry service (`src/utils/analytics.ts`) with ad-blocker fail-open guards and `import.meta.env.DEV` routing isolation, reactive SPA route tracking bound to `document.title` lifecycle in `src/App.tsx`, and high-intent collector conversion event tracking (`bid_placed`, `consignment_submitted`, `provenance_view`).
- **Routing & Navigation**: Client-side full-page routing supporting multi-car catalog (`/` & `/catalog`), single-car lot details (`/auctions/[id]`), full-page admin portal (`/admin`), and dedicated split-screen authoring workspace (`/dashboard/listings/[id]/edit`) with safe fallback route defense guards redirecting `'new'` or unresolvable lot IDs to `/catalog` or `/admin?tab=inventory` with toast notifications to prevent runaway creation loops.
- **Tri-Role Access Control**: 3-way role hierarchy (`ADMIN`, `SELLER`, `BIDDER`) governing access privileges across administration, authoring, and bidding surfaces
- **5-Tab Admin Command Portal**: Dedicated operations suite (`AdminPortalPage.tsx`) covering Member Directory / Member Directory Management (formerly Bidder Registry), Consignment Applications, Vehicle Inventory & Lots, Live Bids Telemetry Ledger, and Platform Branding (with Promotional & Launch Campaign Manager), enhanced with bi-directional seller attribution and member lot inventory sub-ledgers
- **Multi-Select Bulk Action Engine**: Checkbox selection system with floating action toolbar and safe 150-item batch chunking for status mutations and bulk deletions
- **Authentication Security & Session Defense**: Multi-layer security in `AuthContext.tsx` and `AuthModal.tsx` featuring real-time orphaned session revocation guards (auto-`signOut` and toast notice when user document is deleted), post-signup auto-logout, login blocking for unverified sessions, credentialed status verification checks, atomic verification auto-sync, Google OAuth direct state hydration, and deferred welcome email dispatch
- **Catalog Status Predicate Normalization**: Exported pure predicates (`isLive`, `isUpcoming`, `isEnded`) ensuring all draft, preview, and scheduled lots are counted cleanly
- **Real-Time Clock-Driven Auction Lifecycles**: Dynamic timestamp evaluation via `getEffectiveAuctionStatus()` resolving auction states (`upcoming`, `active`, `ending_soon`, `ended`, `sold`), continuous countdown clock transitions without full page reloads, and silent background Firestore synchronization (`updateAuctionStatus`) reconciling stored status with real-time clock thresholds in `AuctionHeader.tsx` and `VehicleCatalogGrid.tsx`
- **Sticky Stepper Navigation**: Unobstructed sticky sidebar navigation (`sticky top-16 self-start max-h-[calc(100vh-4.5rem)]`) in the 60/40 split-screen authoring workspace (`ListingEditorWorkspace.tsx`), eliminating layout clipping for seamless scrolling across all 7 listing sections
- **Hagerty Canada Valuation Link Integration**: Direct linking of verified Hagerty Canada market appraisal reports on vehicle listings (`AuctionHeader.tsx`) and preview cards via sanitized `https://` protocols (`formatExternalUrl`), with full authoring workspace input and JSON import/export persistence
- **Winning Bidder Settlement Loop Guard & Consignor Credentials**: Dual-layer settlement mutex locking lots via ephemeral in-flight locks (`inFlightSettlementIds`) and permanent browser session sets (`settledAuctionSessionIds`), a database-first atomic transaction test-and-set sentinel (`winningEmailSent: true` written to Firestore prior to outbound email dispatch), a 4-tier consignor contact fallback resolution chain, and Listing Editor workspace contact controls (`sellerEmail`, `sellerPhone` with `[^0-9+\-() ]` phone sanitization)
- **Styling**: Tailwind CSS with custom editorial typography and layout scales
- **Icons**: Lucide React
- **Taxonomy Engine**: Curated 80+ collector vehicle dataset (`src/data/vehicleTaxonomy.json`) powering a reactive 3-tier dependent selection pipeline (Year $\rightarrow$ Make $\rightarrow$ Model $\rightarrow$ Generation / Chassis Code)
- **State & Synchronization**: Real-time Firestore snapshot listeners (`onSnapshot`) with dynamic user profile synchronization (`subscribeToUserProfile`) and optimistic UI state hydration
- **Dynamic Browser Tab Synchronization & Brand Identity**: Route-aware `document.title` synchronization engine (`src/App.tsx`) dynamically switching browser tab titles across Catalog (*Wailtail — Curated Collector Car Auctions*), Single Lot Detail (`${year} ${make} ${model} — Wailtail`), Admin Portal, and Listing Editor Workspace views, paired with the standalone SVG `/favicon.svg` asset integration (`public/favicon.svg`) with `?v=2` cache-busting in `index.html` bypassing Chromium tab caching.
- **AuthModal Password Visibility Toggle**: Interactive password visibility toggle (`Eye` / `EyeOff` from `lucide-react`) across Sign In, Bidder Registration, and Seller Workspace Claim views in `AuthModal.tsx` with ergonomic keyboard tabbing (`tabIndex={-1}`) and automatic hidden-state resets on tab switching and modal closure.
- **Service Records Cloud Dossier Architecture**: Dual-surface integration for external historical records and cloud dossiers (Google Drive, Dropbox, OneDrive) via `serviceRecordsUrl`, surfaced in the public Vehicle Highlights sidebar card (`src/App.tsx`) and as a dedicated Featured Cloud Dossier card in Section 5 ("Records & Title") with external provider detection. Authoring controls in Section 1 (Row 10) support URL protocol sanitization (`formatExternalUrl`) and full JSON import/export schema persistence.
- **Maximized PDF Inspection Canvas & Client-Side Upload Guards**: Expanded inspection report lightbox canvas (`max-w-5xl` / `max-w-6xl`, `h-[78vh]`) with consolidated single-row control toolbar (title, badge, external tab link, amber download CTA) and native `#view=FitH` URL embedding. Client-side upload guards enforce a strict 25MB pre-flight limit on PDF inspection documents and 20MB limit on raw photo uploads before network transmission.
- **Pinned Seller Announcements & Discussion Linkifier (`CommentSection.tsx`)**: Comment feed enhancements allowing verified sellers and administrators to pin an official announcement with single-pinned Firestore constraint enforcement (`pinComment`), prioritized top-of-feed sorting with amber badges, and regex URL linkification (`renderLinkedText`) converting HTTP/HTTPS strings into secure, clickable links.
- **Category Lightbox Scoping & Gallery Picker Ergonomics**: Scoped photo lightbox navigation, cycling, and counter metrics strictly to the active category subset in `PhotoGalleryGrid.tsx`. Photo picker modals in `ListingEditorWorkspace.tsx` and `AdminPanelModal.tsx` feature responsive `aspect-[4/3]` cover cards with floating category pills and hover caption scrims, with PDF documents filtered out.
- **Platform Feedback & Bug Reporting Dock (`FeedbackModal.tsx`, `FloatingFeedbackWidget.tsx`)**: Dynamic floating pill button (`FloatingFeedbackWidget.tsx`) with dark slate backdrop blur styling and route-aware mobile collision avoidance (`bottom-24 right-4` on single-car lot pages to prevent obstruction of `StickyBidBar.tsx` high-bid indicators and bidding CTAs). Triggers collector-grade `FeedbackModal.tsx` supporting 3 feedback categories (`bug`, `suggestion`, `general`), character counter, auto-populated member credentials, and automated client diagnostic capture (URL, viewport dimensions, User Agent, UID/role) persisting to `/feedback`.

### Serverless & Cloud Infrastructure
- **Serverless AI Writing Assistant (`api/ai-assistant.ts`)**: Vercel serverless function routing to `gemini-2.5-flash` with resilient model fallbacks (`gemini-flash-latest`, `gemini-2.0-flash`), extended 60-second execution budget (`maxDuration = 60`), 8192 token output capacity, and edge `bodyParser` expanded to `sizeLimit: '4.5mb'` to support multi-page PDF ingestion without HTTP 413 drops.
- **Serverless Administrator Account Deletion (`api/admin-delete-user.ts`)**: Vercel endpoint requiring a revocation-aware Firebase ID token from a verified designated administrator. The server rejects self-deletion and designated-administrator targets, deletes the Auth identity, then cleans direct and exact-UID legacy profile records in `users` and `bidders`. Auth and Firestore cleanup are non-atomic and retryable; the client has no Firestore fallback.
- **Serverless Email Proxy (`api/send-consignment-email.ts`)**: Multi-template Vercel serverless function dispatching structured and dual-branded HTML notifications for consignment intake (`type: 'consignment'`), private buyer inquiries (`type: 'inquiry'`), seller consignment receipts (`type: 'consignment_receipt'`), consignment approval notices with seller claim onboarding (`type: 'consignment_approved'`), consignment rejection notifications (`type: 'consignment_rejected'`), outbid alerts (`type: 'outbid_notification'`), winning bidder confirmations (`type: 'winning_bid_confirmation'`), newly verified bidder welcomes (`type: 'welcome_bidder'`), and platform feedback reports (`type: 'feedback_report'`) via Resend API (with SendGrid fallback). Equipped with actionable 1-click triage deep links (`/admin?tab=consignments&id=${appId}&action=approve|reject`) and case-insensitive admin recipient deduplication.
- **Serverless YouTube Ingestion (`api/youtube-playlist.ts`)**: Server-side XML RSS Atom feed fetcher bypassing client CORS restrictions for 1-click YouTube playlist chapter auto-import.
- **Firebase Cloud Storage Asset Pipeline**: Direct Storage URL streaming (`uploadImageToStorage`) with client-side canvas micro-compression (`compressImageDataUrl`) and a 900KB serialized payload size cap in `saveMediaConfig()`.
- **Firebase CLI Named Database Deployment**: `firebase.json` mapping bound explicitly to named database instance `ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e`, `.firebaserc` project binding (`studio-apps-483721`), and terminal deployment pipeline (`npm run deploy:rules`) executing direct rules deployment via `firebase-tools`.
- **Disaster Recovery & Backup Posture**: Native multi-layer protection active on GCP project `studio-apps-483721` securing live production database instance `ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e` and storage bucket `gs://wailtail`, featuring 7-day continuous microsecond Point-in-Time Recovery (PITR), 30-day automated daily cold backup schedules, and Cloud Storage Object Versioning (14-day noncurrent expiration lifecycle capped at a maximum of 2 versions) to guard against logical corruption and accidental asset deletions without storage bloat.

### Firebase Backend Services
- **Cloud Firestore**:
  - `auctions`: Core vehicle documents containing specs, financials, taxonomy generations, and lifecycle status.
  - `auctions/{auctionId}/media/{document=**}`: Recursive wildcard subcollection matching for media configurations, images, chapters, and assets.
  - `bids`: Real-time bidding telemetry with anti-sniping timestamp verification and Option B soft retraction audit fields (`status`, `retractedAt`, `retractionReason`, `retractedBy`, `retractedByName`).
  - `comments`: Community Q&A feed with verified seller and administrator official nested replies.
  - `users` / `bidders`: User profiles containing tri-role hierarchy (`ADMIN`, `SELLER`, `BIDDER`), ban statuses, email verification flags, personal saved vehicle lot arrays (`watchlist`), and registered FCM Web Push notification tokens (`fcmTokens`).
  - `feedback`: Platform feedback submissions and bug reports capturing category, message, reporter metadata, client telemetry diagnostics, and review status.
  - `settings/promotions`: Promotional campaign configurations, catalog card definitions, and lot header banner settings locked to admins.
  - `promo_analytics`: Decoupled guest click telemetry collection recording public atomic `increment(1)` interactions.
  - `consignment_applications` / `consignments`: Intake inquiries capturing structured locations (`locationCity`, `locationProvince`, `locationCountry`), normalized lowercase seller emails, verified-email applicant read access, conversion statuses, cascading deletion links, and legacy member auto-link references on historical records.
  - `dealer_profiles`: Private canonical boutique dealer profiles (`dealer_profiles/{dealerId}`) restricted strictly to administrator access.
  - `dealer_verification_audits`: Append-only administrative verification audit trail (`dealer_verification_audits/{auditId}`) documenting verification methods, decisions, and timestamps; immutable and restricted to administrators.
  - `inquiries`: Direct private communications with consignors.
- **Firebase Cloud Storage**: Vehicle photo and inspection document pipeline streaming assets directly to Storage buckets via `uploadImageToStorage` and storing lightweight HTTPS URLs in Firestore to bypass document size limits.
- **Firebase Cloud Messaging (FCM)**: Native Web Push notification engine dispatching live outbid alerts and auction lifecycle events via root-scoped background service worker (`/firebase-messaging-sw.js`) with VAPID token exchange (`VITE_FIREBASE_VAPID_KEY`) and multi-device Firestore token merge synchronization.
- **Firebase Authentication**: Email/password and Google OAuth authentication with email verification flags.
- **Firebase Security Rules**: Role-based access control protecting administrative actions, campaign settings, auction modifications, and verified-email applicant read authorization with modification locks on consignment records (`firestore.rules`).

### Repository Directory Structure
```
.
├── .firebaserc                         # Firebase CLI default project binding (studio-apps-483721)
├── firebase.json                       # Firebase CLI configuration mapping firestore.rules to named database instance
├── api/
│   ├── admin-delete-user.ts        # Serverless Firebase Admin user authentication identity deletion endpoint
│   ├── ai-assistant.ts             # Serverless Gemini 2.5 Flash AI writing assistant & multimodal synthesis engine
│   ├── send-consignment-email.ts   # Serverless multi-template email dispatcher (consignments, receipts, welcomes, inquiries) via Resend API
│   └── youtube-playlist.ts         # Serverless CORS proxy for YouTube RSS playlist ingestion
├── firestore.rules                     # Production Firestore security rules & RBAC helper functions
├── scripts/
│   └── post-commit                 # Git post-commit hook mirroring core docs and rules to Google Drive KB
├── public/
│   ├── firebase-messaging-sw.js        # Background Service Worker for FCM Web Push outbid alerts
│   ├── icons/                          # PWA maskable application icons (192x192 & 512x512)
│   └── social-promo-template-4x3.jpg   # Static 4:3 canvas poster compositor template
├── src/
│   ├── components/
│   │   ├── AdminPanelModal.tsx         # Secondary host operations drawer
│   │   ├── AdminPortalPage.tsx         # Full-page /admin operations portal & user moderation
│   │   ├── AiAssistantModal.tsx        # 3-step AI listing synthesis wizard with canvas micro-compression
│   │   ├── AuctionHeader.tsx           # Sticky/hero auction title, anti-snipe countdown, and lot-level Watch/Share actions
│   │   ├── AuthModal.tsx               # Firebase email/password & Google OAuth modal
│   │   ├── BidModal.tsx                # Real-time anti-snipe CAD bid submission dialog
│   │   ├── CatalogCard.tsx             # Multi-lot catalog vehicle card with dynamic hero resolution
│   │   ├── CommentSection.tsx          # Public Q&A thread with verified seller/admin replies
│   │   ├── ConsignmentModal.tsx        # 3-tier taxonomy consignment intake & member detection
│   │   ├── ContactSellerModal.tsx      # Private buyer-to-consignor direct communication
│   │   ├── FeedbackModal.tsx           # Platform feedback & bug reporting modal with client telemetry
│   │   ├── FloatingFeedbackWidget.tsx  # Dynamic floating dock with mobile collision avoidance
│   │   ├── Footer.tsx                  # Platform legal and footer navigational elements
│   │   ├── HeroMediaCarousel.tsx       # Scoped hero photo carousel with isolated lightbox viewer
│   │   ├── HowItWorksModal.tsx         # Platform trust & "How It Works" educational modal (Buying, Selling, Trust)
│   │   ├── InlineShowcaseSection.tsx   # Editorial showcase narrative chapters and specs
│   │   ├── LegalModal.tsx              # Platform Terms of Service & PIPEDA Privacy Policy modal
│   │   ├── ListingEditorWorkspace.tsx  # Split-screen authoring workspace (/dashboard/listings/[id]/edit)
│   │   ├── ListingSubNav.tsx           # In-page listing section anchor sub-navigation
│   │   ├── Navbar.tsx                  # Header navigation, brand logo, non-clipping user profile dropdown, and auth triggers
│   │   ├── PhotoGalleryGrid.tsx        # Categorized photo gallery with 8-photo mobile truncation & PDF viewer
│   │   ├── PhotoGuideDrawer.tsx        # Section 5 collector photography guide & 5-pillar shot list drawer
│   │   ├── ShareModal.tsx              # Social share dialog with instant link copying
│   │   ├── ShowcaseChaptersEditor.tsx  # Curated editorial chapter management workspace
│   │   ├── SocialPromoKitModal.tsx     # Seller social marketing kit & canvas graphic compositor
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
   - **Full-Bleed Catalog Homepage Announcement Ribbon**: Embedded announcement ribbon pinned flush beneath `Navbar.tsx` (`bg-slate-900 border-b border-amber-500/20`), inner `max-w-7xl` alignment, warm amber badge/CTA styling, and non-blocking telemetry logging.
   - **Unified Catalog Grid Cadence Injection**: Admin-configurable cadence dropdown (`cadenceInterval`: 0 [Disabled], 6, 9, 12 lots) splicing promotional cards into active vehicle rows using safe modulo cycling, paired with low-inventory row padding ($\le 2$ lots).
   - **Catalog Status Predicate Normalization**: Exported helper predicates (`isLive`, `isUpcoming`, `isEnded`) in `VehicleCatalogGrid.tsx` ensuring draft, preview, and scheduled lots count cleanly under the Upcoming filter, guaranteeing zero uncounted or dropped inventory lots.
6. **Dedicated Listing Authoring Workspace (`/dashboard/listings/[id]/edit`) & Role-Gated Controls**:
   - Split-screen workspace with live public preview pane (desktop and mobile viewports).
   - 7 listing sections: Vehicle Identity, Editorial Narrative, Single-Source Technical Specifications, Showcase Chapters (01-04), Hero & Categorized Photo Gallery, YouTube Driving Videos, and CAD Financial Rules.
   - **Unified Master AI Trigger & Overwrite Defense**: Anchored the primary `✨ AI Writing Assistant` trigger exclusively within the Section 1 card header. Duplicate triggers were systematically purged from the top navbar, Section 2 header, and Section 4 header to streamline workflow and eliminate the risk of destructive AI overwrites on custom narrative edits.
   - **Runaway Listing Auto-Creation Loop Guard & Fallback Redirection**: Eradicated un-guarded programmatic `createNewListing()` `useEffect` invocations on `'new'` / invalid IDs in `App.tsx` and `ListingEditorWorkspace.tsx`, eliminating the recursive Firestore `onSnapshot` re-render echo that previously spawned 150+ duplicate lots. Safe fallback route guarding redirects missing, `'new'`, or invalid IDs to `/catalog` (or `/admin?tab=inventory` for administrators) with a "Listing lot not found" notification toast.
   - **Role-Gated Workspace Controls & Lifecycle Overrides**: Administrative header controls (**Import JSON**, **Export JSON**, and **+ New Listing**) are strictly restricted to administrators. Manual lifecycle status overrides (`Ended - Manual Force Close`, `Sold - Settled Offline`) in Section 7 are role-gated behind `isAdmin`, restricting non-admin sellers to `Draft` and `Scheduled / Live`.
   - **Seller Lot Selection Filtering**: Visible lots in the header vehicle dropdown are derived via `visibleAuctions`, filtering the selector for sellers to only show lots they own (`lot.sellerId === user.uid || lot.sellerEmail === user.email`).
   - **Section 1 Required Field Error Highlighting**: Empty required inputs in Section 1 display red error border rings (`border-red-500/80`) and text warning badges (`* VIN Required`, `* Make Required`, etc.) resolving seller confusion surrounding stepper completion counters.
   - **Inline Title Auto-Generator Trigger**: Relocated `⚡ Auto-generate from Specs` helper trigger inline directly adjacent to the "Listing Title" label.
   - **Sticky Stepper Navigation**: Unobstructed vertical progress stepper (`sticky top-16 max-h-[calc(100vh-4.5rem)]`) with unclipped parent layout wrappers, keeping section navigation firmly pinned below the header during scrolling.
   - **Hagerty Canada Valuation Link Integration**: Direct linking of verified Hagerty Canada valuation appraisal reports via `hagertyValuationUrl` text input in Section 1, sanitized protocol formatting (`formatExternalUrl`), full JSON export/import support, and high-contrast live preview CTA buttons.
   - **Legacy Demo Fallback String Purge**: Stripped hardcoded demo fallback strings (`9118200142`, `126,200 km`, `Guards Red`, `3.0L Flat-Six CIS`) across live preview and public components so unentered fields render cleanly as '—'.
   - **Draft Lot Isolation**: Section 7 Auction Lifecycle Status select dropdown includes `'draft'` status, allowing creators and administrators to isolate in-progress lots from public catalog feeds until curation readiness.
   - 100% blank draft isolation with nullish coalescing defaults (`$0 CAD` No Reserve).
7. **Full-Page Admin Operations Portal (`/admin`)**:
   - Role-gated full-screen dashboard (`AdminPortalPage.tsx`) featuring 5 administrative command tabs: Member Directory / Member Directory Management (formerly Bidder Registry), Consignment Applications, Vehicle Inventory & Lots, Live Bids Telemetry Ledger, and Platform Branding.
   - **Member Directory Management**: Paginated directory querying across all users with name, email, and UID filtering, plus a role dropdown filter (`ALL`, `ADMIN`, `SELLER`, `BIDDER`), expandable bid history accordions, and an expandable seller portfolio drawer (`🚗 Lots (N)`) resolving resident member vehicle lots in-memory via `getSellerLots()` with thumbnail, CAD financials, status badges, and direct CTA actions (`Open in Listing Editor →` and `View in Inventory ↗`).
   - **5th Admin Tab (Vehicle Inventory & Lots)**: Full-width inventory management suite with live CAD high bid tracking, status filter tabs (`All`, `Draft`, `Preview`, `Upcoming`, `Live`, `Ended`), real-time search, row-level workspace launch links, lot deletion triggers, and a clickable seller attribution sub-line (`Seller: ${sellerName || sellerEmail}`) under VIN with cross-tab search seeding into the Member Directory and fallback display for direct listings (`Seller: Direct / Wailtail`).
   - **Multi-Select Bulk Action Engine**: Checkbox selection engine with floating action toolbar supporting batch status changes, bulk approvals/rejections, and batch deletions chunked safely into 150-item sets for Firestore batch write reliability.
   - **Cascading Deletion Controls**: Atomic service methods in `auctionService.ts` (`batchDeleteAuctions`, `batchDeleteConsignments`, `deleteListing`, `deleteConsignmentApplication`) preventing orphaned records across auctions and consignment submissions.
   - **1-Click Email Triage Deep-Links**: Actionable email CTAs (`/admin?tab=consignments&id=${appId}&action=approve|reject`) in `api/send-consignment-email.ts` with auto-filtering, modal surfacing, and history cleanup in `AdminPortalPage.tsx`.
   - Atomic moderation controls: 3-way role switching (`ADMIN` ↔ `SELLER` ↔ `BIDDER`), ban/unban toggling, and email verification override. Permanent user deletion is delegated entirely to the authenticated server endpoint `/api/admin-delete-user`; the client sends a Bearer token and `{ uid }` and never falls back to direct Firestore deletion.
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
10. **Multi-Template Serverless Email Dispatcher & Consignment Curation Gating (`api/send-consignment-email.ts`, `ConsignmentModal.tsx`)**:
    - Multi-template serverless proxy handling vehicle consignment intake submissions (`type: 'consignment'`), private buyer inquiries (`type: 'inquiry'`), seller consignment receipts (`type: 'consignment_receipt'`), and verified bidder welcomes (`type: 'welcome_bidder'`) via Resend API (with SendGrid fallback).
    - Consignment applications compile 3-tier taxonomy, universal gearbox selection, VIN, numeric-sanitized mileage, telephone-sanitized phone numbers, normalized lowercase seller emails (`sellerEmail`), and structured location fields (`locationCity`, `locationProvince`, `locationCountry`). While client-side email blur triggers member recognition for user convenience, new M2.0A submissions no longer write registration metadata (`registeredUserId`, `isRegisteredUser`, `registeredUserRole`) into application documents. Historical records retain legacy auto-link metadata without migration or deletion. Primary persistence errors propagate directly to the caller, legacy dual-write is non-fatal best effort, and serverless notifications execute post-persistence in a non-blocking background routine. Applicant reads are strictly gated to authenticated users with verified email claims matching `sellerEmail`.
    - **Mandatory Clickwrap Compliance & Curation Gating Enforcement**: Unchecked controlled agreement checkbox requiring explicit agreement to Terms of Service and Privacy Policy before submission. Completely purged the unvetted "Ready to draft your listing right now?" bypass card, post-submission "Open Listing Workspace" CTA button, and `onLaunchDirectListing` prop from `ConsignmentModal.tsx`. Applicants are strictly restricted to "Close & Return to Catalog", enforcing mandatory administrative curation, identity verification, and manual approval prior to draft workspace provisioning.
    - Private buyer inquiries generate structured HTML digest tables compiling inquirer contact details, inquiry topic, target lot title, and message text, dispatched with client error isolation.
    - Dual-branded HTML templates provide polished buyer onboarding guidelines and official seller application receipts with direct deep links.
11. **Terminal Firebase Security Rule Deployment & Emulator Testing Infrastructure**:
    - Direct rules deployment via `firebase.json` mapping to named database instance `ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e`, `.firebaserc` project binding (`studio-apps-483721`), and `"deploy:rules": "firebase deploy --only firestore:rules"` script in `package.json`.
    - Allows developers to deploy synchronized production `firestore.rules` directly from the terminal via `npm run deploy:rules` with zero drift.
    - Local security rules unit testing via Firebase Local Emulator Suite executing `"test:rules": "firebase emulators:exec --only firestore 'node --import tsx --test tests/firestore.rules.test.ts'"` (`npm run test:rules`), validating rule definitions against the project's named database instance.
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
18. **Dual-Slot Promotional & Cadence Engine (`AdminPortalPage.tsx`, `VehicleCatalogGrid.tsx`, `AuctionHeader.tsx`)**:
    - **Dual-Slot Independent Announcement Banners**: Independent management suites under Platform Branding for **Catalog Homepage Announcement Banner** (`catalogBanner`) and **Direct-Lot Header Banner** (`lotHeaderBanner`), each featuring independent master toggles, copy inputs, audience segmentation (`all`, `guests_only`, `authenticated_only`), date scheduling, CTA routing, and click telemetry.
    - **Full-Bleed Catalog Homepage Ribbon (`VehicleCatalogGrid.tsx`)**: Pinned flush beneath `Navbar.tsx` with edge-to-edge dark slate container (`bg-slate-900 border-b border-amber-500/20`), inner `max-w-7xl` alignment, warm amber badge/CTA styling, and non-blocking telemetry logging.
    - **Configurable Catalog Grid Cadence Injection**: Admin-configurable cadence dropdown (`cadenceInterval`: -1 [Launch Mode: Show All Active Cards], 0 [Low Inventory Only], 6, 9, 12 lots) splicing promotional cards into active vehicle rows using safe modulo cycling, paired with low-inventory row padding ($\le 2$ lots) and a -1 Launch Mode override allowing all promotional cards to wrap across rows during low-inventory periods.
    - **Deterministic Rendering & Dismissal Purge**: Eradicated ✕ dismiss buttons, dismissal handlers, and permanent `localStorage` caching (`wailtail_dismissed_promos`, `LOT_HEADER_BANNER_ID`) across all promotional surfaces, making campaign visibility 100% deterministic based on admin toggles, audience targeting, and schedule dates.
    - **Decoupled Guest Telemetry (`promo_analytics`)**: Decouples click logging from admin-restricted settings into `promo_analytics/{promoId}` using atomic `increment(1)` writes (`'catalog_banner'`, `'lot_header_banner'`). Grants public guest click logging without 403 Forbidden security exceptions while keeping campaign settings securely restricted to administrators.
19. **Serverless User Deletion & Authentication Security Architecture (`/api/admin-delete-user.ts`, `AuthContext.tsx`, `AuthModal.tsx`)**:
    - **Server-side Administrator Account Deletion (`api/admin-delete-user.ts`)**: Requires a Bearer Firebase ID token verified with revocation checking (`verifyIdToken(idToken, true)`), a verified email matching the shared designated-administrator allowlist, and a target UID supplied separately from administrator identity. Self-deletion and both designated administrator targets are rejected. The server deletes the Auth identity and cleans direct profile documents plus legacy records matched by exact UID in `users` and `bidders`; no email-only deletion query is used. Auth and Firestore cleanup are not atomic: incomplete cleanup returns an error and can be retried. The client `deleteUserRecord()` has no Firestore fallback.
    - **Orphaned Auth Session Revocation Guard (`AuthContext.tsx`)**: Real-time `onSnapshot` listener on `users/{uid}` paired with `onAuthStateChanged` hydration verification. If an administrator deletes an account, the active session is instantly terminated (`signOut(auth)`), state is purged, a toast alert is surfaced (`"This account has been deleted by an administrator."`), and the user is redirected to `/`.
    - **Strict Email Verification Enforcement (M2.0B Security Corrections)**: Firebase Authentication `user.emailVerified` serves as the sole email verification and administrative authority (`isEmailVerified = Boolean(user?.emailVerified)`). Auto-logout post-signup prevents unauthenticated browsing, unverified sign-in attempts are blocked across `AuthModal.tsx` and `AuthContext.tsx`, and credentialed status checks (`checkEmailVerification(email, pass)`) reload the user instance to verify confirmation against Firebase Auth. Firestore rules strictly forbid ordinary users from creating or updating profiles with `isEmailVerified: true` without a verified token claim (`request.auth.token.email_verified == true`). Insecure client-side demo self-verification has been removed.
    - **Google OAuth Direct State Hydration**: Instant UI state hydration in `signInGoogle()` eliminating listener suppression flags and manual page refreshes, setting `isEmailVerified: true`, enforcing banned user checks, and provisioning `role: 'admin'` for designated `ADMIN_EMAILS`.
    - **Deferred Welcome Email Dispatch**: Suppressed during raw account creation, `sendWelcomeBidderEmail()` dispatches strictly upon confirmed Firebase Authentication email verification (`currentUser.emailVerified === true`), guarded against duplicates via `welcomeEmailSent` in Firestore state.
20. **Deep-Link Auth Preservation & Admin Triage Pipeline (`App.tsx`, `AuthModal.tsx`, `AdminPortalPage.tsx`)**:
    - **Route Gating Suspension**: Halts premature redirects to `/` while authentication state is initializing (`authLoading`).
    - **Session Storage Triage Cache**: Captures triage parameters (`tab`, `id`, `action`) under `sessionStorage` key `wailtail_pending_admin_deeplink` for unauthenticated deep-link visitors.
    - **Contextual Auth Modal Banner**: Surfaces an emerald admin callout banner in `AuthModal.tsx` prompting administrative authentication.
    - **Automated Triage Restoration & History Cleansing**: Resolves stored parameters upon sign-in, routes directly to `/admin` with target parameters, opens triage confirmation dialogs automatically, and sanitizes browser history via `clearUrlParams()`.
21. **Automated Consignment Rejection Notifications & Non-Blocking Pipeline (`api/send-consignment-email.ts`, `auctionService.ts`)**:
    - **Serverless Rejection Template**: Generates high-visibility `type: 'consignment_rejected'` HTML status updates (`[Wailtail] Consignment Application Update — ${vehicleTitle}`) informing consignors of curation decisions with fallback vehicle taxonomy.
    - **Resilient Delivery Execution**: Evaluates fallback recipient parameters (`sellerEmail` vs `email`) and runs dispatches in non-blocking asynchronous routines (`Promise.allSettled` for bulk rejections), ensuring SMTP delivery latency never halts atomic Firestore status transitions.
22. **Seller Workspace Claim Onboarding & Trusted Approved-Consignor Authorization (`AuthContext.tsx`, `AuthModal.tsx`)**:
    - **Claim Link Routing**: Delivers customized claim links (`action=claim_seller&appId=...&lot=...&email=...`) targeting `/dashboard/listings/[id]/edit`.
    - **Registration Auto-Fill & Emerald Banner**: Pre-fills the approved seller's email address and renders a specialized onboarding banner in `AuthModal.tsx`.
    - **Trusted Server-Side Consignor Role Elevation (`/api/authorize-approved-consignor`, `AuthContext.tsx`) — Implemented in M2.0B**: Transitions approved consignor onboarding to server-side token verification using Firebase Admin SDK. Cryptographically verifies caller ID token, matches approved consignment applications, executes atomic updates across `users/{uid}` and `bidders/{uid}` to `'seller'`, safely links converted lots in `auctions/{convertedAuctionId}` with conflict detection, and refreshes the canonical user profile in client React context without optimistic self-promotion. Client-side role elevation (`elevateApprovedConsignor`) has been completely eradicated.
23. **Real-Time Clock-Driven Auction Lifecycles & Silent Background Reconciliation (`src/utils/formatters.ts`, `src/components/AuctionHeader.tsx`, `src/components/VehicleCatalogGrid.tsx`)**:
    - **Real-Time Clock Evaluation**: `getEffectiveAuctionStatus()` continuously evaluates real-time timestamps against `startTime` and `endTime` thresholds to dynamically resolve lot states (`upcoming`, `active`, `ending_soon`, `ended`, `sold`).
    - **Zero-Refresh UI Transitions**: `formatAuctionCountdown()` triggers seamless client-side status shifts across lifecycle boundaries without page reloads. `VehicleCatalogGrid.tsx` pairs normalized predicates (`isLive`, `isUpcoming`, `isEnded`) with a 1-second interval ticker to update catalog filter tab counts dynamically.
    - **Background Firestore Synchronization**: `AuctionHeader.tsx` automatically detects when stored Firestore status diverges from real-time effective status and invokes `updateAuctionStatus()`, reconciling the database silently in the background.
24. **Hagerty Canada Valuation Integration & Sticky Stepper Ergonomics (`src/components/ListingEditorWorkspace.tsx`, `src/components/AuctionHeader.tsx`)**:
    - **Third-Party Market Valuation**: Links verified Hagerty Canada valuation appraisal reports directly from single-car lot headers and workspace preview panes via conditional, high-contrast CTA buttons (`TrendingUp` icon, external window).
    - **URL Protocol Sanitization**: Employs `formatExternalUrl()` to enforce case-insensitive `https://` prefixing on external links, guarding against relative path routing errors.
    - **Sticky Progress Navigation**: Pins the 7-section progress stepper (`sticky top-16 max-h-[calc(100vh-4.5rem)]`) in the 60/40 authoring workspace, removing overflow clipping to maintain visible stepper anchors while drafting listings.
25. **Platform Legal Infrastructure & Mandatory Clickwrap Compliance (`LegalModal.tsx`, `BidModal.tsx`, `ConsignmentModal.tsx`, `Footer.tsx`)**:
    - **Tabbed Legal Modal**: `LegalModal.tsx` provides accessible, authoritative legal documentation across Terms of Service (legally binding CAD bids, 0% buyer premium, 3-day direct offline settlement, as-is inspection disclaimers, consignor clean-title warranties) and PIPEDA-compliant Privacy Policy (winner disclosures, FCM token lifecycle) triggered via global `App.tsx` state.
    - **Mandatory Clickwrap Agreements**: Un-checked controlled agreement checkboxes on `BidModal.tsx` and `ConsignmentModal.tsx` require explicit user agreement to Terms of Service and Privacy Policy before bidding or submitting consignment inquiries, disabling action buttons until checked.
    - **Footer Overhaul & Legacy Marketplace Integration**: Refreshed platform copy, national Canadian tagline ("Consigning & Bidding Nationwide Across Canada 🇨🇦"), direct linking to Wailtail Legacy Marketplace ([https://marketplace.wailtail.com](https://marketplace.wailtail.com)), and global legal modal openers.
26. **Starting Bid Financial Logic & First Bid Synchronization (`auctionService.ts`, `BidModal.tsx`, `AuctionHeader.tsx`, `StickyBidBar.tsx`)**:
    - **Starting Bid Floor Alignment**: Synchronized `currentBid` to `startingBid` when `bidCount === 0`.
    - **Opening Bid Calculations**: Sets minimum required bid to `startingBid` (instead of `startingBid + increment`) for zero-bid listings, labels bids cleanly as "Starting Bid" / "Opening Bid", and renders dynamic `auction.title` in modal headers.
27. **Universal Automotive Gearbox Taxonomy & Strict Input Sanitization (`ListingEditorWorkspace.tsx`, `ConsignmentModal.tsx`)**:
    - **12-Entry Universal Gearbox Taxonomy**: Standardized across consignment intake and workspace authoring (4-Speed Manual, 5-Speed Manual, 6-Speed Manual, 7-Speed Manual, Automatic / Torque Converter, Dual-Clutch Automatic (DCT), Automated Manual (SMG/F1/E-Gear), Continuously Variable Transmission (CVT), Single-Speed Direct Drive (EV), Sequential / Dog-Leg, Preselector / Semi-Automatic, Other / Custom Gearbox...) with dynamic custom text input.
    - **Strict Regex Input Sanitization**: Digit-only sanitization (`[^0-9]`) on odometer inputs and telephone character validation (`[^0-9+\-() ]`) on phone numbers.
28. **SEO-Friendly URL Document Slugs (`auctionService.ts`)**:
    - Human-readable document IDs (`${slug}-${shortHash}`) generated in `createNewListing()` combining sanitized make/model/spec slugs with random collision-resistant short hashes (e.g., `1988-porsche-928-s4-automatic-mtur4abv`).
29. **Transactional Bidding Email Alerts & Deduplication Engine (`api/send-consignment-email.ts`, `auctionService.ts`)**:
    - **Real-Time Outbid Alerts**: Dispatches transactional emails notifying outbid bidders with current CAD high bid, minimum required increment, and direct lot links. Dispatches execute outside transaction closures to prevent duplicate email floods on OCC retries.
    - **Winning Bid Confirmation**: Dispatches celebratory post-auction emails containing hammer price CAD, consignor contact credentials, and the 4-Stage Canadian CAD Settlement Checklist.
    - **In-Tab Mutex & Transaction-Gated Settlement**: Employs a module-level mutex (`inFlightSettlementIds`) and gates HTTP email dispatches strictly behind successful Firestore transaction commits (`winningEmailSent: true`), guaranteeing single-dispatch execution across parallel browser tabs.
    - **4-Tier Winner Resolution & Dual Bid Querying**: Resolves winning emails across a 4-tier fallback chain (`winningBid.bidderEmail` $\rightarrow$ `users/{bidderId}` $\rightarrow$ `bidders/{bidderId}` $\rightarrow$ `auction.highBidderEmail`) and queries bids across both subcollection (`auctions/{id}/bids`) and root (`bids`) paths.
30. **Bid Modal Confirmation Lock State Machine (`BidModal.tsx`)**:
    - Explicit step state machine (`step: 'input' | 'submitting' | 'success'`) locking the "Bid Placed Successfully!" confirmation view and confetti animation on screen until the user explicitly dismisses the modal.
    - Blocks real-time Firestore `onSnapshot` background updates from auto-resetting the active modal view.
    - Mapped raw Firestore version mismatch/contention exceptions to user-friendly messaging: *"High bidding activity detected—another bid was placed at the same time. Please re-confirm your bid."*
31. **Listing Editor Dashboard Navigation & Terminal Status Lock (`ListingEditorWorkspace.tsx`, `auctionService.ts`)**:
    - High-contrast `← Back to Dashboard` navigation CTA button in the listing editor header, routing administrators to `/admin?tab=inventory` and consignors/sellers to `/` with their activity hub open.
    - Enforced strict terminal status rules on expired auctions (`now >= endTime`), locking status to `sold` or `ended` to prevent listings from regressing to `draft` or vanishing from the public catalog homepage.
32. **Firestore Welcome Email Sentinel & OAuth Popup Guard (`AuthContext.tsx`, `AuthModal.tsx`)**:
    - Moved `welcomeEmailSent: true` sentinel directly to Firestore profiles (`users/{uid}` and `bidders/{uid}`), eliminating duplicate welcome emails on new browser sessions.
    - Added `isGoogleSigningIn` mutex lock in `AuthContext.tsx` and `AuthModal.tsx` disabling the Google Sign-In button during in-flight popups to prevent Firebase Auth promise assertions (`INTERNAL ASSERTION FAILED`).
    - Intercepted Firebase Auth `auth/quota-exceeded` rate limit errors with user-friendly banner prompts.
33. **Winning Bidder Settlement Loop Guard & Consignor Credential Pipeline (`auctionService.ts`, `AuctionHeader.tsx`, `ListingEditorWorkspace.tsx`)**:
    - **Permanent Session Settlement Mutex (`settledAuctionSessionIds`)**: Introduces a module-level permanent session mutex `Set<string>` in `auctionService.ts` that permanently locks lots from recurring settlement passes within an active browser tab session, complementing ephemeral in-flight locks.
    - **Database-First Atomic Settlement Sentinel**: In `reconcileAuctionClosureAndNotifyWinner()`, performs an atomic Firestore `runTransaction` reading fresh document state directly from the database (`transaction.get(auctionRef)`) instead of stale in-memory React component props. Aborts immediately if `winningEmailSent === true`, and commits `winningEmailSent: true` and terminal status (`sold` / `ended`) atomically before triggering outbound HTTP fetch to `/api/send-consignment-email`.
    - **Clock Interval Reconciler Guard (`AuctionHeader.tsx`)**: Replaced loose interval tracking with `settledLotsRef = useRef(new Set<string>())`, preventing the 1-second countdown effect from repeatedly invoking status updates and reconciliation passes on expired lots.
    - **Hierarchical Consignor Contact Fallback Resolution Chain**: Evaluates consignor credentials across a 4-tier pipeline (`sellerEmail`: `freshAuction.sellerEmail` $\rightarrow$ `users/{sellerId}.email` $\rightarrow$ `consignment_applications.sellerEmail` $\rightarrow$ `'contact@wailtail.com'`; `sellerPhone`: `freshAuction.sellerPhone` $\rightarrow$ `users/{sellerId}.phone` $\rightarrow$ `consignment_applications.sellerPhone` $\rightarrow$ `undefined`), ensuring complete consignor contact details in winning settlement emails.
    - **Consignor Contact Editor Controls & Intake Conversion Mapping**: Added Consignor Email (`sellerEmail`) and Consignor Phone (`sellerPhone` with `[^0-9+\-() ]` sanitization) form inputs under Section 1 (Row 9) in `ListingEditorWorkspace.tsx` with full state hydration and JSON schema persistence, and mapped intake contact fields to drafts in `convertConsignmentToDraftListing()`.
34. **Runaway Listing Creation Loop Guard, Consignment Gating & Dual-Slot Promotional Cadence Engine (`App.tsx`, `ListingEditorWorkspace.tsx`, `ConsignmentModal.tsx`, `VehicleCatalogGrid.tsx`, `AdminPortalPage.tsx`)**:
    - **Runaway Auto-Creation Loop Guard**: Eradicated un-guarded programmatic `createNewListing()` `useEffect` invocations on `'new'` / invalid IDs in `App.tsx` and `ListingEditorWorkspace.tsx`, eliminating the recursive Firestore `onSnapshot` re-render echo that generated 150+ duplicate lots.
    - **Listing Route Defense & Fallback Guards**: Engineered safe fallback route guarding redirecting unresolvable, missing, or `'new'` listing IDs to `/catalog` (or `/admin?tab=inventory` for administrators) accompanied by a "Listing lot not found" notification toast.
    - **Consignment Curation Gating Enforcement**: Purged the "Open Listing Workspace" CTA button and `onLaunchDirectListing` prop from `ConsignmentModal.tsx`, restricting applicants strictly to "Close & Return to Catalog" and enforcing mandatory administrative approval before draft workspace provisioning.
    - **Dual-Slot Independent Announcement Banners**: Implemented independent management suites in `AdminPortalPage.tsx` for the **Catalog Homepage Announcement Banner** (`catalogBanner`) and **Direct-Lot Header Banner** (`lotHeaderBanner`), each with independent master toggles, copy inputs, audience segmentation, date scheduling, CTA routing, and click telemetry.
    - **Full-Bleed Catalog Homepage Ribbon**: Integrated full-bleed announcement ribbon in `VehicleCatalogGrid.tsx` pinned flush beneath `Navbar.tsx` (`bg-slate-900 border-b border-amber-500/20`, inner `max-w-7xl` alignment, warm amber badge/CTA styling).
    - **Configurable Grid Cadence Injection**: Added admin-configurable cadence dropdown (`cadenceInterval`: 0 [Disabled], 6, 9, 12 lots) splicing promotional cards into active catalog grids using safe modulo cycling, paired with low-inventory row padding ($\le 2$ lots).
    - **Deterministic Campaign Visibility**: Completely eradicated ✕ dismiss buttons, dismissal handlers, and permanent `localStorage` caching (`wailtail_dismissed_promos`, `LOT_HEADER_BANNER_ID`), making promotional campaigns 100% deterministic based on admin switches, audience criteria, and schedule dates.
35. **Provenance Cloud Dossiers, PDF Canvas Overhaul & Pinned Announcements (`PhotoGalleryGrid.tsx`, `ListingEditorWorkspace.tsx`, `CommentSection.tsx`, `App.tsx`, `AuctionHeader.tsx`)**:
    - **Service Records Cloud Dossier Architecture**: Dual-surface presentation of external vehicle history dossiers (`serviceRecordsUrl`) via a high-contrast button in the public Vehicle Highlights sidebar card (`App.tsx`) and a dedicated Featured Cloud Dossier card in Section 5 ("Records & Title") in `PhotoGalleryGrid.tsx` with automatic provider detection (Google Drive, Dropbox, OneDrive, or generic storage). Authoring controls in Section 1 (Row 10) support protocol sanitization via `formatExternalUrl()` and JSON import/export persistence.
    - **Maximized PDF Viewer Canvas & Consolidated Toolbar**: Expanded inspection document lightbox across `PhotoGalleryGrid.tsx` and `ListingEditorWorkspace.tsx` to `max-w-5xl` / `max-w-6xl` at `h-[78vh]` with `#toolbar=1&navpanes=0&view=FitH` URL parameters for automatic width fitting. Replaced fragmented vertical headers and detached bottom CTAs with a consolidated top toolbar (document icon, truncated title, category badge, ghost "Open in New Tab", and amber "Download" CTA).
    - **Client-Side Upload Guards**: Enforced pre-flight 25MB file size limit on PDF inspection documents and 20MB limit on raw photo uploads across workspace editors before network streaming.
    - **Pinned Seller Announcements & Linkifier (`CommentSection.tsx`)**: Extended comment system with official pinned announcements, enforced via a single-pinned Firestore constraint (`pinComment`), prioritized top-of-feed sorting with amber badge styling, and an unpin trigger. Integrated discussion stream regex linkifier (`renderLinkedText`) converting raw HTTP/HTTPS URLs into secure, clickable links.
    - **Category Lightbox Scoping & Image Picker Overhaul**: Lightbox photo cycling, navigation strips, and telemetry counters ("Photo X of [subset]") are strictly scoped to the active category subset in `PhotoGalleryGrid.tsx`. Photo picker modals in `ListingEditorWorkspace.tsx` and `AdminPanelModal.tsx` feature responsive `aspect-[4/3]` cards with floating category pills and hover caption scrims, with non-image PDF documents cleanly excluded.
    - **Top Header Ergonomics**: Removed the Cloud Dossier button from `AuctionHeader.tsx` LOT ACTIONS to eliminate mobile clutter and preserve above-the-fold anti-snipe and bidding telemetry.
36. **Google Analytics 4 (GA4) SPA Telemetry & High-Intent Conversion Tracking (`src/utils/analytics.ts`, `src/App.tsx`, `index.html`)**:
    - **Global Bootstrap with Suppressed Auto-Pageviews (`index.html`)**: Asynchronously loads `gtag.js` targeting Measurement ID `G-GQZ2L1RQ9M` initialized with `{ send_page_view: false }`, preventing unhydrated landing hits and duplicate metric logging in a client-side single-page application.
    - **Typed Telemetry Utility & Dev Isolation (`src/utils/analytics.ts`)**: Modular telemetry service with safe global `window.gtag` typing, fail-open ad-blocker exception handling, and `import.meta.env.DEV` isolation diverting local and staging events to structured console debug logs to prevent test contamination of production analytics.
    - **Reactive SPA Route Tracking Lifecycle (`src/App.tsx`)**: Binds `trackPageView()` directly beneath centralized `document.title` synchronization with `authLoading` suppression filtering, ensuring route transitions capture fully hydrated vehicle titles (e.g. *1988 Porsche 928 S4 — Wailtail*) and catalog views accurately.
    - **High-Intent Collector Conversion Events**: Instruments dedicated collector conversions: `bid_placed` (`src/components/BidModal.tsx`) capturing auction ID, vehicle title, and CAD value; `consignment_submitted` (`src/components/ConsignmentModal.tsx`) capturing intake vehicle year, make, and model; and `provenance_view` (`src/components/AuctionHeader.tsx`, `src/App.tsx`) tracking clicks to external cloud service dossiers and Hagerty Canada valuation reports.
37. **Platform Feedback Pipeline & Dynamic Floating Dock (`FeedbackModal.tsx`, `FloatingFeedbackWidget.tsx`, `api/send-consignment-email.ts`, `firestore.rules`)**:
    - **End-to-End Feedback Architecture**: Integrated collector-grade feedback and bug reporting pipeline combining a reactive floating dock widget, interactive modal dialog, dedicated `/feedback` Firestore document collection, and serverless HTML email triage dispatcher.
    - **Dynamic Floating Dock & Micro-Animations (`FloatingFeedbackWidget.tsx`)**: Ergonomic floating pill button anchored across viewports featuring dark slate backdrop blur styling (`bg-slate-900/90 backdrop-blur-md border border-slate-700/80`), subtle hover micro-animations, dynamic label text, and optional callout badge tags (e.g., "BETA", "NEW").
    - **Mobile Bid Bar Collision Avoidance**: Viewport and route-aware layout engine that detects when a visitor is inspecting a single-car lot page (`/auctions/[id]`) and dynamically shifts the widget positioning to `bottom-24 right-4` on mobile devices ($< 768\text{px}$), preventing obstruction of `StickyBidBar.tsx` high-bid metrics and bidding CTAs while resting at `bottom-6 right-6` on desktop viewports and catalog/admin surfaces.
    - **Collector-Grade Modal & Diagnostic Capture (`FeedbackModal.tsx`)**: High-contrast modal supporting 3 categorized submission types (`bug`, `suggestion`, `general`) with visual radio pills, character limit enforcement (10–1,500 characters), and zero-friction client diagnostic telemetry automatically logging the active URL (`window.location.href`), viewport dimensions (`window.innerWidth x window.innerHeight`), browser User Agent, and authenticated user UID/role without requiring manual user input.
    - **Admin Campaign Manager Controls (`AdminPortalPage.tsx`)**: Dedicated "Floating Feedback & Bug Report Dock" management card in Platform Branding (`activeTab === 'branding'`) providing an Emerald/Slate master toggle switch (`promoSettings.feedbackWidget.enabled`), custom dock label input, and badge text configuration persisted to the `settings/promotions` singleton.
    - **Serverless HTML Email Dispatcher (`api/send-consignment-email.ts`)**: Serverless proxy (`type: 'feedback_report'`) compiling submissions into a dual-branded dark HTML digest with dynamic category badges (`BUG / TECHNICAL ISSUE`, `SUGGESTION / IMPROVEMENT`, `GENERAL FEEDBACK`), structured reporter details, client diagnostic table, formatted message text, and 1-click administrative mailto reply button.
    - **Firestore Security ACL (`firestore.rules`)**: Match rule permitting public unauthenticated submission creation (`allow create: if true;`) while restricting read, update, and deletion operations strictly to platform administrators (`allow read, update, delete: if isAdmin();`).
38. **Platform Trust, Educational "How It Works" Engine & Collector Photography Guide (`HowItWorksModal.tsx`, `PhotoGuideDrawer.tsx`, `ConsignmentModal.tsx`, `Navbar.tsx`, `Footer.tsx`)**:
    - **Global Tabbed Educational Onboarding Modal (`HowItWorksModal.tsx`, `App.tsx`)**: Comprehensive educational modal built with dark slate architectural styling (`bg-slate-900 border-slate-700/60`), amber accents, and backdrop blur. Provides transparent guidance across 3 dedicated pillars:
      - **Buying on Wailtail**: 0% buyer fees in CAD (eradicating the standard 5% buyer's premium found on traditional auction platforms), 2-minute anti-sniping soft closes extending closing clocks on late bids, Pre-Purchase Inspections (PPIs) actively welcomed prior to auction end, and direct private-party CAD wire settlement.
      - **Selling on Wailtail**: Curated retail enthusiast digital auction vs wholesale dealer clearinghouses; eliminates OMVIC dealer arbitration bottlenecks, mandatory 3rd-party inspector dispatch delays, and post-sale green/red light arbitration panels; guarantees direct 100% cleared funds transfer before vehicle release.
      - **Trust & Security**: Zero-tolerance anti-shill bidding policy with automated bidding pattern monitoring, verified bidder identities, public transparent Q&A comments with consignors, and PIPEDA-compliant privacy controls.
    - **Global Root State & Multi-Surface Triggers (`App.tsx`, `Navbar.tsx`, `Footer.tsx`)**: Hoisted root state (`isHowItWorksModalOpen`, `howItWorksTab`) and standardized trigger handler `handleOpenHowItWorks(tab?: 'buying' | 'selling' | 'trust')` exposed via desktop navigation header trigger (`>= 1024px`), mobile slide-out navigation menu (`< 768px`), and platform footer navigation link.
    - **Contextual Consignment FAQ Accordion (`ConsignmentModal.tsx`)**: Collapsible "Seller FAQ & Settlement Details" accordion embedded above the mandatory clickwrap agreement checkbox and submission button. Addresses top consignor friction points (retail marketplace vs wholesale dealer arbitration, 100% direct cleared wire funds before release, consignor photography) with an inline deep-link trigger to the global selling guide (`openHowItWorks('selling')`).
    - **Collector Photography Guide & Recommended Shot List (`PhotoGuideDrawer.tsx`)**: Collapsible helper drawer embedded within Section 5 ("Hero Carousel & Full Photo Gallery") of `ListingEditorWorkspace.tsx` and `AdminPanelModal.tsx`. Outlines the 5 core visual pillars (Exterior Walkaround [30–40 photos], Cabin & Cockpit [20–30 photos], Powertrain & Mechanical [10–15 photos], Undercarriage & Suspension [15–20 photos], Transparency, Flaws & Paint Depth [10–15 photos]) alongside pro-tips for golden hour lighting, 45° front wheel alignment, and landscape framing; collapsed by default to prevent UI displacement.
39. **Seller Social Marketing Kit, HTML5 Canvas Poster Compositor & UTM Referral Engine (`SocialPromoKitModal.tsx`, `public/social-promo-template-4x3.jpg`)**:
    - **Global Social Marketing Modal (`SocialPromoKitModal.tsx`, `App.tsx`)**: Decoupled promotional modal enabling vehicle consignors and administrators to generate high-converting promotional assets and tailored copy for Facebook Groups, marque forums, Instagram, and X (Twitter). Managed via root global state (`isSocialKitOpen`, `socialKitAuction`) and accessible across multiple application surfaces (Listing Editor Workspace header, Seller Activity Hub, and Admin Vehicle Inventory table).
    - **Static 4:3 Template Canvas Compositor (`public/social-promo-template-4x3.jpg`)**: High-energy client-side HTML5 Canvas graphic generator ($1200 \times 900\text{ px}$) compositing dynamic vehicle content over a pre-rendered static poster template. Renders Slot 1 (hero angle, top-right) and Slot 2 (detail/cockpit, lower-left) with vibrant orange framing (`#ff5e00`), condensed automotive headline typography (`Impact` / condensed heavy italic), intelligent two-line title wrapping without ellipsis truncation, text drop shadows, and baked Wailtail branding.
    - **Campaign Stage Reactivity**: Dynamic stage switcher supporting `Upcoming` (`UPCOMING AUCTION`), `Live Now` (`AUCTION IS LIVE`), and `Ending Soon` (`ENDING SOON`), updating the graphic headline gradient and copy templates in real time.
    - **Visual Photo Slot Selector**: Two interactive visual slot cards above the media tray with active selection rings (`Slot 1: Hero Angle`, `Slot 2: Cockpit / Detail`) and quick 1-2 pairing, replacing blind text dropdowns.
    - **Enthusiast Copy Generator**: 3 channel-specific copy templates ("Enthusiast Group Deep-Dive", "Marketplace Pitch", "X / Twitter Thread") using an authentic, grounded Canadian enthusiast tone with itemized vehicle specs, mechanical highlights, and closing admin courtesy notes.
    - **Tracked Referral UTM Engine**: Automatically generates canonical campaign URLs (`https://www.wailtail.com/auctions/[id]?utm_source=seller_social&utm_medium=social_kit`) with one-click clipboard copying (`🔗 Copy Link`) and external URL testing (`↗ Test URL`).
    - **CORS Configuration & Safe Export**: Configured cross-origin resource sharing (`Access-Control-Allow-Origin: *`) on Cloud Storage bucket `gs://studio-apps-483721.firebasestorage.app` via `cors.json`, paired with cache-busting image loading (`?wailtail_cors=1`) and `crossOrigin = 'anonymous'` to ensure error-free client-side canvas PNG exports (`handleDownloadGraphic`).
    - **Phase 2 Multi-Format Roadmap**: Documented planned multi-format aspect ratios (`social-promo-template-9x16.jpg` for 9:16 Vertical Stories / Reels and `social-promo-template-1x1.jpg` for 1:1 Square Feed) and seller referral analytics.
40. **Verified Boutique Dealer Identity & Security Foundation (M1 & M1.1 Milestones)**:
    - **Verified Boutique Dealer Initiative**: Introduced the architectural and security foundation for verified boutique automotive dealers on the Wailtail platform, differentiating professional boutique dealers from private sellers while strictly upholding platform standards.
    - **Canonical Dealer Profile Architecture (`dealer_profiles/{dealerId}`)**: Defined private, canonical dealer profile records capturing legal business name, DBA name, provincial licensing credentials, primary representative UID, physical address, public contact visibility toggles, and administrator verification metadata. Stored in `dealer_profiles/{dealerId}` with administrator-only read and write permissions, with document deletions permanently disabled.
    - **Dealer Identity Linkage via User Profiles**: Dealer association is linked through user profiles (`UserProfile.dealerId` and `BidderProfile.dealerId`). Non-admin users are strictly prevented from self-assigning, altering, or clearing their `dealerId` via Firestore security rules. Sharing a dealer identity does not inherently grant vehicle authoring or administrative inventory rights. In Phase 1, each verified dealer is represented by a single primary authorized representative. Under current rules, root user and bidder documents are publicly readable, exposing `dealerId` where present; read-boundary isolation is noted for M2 review.
    - **Auction Listing Snapshots (`dealerSnapshot`)**: Vehicle auction documents support `sellerType` (`'private' | 'dealer'`), `dealerId`, `dealerDocFee` ($0 CAD enforcement), `taxHandling`, `taxDisclaimerVersion`, and an administrator-controlled point-in-time `dealerSnapshot: DealerListingSnapshot` capturing approved public-safe business details (`dealershipName`, `displayName`, `dbaName`, `city`, `province`, `phone`, `website`) and verification timestamps. Snapshots are protected from non-admin modification while administrators retain update capabilities (administrator-controlled, not immutable against administrators). Optional TypeScript contract fields `dealerLicenseNumber` and `licensingJurisdiction` exist in the type definition but are not authorized for public snapshot exposure pending legal approval.
    - **Manual Administrator Verification & Audit Logging (`dealer_verification_audits`)**: Dealer verification is strictly administrator-controlled and decoupled from individual vehicle listing curation. Verification decisions are logged to `dealer_verification_audits/{auditId}` with strict action and status unions (`'verified'`, `'rejected'`, `'suspended'`, `'reviewed'`, `'updated'`), verifier UID, verification method, notes, and timestamp. The audit collection is append-only (updates and deletions forbidden).
    - **Consignment Application Protection & Six Trusted Verification Fields**: Extended consignment applications (`consignment_applications` and legacy `consignments`) with dealer intake declaration fields (`applicantType`, `dealershipName`, `dealerLicenseNumber`, `licensingJurisdiction`, etc.). Hardened security rules protect all six trusted administrator verification metadata fields:
      1. `verifiedAt`
      2. `verifierUid`
      3. `verificationStatus`
      4. `verificationMethod`
      5. `verificationExpiresAt`
      6. `verificationRecordVersion`
      Non-admin users cannot create or update applications containing any of these six fields or protected dealer listing attributes. Ordinary private seller application submissions and non-protected application updates remain fully supported.
    - **Implementation Boundaries**: The M1/M1.1 milestone establishes the foundational types, data contracts, and database security rules. Full dealer intake onboarding flows, administrative verification UI, and public dealer showroom badges/pages are scheduled for upcoming milestones (M2+) and are not yet complete. This milestone does not represent full Phase 1 delivery.
    - **Production Milestone & Promotion Record**:
      - Production merge commit: `cbae9be76c339a4eb8b03fa13fcebdfe80353dda`.
      - M1 and M1.1 foundation promoted to `main` via PR #1.
      - Staging synchronized with `main` at the time of promotion.
      - Vercel production deployment confirmed Ready.
      - Cloud Firestore security rules separately deployed to GCP project `studio-apps-483721` (`ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e`).
41. **Consignment Application Security Hardening (M2.0A Milestone)**:
    - **Verified-Email Read Authorization**: Consignment application access requires an authenticated Firebase user whose verified email claim (`email_verified == true`) exactly matches the document's normalized `sellerEmail`. Access authorization is derived strictly from the cryptographic token claim rather than unverified client-supplied identifiers (`registeredUserId`).
    - **Creation & Modification Locks**: Non-admin creation strictly requires `status: 'pending'` and bars injection of administrator-controlled metadata, protected dealer verification fields, and registration linkage fields (`registeredUserId`, `isRegisteredUser`, `registeredUserRole`). New M2.0A submissions no longer write these registration fields. Non-admin document updates and deletions are completely locked (`allow update, delete: if isAdmin();`). Guest submissions remain supported for initial intake.
    - **Historical Compatibility & Dual Collection Parity**: Both `consignment_applications` and legacy `consignments` enforce identical security rules. Historical application documents retain legacy registration metadata without migration or deletion and remain readable by authorized applicants.
    - **Persistence & Notification Resilience**: Submissions normalize `sellerEmail` to lowercase upon creation. Primary persistence errors in `consignment_applications` propagate directly to the caller without synthetic fallback IDs, legacy dual-write is non-fatal best effort, and serverless notifications execute post-persistence in a non-blocking background routine with a 5000ms timeout guard.
    - **Emulator Verification**: 83 passing unit tests (`npm run test:rules`) executed against named database instance `ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e`.
    - **Release Posture & Milestone Boundaries**: M2.0A consignment application security hardening is complete, deployed to production, with Cloud Firestore security rules successfully deployed to GCP project `studio-apps-483721` (`ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e`), and required production QA confirmed on November 5, 2026. M2.0B trusted server-side role authorization and its security corrections are **verified on staging**, but are **not production-approved**. The separate administrator account-deletion vulnerability has since been corrected and tested on staging in commit `860042bc35fcc98246f6385a035fc08d3c84d01f`; it has not been production-deployed. Auction ownership and mutation authorization remains a production blocker.

---

## 3. Getting Started

### Prerequisites
- Node.js 22 and npm
- Java 21 (required for Firebase emulator-backed security rules tests)
- Firebase project configured with Firestore and Authentication

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

# Run Firestore security rules emulator unit tests
npm run test:rules
```

### Continuous Integration & Local Validation

GitHub Actions runs the repository CI workflow defined in `.github/workflows/ci.yml` on:
- Pushes to `staging` and `main`.
- Pull requests targeting `staging` and `main`.
- Manual `workflow_dispatch` execution.

The workflow uses Node.js 22 and Java 21 (for the Firebase emulator), installs the lockfile-pinned dependencies with `npm ci`, and runs the following checks in order:

1. `npm run build` — TypeScript compilation followed by the Vite production build.
2. `npm run lint` — ESLint validation.
3. `npm run test:endpoint` — serverless endpoint and authorization tests.
4. `npm run test:rules` — Firestore security rules tests executed through the Firebase emulator.

Run the same validation locally before pushing changes:

```bash
npm ci
npm run build
npm run lint
npm run test:endpoint
npm run test:rules
```

Java 21 is required locally when running the Firebase emulator-backed rules suite. The combined `npm test` script also runs both test suites, but does not replace the build and lint checks.

**Current reported staging test coverage:** `npm run test:endpoint` runs 85 tests (41 approved-consignor authorization tests and 44 administrator account-deletion tests); `npm run test:rules` runs 126 Firestore rules emulator tests. Roo Code reported `npm run lint`, `npx tsc --noEmit`, `npm run build`, and both test suites passing before account-deletion commit `860042bc35fcc98246f6385a035fc08d3c84d01f`. This local verification report is not a substitute for a successful GitHub Actions run associated with that commit.

**CI is validation, not deployment.**

### Environment Configuration Requirements

The application relies on the following environment variables (configured in `.env.local` or host dashboard):

| Environment Variable | Requirement | Description |
| :--- | :--- | :--- |
| `VITE_FIREBASE_VAPID_KEY` | **Required** (Web Push) | Public Web Push VAPID key used by `getToken()` in `src/hooks/usePushNotifications.ts` to register FCM push notification subscriptions. |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | **Required** (Serverless Admin User Deletion) | JSON-serialized Firebase service account key credentials used by `/api/admin-delete-user.ts` for administrative user deletion. |
| `RESEND_API_KEY` | **Required** (Email Dispatch) | Secret API key for Vercel serverless email dispatch via Resend (`/api/send-consignment-email.ts`). |
| `GEMINI_API_KEY` | Optional | API secret for Gemini AI narrative assistance. |
| `APP_URL` | Optional | Deployment host URL used for self-referential links, OAuth callbacks, and API routing. |

### Knowledge Base Sync & Git Post-Commit Hook

The repository maintains an automated documentation and security rule mirror pipeline to keep external AI assistants and the Gemini Gem Knowledge Base synchronized with project architecture.

Because Git hooks inside `.git/hooks/` are local to the environment and untracked by Git, the canonical hook script is version-controlled at `scripts/post-commit`. Developers and contributors can activate the hook locally with a single command:

```bash
cp scripts/post-commit .git/hooks/post-commit && chmod +x .git/hooks/post-commit
```

Once activated, every successful `git commit` automatically mirrors four core files:
- `README.md` — Platform overview, stack details, and quickstart documentation.
- `CHANGELOG.md` — Detailed changelog history and unreleased feature notes.
- `SYSTEM_BIBLE.md` — Master system architecture, data models, and component specifications.
- `firestore.rules` — Production Cloud Firestore database security rules.

**Target Directory**:
`/home/jeremy/GoogleDrive/06_WEBSITES/WailTail.com/auction`

**Operational Guidelines & Distinctions**:
- **Continuous Drive Sync vs. Frozen Chat Sessions**: Google Drive sync is continuous, copying files immediately upon commit. However, Gemini Gem Knowledge Bases freeze context per active chat session. To mount and reference newly synced updates, launch a new chat session in the Gemini Gem interface.
- **Local Mirroring vs. Live Rules Deployment**: Committing changes and mirroring `firestore.rules` to Google Drive **does not** deploy rules to Firebase Cloud. Live Firestore security rules deployment to GCP project `studio-apps-483721` must still be executed explicitly via `npm run deploy:rules`.


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

---

## 5. Phase 1 Roadmap & Program Status

Wailtail is actively executing the **Phase 1 Verified Boutique Dealer Program**, establishing an institutional framework for licensed Canadian boutique classic and collector vehicle dealerships to consign and auction inventory alongside private sellers.

For comprehensive milestone specifications, commercial boundaries, architecture, acceptance criteria, and release governance, refer to the authoritative [`SYSTEM_BIBLE.md`](SYSTEM_BIBLE.md).

### Program Status Summary (as of November 5, 2026)

| Milestone | Title & Focus | Status | Details |
| :--- | :--- | :--- | :--- |
| **M1.0** | Dealer Foundation and Data Architecture | **COMPLETE** | Core schemas, TypeScript interfaces, and baseline security rules. |
| **M1.1** | Dealer Verification Metadata and Security Hardening | **COMPLETE** | Dual-collection protection for all 6 trusted verification fields; 18/18 live probe checks passed; production deployed. |
| **M2.0A** | Consignment Security and Persistence Hardening | **COMPLETE** | Verified-email applicant reads, token-derived auth, modification locks, 83 emulator tests; deployed to production with Cloud Firestore rules; production QA passed. |
| **M2.0B** | Trusted Server-Side Role Authorization | **VERIFIED ON STAGING** | Firebase Admin SDK ID-token verification with revocation checking; transactional approved-consignor revalidation; protected user/bidder roles and verification state; removal of client-side role elevation; 126 Firestore rules tests and 41 M2.0B endpoint/authority tests. *Not production-approved.* |
| **Admin Account Deletion Hardening** | Server-Authorized Account Deletion | **VERIFIED ON STAGING** | Revocation-aware designated-administrator authorization; self-deletion and designated-account protection; server-owned Auth and Firestore cleanup with retry handling; 44 regression tests (85 combined endpoint tests). *Not production-deployed; auction ownership/mutation authorization remains a separate production blocker.* |

| **M2.1** | Administrative Consignment Application Review | **PLANNED** | Dedicated read-only application detail inspection; applicant declarations vs verified metadata; private curator notes. |
| **M2.2** | Dealer Application and Intake | **PLANNED** | Structured dealer intake; regulatory declarations (exclusive vehicle ownership & legal seller of record); representative validation. |
| **M2.3** | Manual Dealer Verification & Profile Creation | **PLANNED** | Administrative verification tools; canonical `dealer_profiles` creation; append-only audit logging in `dealer_verification_audits`. |
| **M2.4** | Dealer Vehicle Listing Integration | **PLANNED** | Approved dealer attribution; protected `dealerId` assignment; point-in-time `dealerSnapshot`; $0 doc fee lock (`dealerDocFee: 0`). |
| **M2.5** | Public Dealer Presentation & Badging | **PLANNED** | Verified boutique dealer badges; privacy-conscious showroom display (City/Province only); conditional phone/website display; regulatory disclaimers. |
| **M2.6** | Optional Private Application Photo Uploads | **PLANNED (GATED)** | Multi-photo upload in consignment intake; private Cloud Storage bucket; curation transfer to listing gallery. *Separately gated; non-blocker for core program.* |

### Phase 1 Governance & Commercial Boundaries
- **Core Milestone Execution Order**: M2.0B → M2.1 → M2.2 → M2.3 → M2.4 → M2.5 (with M2.6 separately gated and non-blocking). Administrator account-deletion hardening is a separate security workstream, not a change to the dealer-program milestone sequence.
- **Commercial Invariants**: Exclusive vehicle ownership (no broker/pass-through inventory); one primary authorized representative per dealer; manual admin verification; verification decoupled from lot curation; private canonical profiles; $0 dealer listing fees, $0 commissions, $0 doc fees, and $0 buyer premiums.
- **Detailed Specification**: See [`SYSTEM_BIBLE.md` (Section 11)](SYSTEM_BIBLE.md:2280) for authoritative requirements, dependencies, release gates, and Founding Dealer Pilot KPIs.
