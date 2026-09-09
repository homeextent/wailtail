# CHANGELOG

All notable changes to the Wailtail Single-Car Collector Auction Platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added
- **5th Admin Tab — Vehicle Inventory & Lots**:
  - Implemented dedicated full-width vehicle inventory management suite (`activeTab === 'inventory'`) in `src/components/AdminPortalPage.tsx`.
  - Added status filtering tabs (`All`, `Draft`, `Preview`, `Upcoming`, `Live`, `Ended`) with live lot counters and text search across title, make, model, and VIN.
  - Added table pagination with customizable page sizing and responsive page navigation controls.
  - Implemented row-level controls including direct editor launch buttons (`/dashboard/listings/${id}/edit`), quick status dropdown switchers, live CAD high bid tracking, reserve met tags, and lot deletion modals.
- **Multi-Select Bulk Action Engine**:
  - Engineered multi-checkbox selection engine across Consignment Applications and Vehicle Inventory tabs with "Select Page" / "Select All" controls.
  - Added fixed floating bulk action toolbar dock displaying selection counts and contextual batch operations:
    - Consignments: Batch Mark Reviewed, Batch Mark Approved, Batch Mark Rejected, Batch Delete.
    - Inventory Lots: Batch Set Live, Batch Set Upcoming, Batch Set Ended, Batch Delete Lots.
  - Enforced safe 150-item batch chunking across Firestore batch operations (`batchUpdateConsignmentStatus`, `batchDeleteConsignments`, `batchUpdateAuctionStatus`, `batchDeleteAuctions`) ensuring atomic execution without exceeding Firestore's 500-operation ceiling.
- **Cascading Deletion Controls**:
  - Added atomic deletion methods in `src/services/auctionService.ts` (`deleteListing`, `deleteConsignmentApplication`, `batchDeleteAuctions`, `batchDeleteConsignments`) preventing orphaned records across Firestore collections.
  - Supported optional bi-directional cascading: deleting an approved consignment application can cascade-delete its converted auction lot, and deleting an auction lot can cascade-delete its linked consignment intake document.
  - Flushed corresponding localized `localStorage` media cache keys upon single and batch lot deletions.
- **Catalog Status Predicate Normalization**:
  - Exported reusable, normalized status predicates (`isLive`, `isUpcoming`, `isEnded`) in `src/components/VehicleCatalogGrid.tsx`.
  - Normalized transitional states so `draft`, `preview`, and scheduled lots cleanly resolve under the `Upcoming` filter tab and live counter badge.
  - Standardized live lot resolution across `live`, `ending_soon`, and `active` states, guaranteeing zero uncounted or dropped inventory lots.
- **Consignment Intake Email Deep-Links & Triage**:
  - Added actionable high-visibility email CTA buttons in `api/send-consignment-email.ts` linking directly to `/admin?tab=consignments&id=${appId}&action=approve|reject`.
  - Implemented URL query parameter parsing (`tab`, `id`, `action`) in `src/components/AdminPortalPage.tsx` automatically focusing, highlighting, and surfacing the target consignment confirmation modal.
  - Added URL history cleansing (`window.history.replaceState`) via `clearUrlParams()` to eliminate redundant modal triggers upon page reload.
- **Terminal Firebase Security Rule Deployment Workflow**:
  - Added `firebase.json` mapping Firestore security rules to `firestore.rules`.
  - Added `.firebaserc` configuring default project binding to `studio-apps-483721`.
  - Added `firebase-tools` local devDependency and standardized `"deploy:rules": "firebase deploy --only firestore:rules"` script in `package.json` for rapid, zero-drift terminal deployments (`npm run deploy:rules`).
  - Synchronized production `firestore.rules` containing fine-grained helper functions (`isAuthenticated()`, `isAdmin()`, `isOwner()`), collection ACLs, and recursive media subcollection rules.
- **User Watchlist System**:
  - Added `watchlist?: string[]` array field to `UserProfile` in `src/types.ts`.
  - Implemented atomic `toggleWatchlistLot(userId, auctionId)` and `fetchUserWatchlist(userId)` service methods in `src/services/auctionService.ts`.
  - Integrated dedicated Watchlist tab into `src/components/UserAccountHubModal.tsx` displaying saved vehicle cards, live anti-snipe countdowns, CAD high bids, and inline removal actions with empty state guidance.
