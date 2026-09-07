# CHANGELOG

All notable changes to the Wailtail Single-Car Collector Auction Platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased] - 2026-09-07

### Added
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