- **Lot-Level Watch & Share Actions**:
  - Moved contextual "Watch" and "Share" action buttons from the global navigation bar (`src/components/Navbar.tsx`) directly into `src/components/AuctionHeader.tsx`.
  - Added interactive "★ Watch" / "★ Watching" state toggling bound to `toggleWatchlistLot()`, along with instant URL clipboard copying ("🔗 Share") with visual toast confirmation.
- **Private Inquiry Serverless Email Proxy**:
  - Extended `/api/send-consignment-email` (`api/send-consignment-email.ts`) to support `type: 'inquiry'`, enabling dual-mode proxying for both vehicle consignments and buyer inquiries.
  - Generates structured HTML table digest emails compiling inquirer contact details, topic, target vehicle title, and pre-formatted message text for Resend dispatch.
  - Connected `src/components/ContactSellerModal.tsx` to dispatch private inquiries with client error isolation and toast feedback.
- **Service Canonical Export**:
  - Added canonical `submitInquiry` export alias for `submitSellerInquiry` in `src/services/auctionService.ts`.
- **Consignment Intake Taxonomy & Location Upgrade**:
  - Integrated 3-tier taxonomy dropdowns (Year, Make, Model, Generation/Chassis) backed by `src/data/vehicleTaxonomy.json` into `src/components/ConsignmentModal.tsx` with unconstrained `TAXONOMY_OTHER_CUSTOM` text fallback inputs.
  - Implemented 3-column structured location inputs (`locationCity`, `locationProvince`, `locationCountry`) with dynamic composite location formatting (`formattedLocation`).
  - Added Option A registered member auto-link detection banner triggered `onBlur` via `checkUserAccountByEmail()`, identifying existing members and attaching `registeredUserId`, `isRegisteredUser: true`, and `registeredUserRole` to consignment application payloads.
- **Serverless Admin Email Dispatcher**:
  - Built Vercel serverless email proxy endpoint `/api/send-consignment-email` (`api/send-consignment-email.ts`) using the Resend API with SendGrid fallback and development mock delivery.
  - Dispatches structured, branded HTML email digests compiling vehicle taxonomy, VIN, mileage, transmission, location, seller contacts, and member status tags (`REGISTERED (SELLER)` / `REGISTERED (BIDDER)` vs `GUEST / UNREGISTERED`) directly to curation staff.
- **Admin Moderation Services & 3-Way Role Selector**:
  - Engineered atomic Firestore moderation services in `src/services/auctionService.ts` executing dual-collection updates across `users` and `bidders`:
    - `updateUserRole(userId, newRole)`: Tri-role switching (`ADMIN` $\leftrightarrow$ `SELLER` $\leftrightarrow$ `BIDDER`).
    - `setUserBannedStatus(userId, isBanned)` / `banOrRemoveBidder()` / `unbanBidder()`: Atomic ban/unban toggling with audit timestamps.
    - `setUserEmailVerified(userId, isVerified)`: Staff manual email verification override.
    - `deleteUserRecord(userId)`: Atomic multi-document purge removing user profiles permanently.
- **1-Click Consignment Approval Draft Conversion**:
  - Added `convertConsignmentToDraftListing()` in `src/services/auctionService.ts`.
  - Automatically provisions a new vehicle document in `auctions/{newAuctionId}` populated with applicant vehicle particulars, structured location, generated title, and parsed CAD reserve defaults.
  - Promotes consignor to `SELLER` role and updates consignment application status to `approved` with `convertedAuctionId`, redirecting administrators straight into `/dashboard/listings/[id]/edit`.
- **Full-Page Admin Operations Portal (`/admin`)**:
  - Implemented `src/components/AdminPortalPage.tsx`, a dedicated full-screen administrative dashboard route gated to `ADMIN` users.
  - Integrated server-assisted paginated search across Bidder Registry (`fetchPaginatedBidders`) and Consignment Applications (`fetchPaginatedConsignments`) with text querying and status filtering pills.
  - Embedded inline moderation controls for instant role switches, ban toggling, email verification, deletion, and draft conversions.
- **Unified User Account Activity Hub (`UserAccountHubModal`)**:
  - Built `src/components/UserAccountHubModal.tsx`, a role-aware personal activity hub accessible to all registered users from the navigation bar.
  - Active bid tracking with real-time `★ LEADING` and `⚠️ OUTBID` telemetry, high bids, and quick "Increase Bid" deep-links.
  - Won auctions overview with 4-stage Canadian offline CAD settlement checklist (1. Bank Wire / Certified Draft, 2. Title & Bill of Sale, 3. Transport / Collection, 4. VIN Check & Key Handover) and direct seller contact credentials.
  - Seller lot telemetry displaying draft and active listings with 1-click workspace launch hooks.
  - Real-time consignment application status tracker (`PENDING`, `APPROVED`, `REVIEWED`, `REJECTED`).
- **Real-Time User Profile Listener**:
  - Implemented `subscribeToUserProfile()` in `src/App.tsx` utilizing a real-time Firestore `onSnapshot` listener on `users/{user.uid}`.
  - Instantly updates local profile state, authorization guards, and navigation privileges across the platform upon role changes without requiring a browser refresh.

### Fixed
- **Navbar Profile Dropdown Positioning Repair**:
  - Resolved right-edge viewport clipping and vertical flex squishing on the user avatar dropdown menu in `src/components/Navbar.tsx`.
  - Encapsulated the avatar trigger button in a dedicated `relative inline-block` wrapper and positioned the floating menu with `absolute right-0 top-full mt-2 w-64 z-50` with high-contrast slate borders, ensuring complete visibility across responsive tablet and desktop viewports.

---

## [1.3.0] - 2026-09-08

### Added
- **3-Tier Dependent Vehicle Taxonomy**:
  - Curated 80+ collector vehicle dataset (`src/data/vehicleTaxonomy.json`) supporting iconic enthusiast marques, models, and generational chassis codes.
  - Built reactive cascading 3-tier selection pipeline (Year $\rightarrow$ Make $\rightarrow$ Model $\rightarrow$ Generation / Chassis Code) in Section 1 of `ListingEditorWorkspace.tsx` and `AdminPanelModal.tsx`.
  - Implemented `TAXONOMY_OTHER_CUSTOM` fallback text inputs for bespoke or unlisted makes, models, and generations.
  - Reordered Section 1 layout placing Year, Make, Model, and Generation at the top row with an "Auto Generate from Year / Make / Model / Gen" listing title generator.
  - Added auto-synchronizing Highlights Tag Badge (`formatHighlightsBadge`) with `isBadgeOverridden` manual override protection.
- **Vercel Serverless Playlist Ingestion**:
  - Implemented `/api/youtube-playlist` serverless proxy endpoint (`api/youtube-playlist.ts`) bypassing browser CORS constraints for 1-click YouTube playlist video chapter auto-import.
  - Added 1-click "Auto-Import Playlist Videos" button in `ListingEditorWorkspace.tsx` and `AdminPanelModal.tsx` via `fetchYouTubePlaylistVideos()` in `src/services/auctionService.ts`.
  - Automatically parses video IDs, clean titles, descriptions, and high-resolution thumbnail images directly into driving chapters from YouTube RSS Atom feeds.
- **Section 7 Native Datetime Pickers**:
  - Interactive calendar trigger icons and native `.showPicker()` modal invocation with dark-mode styling (`[color-scheme:dark]`).
  - Streamlined auction scheduling with instant date calculation shortcuts (`Set to Now`, `+3 Days`, `+7 Days`).

### Changed
- **Cloud Storage Asset Pipeline & Payload Guard**:
  - Direct Firebase Cloud Storage URL asset streaming paired with pre-flight canvas micro-compression (`compressImageDataUrl`).
  - Enforced a strict 900KB serialized document payload cap in `saveMediaConfig()` (`auctionService.ts`), permanently resolving Firestore 1MB (`1,048,576 bytes`) document limit exceptions.
  - Preserved root auction lead hero synchronization (`leadHeroImage`) during batch saves to guarantee zero-latency catalog card resolution.
- **Video Duration UI Clean-Up**:
  - Complete removal of video duration input fields, metadata fields, and timestamp badges across public (`YouTubePlaylistSection.tsx`) and workspace video components (`ListingEditorWorkspace.tsx`, `AdminPanelModal.tsx`).
  - Streamlined video chapter data model to focus strictly on video ID, title, narrative description, embed URL, and high-res thumbnail preview.

## [1.2.1] - 2026-09-07

### Added
- **Firebase Cloud Storage Integration (`uploadImageToStorage`)**:
  - Exported initialized `storage` instance (`getStorage(app)`) in `src/firebase.ts` and `src/services/firebase.ts`.
  - Implemented `uploadImageToStorage(auctionId, dataUrl, folder)` in `src/services/auctionService.ts` to stream uploaded Base64 image payloads directly to Firebase Cloud Storage buckets (`auctions/${targetId}/${folder}/${filename}`).
  - Integrated `uploadImageToStorage` into ingestion pipelines in `AdminPanelModal.tsx` and `ListingEditorWorkspace.tsx`.
  - Replaced multi-megabyte Base64 image strings in Firestore document payloads with lightweight HTTPS download URLs (~120 bytes), reducing `settings/media-${id}` document sizes by 99.3% and permanently solving the 1MB (`1,048,576 bytes`) document size limit error.
- **Root Auction Lead Hero Syncing**:
  - Updated `saveMediaConfig()` and `handleUpdateMediaConfig()` to mirror `leadHeroImage` directly to the root `auctions/{id}` document during master save operations, guaranteeing instant catalog thumbnail resolution across snapshot listeners.
- **Production Firestore & Cloud Storage Security Rules**:
  - Updated `firestore.rules` allowing authenticated write/delete access across `/auctions`, `/settings`, `/bids`, `/comments`, `/consignments`, and `/users`.
  - Configured production Cloud Storage security rules (`service firebase.storage`) providing public read access for vehicle media while restricting write/delete operations to authenticated user sessions (`request.auth != null`).
- **Firestore Recursive Subcollection Security Rules**:
  - Implemented recursive subcollection matching (`match /media/{document=**}`) under `match /auctions/{auctionId}` in `firestore.rules` to support batch writes, reads, and deletions for media configurations.
- **Bulk Purge Engine & Local Cache Sanitization**:
  - Added `purgeAllListings()` in `auctionService.ts` to perform atomic batch deletions across all auctions and media subcollections, clearing localized cache keys (`wailtail_custom_media_${auctionId}`).
  - Integrated "Purge All Catalog Listings (0 Lots)" button in `AdminPanelModal.tsx`.
- **Role-Based Access Controls (RBAC) & Consignment Flow**:
  - Added route protections for `/dashboard/listings/*`, redirecting non-seller and non-admin users to `/` with an error notification.
  - Restricted "Draft Listing Directly →" action in `ConsignmentModal.tsx` strictly to users with `'seller'` or `'admin'` roles.
  - Added consignment review panel in `AdminPanelModal.tsx` with `approveConsignmentAndPromoteSeller()` to promote applicants to `'seller'` role and provision assigned blank draft lots.
- **Neutral Placeholder & Ghost Media Purge**:
  - Purged all hardcoded Unsplash fallback URLs in `HeroMediaCarousel.tsx`. Rendered neutral dark placeholder container (`bg-zinc-900 border border-zinc-800 rounded-xl`) with camera icon and "Media Pending" messaging when `images.length === 0`.
  - Enforced nullish coalescing (`?? ""`, `?? 0`) across all initializers and `useEffect` fallbacks in `ListingEditorWorkspace.tsx`, guaranteeing clean $0 CAD No Reserve defaults on new listings.
- **YouTube Thumbnail URL Sanitization**:
  - Wrapped YouTube video ID extraction with regex validation (`/^[a-zA-Z0-9_-]{11}$/`) in `YouTubePlaylistSection.tsx`. Thumbnails are strictly constructed when valid, avoiding 404 console errors.

### Changed
- **Zero-Lot State Subscription Repair**:
  - Replaced length guards (`if (list && list.length > 0)`) with direct assignment (`setAllAuctions(list || [])` and `setInventory(list || [])`) in `App.tsx` and `AdminPanelModal.tsx`.
  - Updated `VehicleCatalogGrid` props in `App.tsx` to `auctions={allAuctions}` instead of injecting fallback arrays.
- **Optimistic State Hydration**:
  - Implemented optimistic appending (`setAllAuctions(prev => [...prev, newLot])` and `setInventory(prev => [...prev, newLot])`) when creating new lots.
- **Refactor: Predefined Showcase Chapter Schema (Task 4)**:
  - Migrated showcase chapter architecture to a predefined taxonomy (`EXTERIOR`, `POWERTRAIN`, `INTERIOR`, `CHASSIS`, `CUSTOM`) adhering to the strict `ShowcaseChapter` schema in `src/types.ts`.
  - Implemented locked title rules: `EXTERIOR` ("Exterior Highlights"), `POWERTRAIN` ("Powertrain"), `INTERIOR` ("Cabin & Cockpit"), and `CHASSIS` ("Chassis & Suspension") display read-only badges and locked labels; `CUSTOM` provides an editable free-text input.
  - Built `ShowcaseChaptersEditor.tsx` with dynamic chapter re-indexing ("Chapter 01", "Chapter 02"), chapter re-ordering (Move Up / Move Down), and category selection modal with real-time active category counts.
  - Implemented bi-directional normalization (`src/utils/showcaseConverter.ts`) converting transparently between legacy `ShowcaseSection` and `ShowcaseChapter`, ensuring zero regression for existing listings.
  - Updated `InlineShowcaseSection.tsx` to natively render both `ShowcaseChapter` and legacy schemas with category tags, custom highlights, and enlarged photo lightbox triggers.
- **Refactor: Context-Aware Hybrid Spec Cards System (Task 5)**:
  - Designed and implemented `SpecCardCombobox.tsx`, a hybrid searchable Combobox for showcase bottom attribute cards.
  - Provided category-specific preset dictionaries (`CHAPTER_SPEC_PRESETS`) filtering available spec attributes based on the parent chapter (e.g. `Horsepower`, `Displacement`, `Torque` for Powertrain; `Front Suspension`, `Brakes`, `Dampers` for Chassis).
  - Supported on-the-fly custom attribute definitions with an "Add Custom Key..." trigger, correctly flagging `isCustomKey: true`.
  - Fully integrated into `ListingEditorWorkspace.tsx` and the live preview pane, replacing manual text inputs with context-aware selection.
- **Multi-Car Catalog as Primary Homepage (`/`)**:
  - Configured the multi-car Vehicle Auction Catalog view (`/catalog`) as the primary root homepage route (`/`).
  - Updated Wailtail brand logo in `Navbar.tsx` to navigate directly to this catalog homepage.
  - Retained dedicated public auction detail route (`/auctions/[id]`) with seamless one-click return to the catalog homepage.
- **"Sell Your Vehicle" Seller Onboarding CTA & Consignment Flow**:
  - Added prominent "Sell Your Vehicle" CTA in `Navbar.tsx` (amber accent) and catalog banner header.
  - Implemented `ConsignmentModal.tsx` for seller intake inquiries (Year, Make, Model, VIN, Mileage, Reserve expectation, Contact info, and condition notes).
  - Added Firestore persistence for consignment applications (`consignment_applications` collection via `submitConsignmentApplication`).
  - Direct transition action allowing consignors and administrators to launch immediately into the listing creation workspace (`/dashboard/listings/new`).
- **Catalog Hero Image Dynamic Fallback Resolution**:
  - Enhanced `CatalogCard.tsx` / `AuctionCard` with resilient lead photo resolution checking `leadHeroImage` -> `heroImages[0]` -> `DEFAULT_MEDIA_CONFIG.heroImages[0]` -> local storage cache.
  - Completely resolved the issue where cards previously fell back to "Photo Gallery Pending" for lots with hero images configured.
  - Added administrator "Edit" quick action button on individual catalog cards to jump straight into the listing authoring workspace.
- **Strict Fresh Listing Isolation & Empty Placeholder Enforcement**:
  - Updated `createNewListing` in `auctionService.ts` and `ListingEditorWorkspace.tsx` to strictly initialize all text inputs to empty strings (`""`) and media arrays to empty lists (`[]`) for non-main lots.
  - Completely eliminated previous listing text/images (such as 1978 Porsche 911 specs) from leaking into newly created lots, letting grey HTML placeholder text guide the user.

### Fixed
- **0-Lot Baseline & Auto-Seeding Eradication**:
  - Defined and exported `BLANK_MEDIA_CONFIG` in `src/mediaConfig.ts`.
  - Disabled auto-seeding `setDoc` writes in `initializeMediaConfigIfNotExists()`, preventing deleted or missing sample listings (`wailtail-1978-porsche-911`) from auto-recreating sample data in Firestore on page refresh.
  - Resolved `App.tsx` state initializers and listeners to return clean `BLANK_AUCTION` and `BLANK_MEDIA_CONFIG` when `allAuctions` is empty (`[]`).
- **Single-Segment Document Reference Guard**:
  - Added string trimming and fallback guards (`targetAuctionId = auctionId?.trim() || MAIN_AUCTION_ID`) across `updateAuctionConfig()`, `saveMediaConfig()`, and `deleteListing()`, eliminating `FirebaseError: Invalid document reference` path errors on empty auction IDs.
- **Iframe & Attribute Cleanup**:
  - Removed deprecated `web-share;` feature flag from the YouTube player `<iframe>` in `YouTubePlaylistSection.tsx`, suppressing browser console warnings.

## [1.2.0] - 2026-09-04

### Added
- **Public Q&A Seller & Admin Reply System**:
  - Added inline "Reply" action on community questions in `CommentSection.tsx` for logged-in sellers and administrators.
  - Implemented expandable reply composer supporting multiline input, auto-focus, and character counters.
  - Official answers are nested directly beneath the target question, decorated with prominent `SELLER` or `STAFF / ADMIN` badges, distinct dark border accents, and verified timestamps.
- **Multi-Car Public Catalog (`VehicleCatalogGrid`)**:
  - Built full-featured public vehicle catalog component featuring real-time search across make, model, VIN, and location.
  - Added lifecycle filter pills (`All Lots`, `Live`, `Upcoming`, `Ended`) with live lot counters.
  - Dedicated `/catalog` route and interactive "All Auctions" navigation button in `Navbar.tsx` with total lot counter badge.
  - Embedded catalog section on single-car auction pages enabling smooth discovery across the multi-car inventory.
- **Admin "All Vehicle Listings" Inventory Suite**:
  - Added comprehensive inventory view tab in `AdminPanelModal.tsx` displaying all vehicle lots with status badges (`Live`, `Upcoming`, `Ended`), high bids, reserve flags, and dates.
  - Quick action controls: Edit (opens authoring workspace), Duplicate (clones lot into a clean draft copy), Delete (with confirmation dialog), and Set Active.
  - Removed legacy redundant "Create Blank Listing" button in favor of the standardized `+ New Listing` creation modal.
- **Clean Listing Initialization Guarantees**:
  - Initialized all newly created listings with isolated empty image and video arrays, preventing cross-lot contamination or legacy image leaks.
  - Enforced Canadian CAD defaults ($1,000 starting bid, $250 minimum increment, 7-day duration, `status: 'upcoming'`).
- **Sticky Left Stepper Sidebar**:
  - Applied `sticky top-6 self-start max-h-[calc(100vh-3rem)] overflow-y-auto` to the `Listing Sections` vertical stepper sidebar in `ListingEditorWorkspace.tsx`, ensuring smooth scrolling without losing section progress.
- **Multi-Car Auction Architecture & Inventory Management**:
  - Transitioned Wailtail from a single-vehicle auction system to a scalable multi-car auction platform supporting concurrent active and upcoming vehicle inventory drafts.
  - Implemented `subscribeToAllAuctions` and `createNewListing` in `auctionService.ts` to dynamically query and persist multiple distinct vehicle documents in Firestore without overwriting or wiping existing inventory.
  - Added "+ New Listing" workflow prompting administrators for Listing Title / Vehicle Lot Name and automatically generating new vehicle documents populated with clean placeholders and default Canadian CAD financials ($1,000 starting bid, $250 minimum increment, 7-day duration).
  - Added "Select Vehicle Listing" lot selector dropdown in the workspace header bar (`ListingEditorWorkspace`), enabling sellers and administrators to seamlessly switch between different inventory lots.
  - Multi-lot media configuration architecture (`media-${auctionId}`) persisting dedicated media, showcase chapters, and video playlists per vehicle lot.
- **Full-Width Expansion for "Edit Form" View Mode**:
  - Fixed view mode layout constraints: selecting "Edit Form" expands the authoring pane to 100% width (`w-full max-w-6xl mx-auto`), removing the split-screen constraint.
- **Sticky Left Navigation Sidebar**:
  - Applied `sticky top-6 self-start max-h-[calc(100vh-3rem)] overflow-y-auto` to the `Listing Sections` vertical stepper sidebar so it remains permanently anchored in view as administrators scroll through extensive listing forms.
- **Mobile Responsive & Overflow Fixes**:
  - Added horizontal wrapping and responsive badges to `AuctionHeader` and live preview header.
  - Enhanced `HeroMediaCarousel` responsive thumbnail trays and indicators.
  - Added responsive video embeds and chapter timeline stacking to `YouTubePlaylistSection`.
- **Full-Page Authoring Workspace (`ListingEditorWorkspace`)**:
  - Transitioned the listing editor from a modal overlay into a dedicated full-screen authoring route at `/dashboard/listings/[id]/edit`.
  - Split-screen workspace architecture featuring a 60/40 reactive layout with left-pane form authoring controls and a right-pane live public preview.
  - Interactive preview viewport toggle between Desktop (`100%`) and Mobile simulated container views (`390px`).
  - Sticky vertical progress stepper on the left margin (`sticky top-6 z-20`) tracking completion status across all 7 listing sections with color-coded status badges (`Complete`, `In Progress`, `Pending`).
- **100% Feature Parity Restoration Across Sections 4–7**:
  - **Section 4 (Showcase Chapters)**: Restored chapter cards with photo uploader (file upload, gallery modal picker, manual URL), multiline editor for checkmark bullet highlights, dynamic technical spec key-value pills, and chapter reordering/deletion.
  - **Section 5 (Hero Carousel & Full Photo Gallery)**: Restored drag-and-drop & positional hero reordering (`← Left` / `Right →`) with `★ Lead Hero` highlight; categorized gallery with non-clipping category selectors, visible delete actions, and native PDF inspection document rendering.
  - **Section 6 (Videos & Driving Chapters)**: Restored YouTube metadata fetching via OpenGraph/oEmbed, chapter timeline cards with live thumbnail previews, duration timestamps, and chapter management.
  - **Section 7 (Auction Financials & Schedule)**: Restored Canadian Dollar (`CAD $`) financial ledger, lifecycle status dropdown, date/time pickers, and "Simulate Final 2 Minutes" Anti-Sniping test button.
- **Complete Public Live Preview Parity**:
  - Real-time rendering across all sections: Simulated public header with dynamic countdown calculated via `formatAuctionCountdown`, starting/high bid, reserve status pill, and key header specs.
  - Full `HeroMediaCarousel` rendering with interactive lightboxes.
  - Section 2 & 3 Overview Narrative and synchronized "Vehicle Highlights" sidebar card with Zero Buyer Fees banner and Consignor Private Inquiry modal action.
  - Section 4 `InlineShowcaseSection` with photo lightboxes and highlight lists.
  - Section 6 `YouTubePlaylistSection` with video embed and chapter selectors.
  - Section 5 `PhotoGalleryGrid` with categorized filtering and full-screen lightbox modal.
  - Section 7 Financials & Scheduling Summary Card detailing soft-close rules and auction dates.
- **Gallery Photo Picker Modal (`pickerTarget`)**:
  - Added dedicated gallery photo picker modal allowing users to search, filter by category (`all`, `exterior`, `interior`, `engine`, `underbody`, `docs`), and select any photo from existing hero or gallery images to populate the overview photo, showcase chapter photo, or hero slides.
- **Standardized Input Controls & Structured Dropdowns**:
  - Converted free-text year input to a numerical select dropdown spanning 1900 to 2026.
  - Standardized Title & Registration Status dropdown with predefined options: Clean Registration (Default), Rebuilt / Reconstructed, Salvage Title, Irreparable / Parts Only, Lien / Lease Pending, Other / Custom.
  - Standardized Drivetrain / Gearbox dropdown with predefined options: 5-Speed Manual, 6-Speed Manual, 4-Speed Automatic, 5-Speed Automatic, Dual-Clutch / PDK, Sequential, Other.
  - Structured Location fields separating City, Province / State, and Country with Google Places geocoding anchor.
- **JSON Import / Export Feature with `ListingDraftSchema`**:
  - Implemented `ListingDraftSchema` TypeScript interface standardizing all non-media listing fields across Sections 1–4 and 7.
  - "Import JSON" modal with syntax validation, comprehensive key checking, and instantaneous form state hydration across all sections.
  - "Export JSON" action copying active listing parameters formatted as clean, indented `ListingDraftSchema` JSON directly to clipboard with toast notifications.
- **Decoupled Admin Operational Suite**:
  - Decoupled admin operational tools from seller authoring: `AdminPanelModal` is strictly dedicated to host/admin operations (Live Bids Telemetry Log, Bidder Registry Approval & Banning, Winner Settlement, and Site Branding).
  - Prominent "Open Listing Editor →" navigation hooks connecting the owner dashboard and top navigation bar directly into the full-page authoring route.

## [1.1.0] - 2026-09-03

### Added
- **Blank Listing Confirmation Modal Dialog**: Added an in-app confirmation modal triggered by the "Create Blank Listing" button in the admin header ("Reset editor to a blank listing draft? Unsaved changes will be lost.").
- **Clean Blank Draft Reset**: When confirmed, resets all editor state fields across all sections (Vehicle Identity, Overview Narrative, Technical Specs, Showcase Chapters, Media Gallery, and Video Chapters) to clean, empty default values with standardized Canadian CAD financial defaults ($1,000 starting bid, $250 minimum increment, $0 reserve, upcoming status, 7-day auction duration).
- **Single-Source Spec Entry (Section 1 & Section 3 Synchronization)**:
  - Added dedicated `interior` field to Section 1 (Vehicle Identity & Header Specs) and the core `Auction` interface.
  - Automatically mirrors the 8 core vehicle specifications (VIN, Odometer, Engine, Transmission, Exterior Color, Interior, Title Status, and Location) from Section 1 directly into Section 3 (Technical Specifications Table).
  - Eliminates manual double-entry for administrators while maintaining support for appending custom specification rows (e.g. Compression, Differential, Exhaust) with reordering and deletion.
  - Live auto-sync propagates to the public listing's "Vehicle Highlights" right sidebar card.

### Changed
- **Section 5 Photo Card Overlay & Delete Button**:
  - Restyled photo card overlays in Section 5 with an `aspect-[4/3]` container and high-contrast dark gradient overlay.
  - Refactored category select dropdown to prevent clipping or overflow on compact displays, adding a chevron icon indicator.
  - Added a dedicated, high-visibility red 🗑 delete button with hover scaling and active states that is always clickable and never obscured.
- **Button & UI Labels**:
  - Renamed "+ Upload Photos to Gallery" to "+ Upload Photos & Inspection Documents".
  - Updated empty state prompt to reflect both photos and inspection documents.

### Fixed
- Fixed Section 3 specifications array compilation during master save (`handleSaveAll`) to ensure both auto-synced primary specs and custom specs are persisted atomically to Firestore.
- Fixed public sidebar highlights card fallback to use dynamic auction model properties (`auction.engine`, `auction.drivetrain`, `auction.exteriorColor`, `auction.interior`, `auction.titleStatus`, `auction.location`, `auction.sellerName`).
