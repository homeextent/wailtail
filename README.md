# Wailtail — Multi-Car Collector Auction Platform

> An editorial-grade, Bring-a-Trailer inspired multi-car auction platform crafted with React 18, TypeScript, Tailwind CSS, and Firebase Firestore.

---

## Key Highlights

- **Predefined Showcase Chapter Architecture**: Fixed-taxonomy chapter management (`EXTERIOR`, `POWERTRAIN`, `INTERIOR`, `CHASSIS`, and `CUSTOM`) with locked titles for standard categories, dynamic re-indexing ("Chapter 01", "Chapter 02"), and color-coded editorial badging.
- **Context-Aware Hybrid Spec Cards System**: Interactive bottom spec cards featuring a searchable Combobox with category-specific presets (e.g. `Horsepower`, `Transmission` for Powertrain; `Front Suspension`, `Brakes` for Chassis) plus bespoke custom attribute support (`isCustomKey: true`).
- **Multi-Car Inventory Catalog as Homepage**: Browse the full collector vehicle catalog on the primary root route (`/`) or `/catalog` with live search, status filters (Live, Upcoming, Ended), direct navigation to individual vehicle auction pages, and instant return via the header logo.
- **"Sell Your Vehicle" Seller Onboarding CTA & Flow**: Prominent header action launching the Consignment Intake modal with structured vehicle details, reserve expectations, and direct one-click handoff into the Listing Authoring Workspace (`/dashboard/listings/new`).
- **Resilient Catalog Hero Image Resolution**: Multi-tiered fallback mechanism (`leadHeroImage` -> `heroImages[0]` -> `DEFAULT_MEDIA_CONFIG.heroImages[0]` -> `localStorage` cache) ensuring lead vehicle imagery displays consistently across all catalog cards.
- **Strict Fresh Listing Isolation**: Enforces clean empty strings (`""`) and empty image/video arrays (`[]`) for new lots, ensuring grey HTML placeholders guide input without data leakage from previous lots.
- **Admin "All Vehicle Listings" Inventory Suite**: Central management hub in the Owner Control Center to view all lots, inspect status badges, edit in workspace, duplicate drafts, or safely delete lots.
- **Public Q&A Seller & Admin Replies**: Inline response capability on comments allowing verified sellers and administrators to publish official, nested replies with prominent badges.
- **"+ New Listing" Creation Workflow**: Generate new distinct vehicle lots with custom titles, isolated empty image/video arrays, and CAD defaults ($1,000 start, $250 increment, 7-day duration) without overwriting existing inventory.
- **Listing Lot Selector**: Fast vehicle switcher dropdown in the authoring header for toggling between different consignment drafts.
- **Anti-Sniping Engine**: Bids submitted in the final 2 minutes automatically extend the countdown clock by 2 minutes, preventing bot sniping.
- **Canadian Compliance**: Canadian Dollar (`CAD $`) financial ledger with standardized metric distance units (`km`) and flexible imperial toggle (`mi`).
- **Owner & Listing Control Center**: Complete administrative suite for live auctions, including vehicle identity, media, video chapters, and financial controls.
- **Single-Source Spec Entry**: Core vehicle identity fields (VIN, Mileage, Engine, Transmission, Exterior, Interior, Title, Location) automatically sync into the Technical Specifications Table and public "Vehicle Highlights" sidebar, eliminating redundant data entry.
- **Sticky Form Navigation Stepper**: Left margin stepper (`sticky top-6 z-20`) anchored in place with completion status indicators across all 7 sections.
- **Responsive Workspace View Modes**: Split-screen 60/40 mode, expanded 100% full-width "Edit Form" mode, and full-screen "Preview" mode with desktop and mobile (390px) viewports.
- **Visual Hero Carousel Reordering**: Drag-and-drop or positional controls (`← Left` / `Right →`) to curate hero images, with `★ Lead Hero` highlight.
- **Categorized Photo Gallery & Inspection Documents**: Dedicated exterior, interior, engine, underbody, and document categories with non-clipping category selectors, visible delete actions, and native PDF inspection report rendering.
- **Private Consignor Inquiry Flow**: In-app "Contact Consignor" modal for verified buyers and bidders to ask questions directly.

---

## Quick Start & Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Local Development Server
```bash
npm run dev
```
The app runs on port `3000` (required for container routing and nginx reverse proxy).

### 3. Build for Production
```bash
npm run build
```

---

## System Architecture

```
├── src/
│   ├── components/
│   │   ├── VehicleCatalogGrid.tsx     # Grid-based multi-car catalog with search & status filters
│   │   ├── ListingEditorWorkspace.tsx # Full-page authoring workspace (/dashboard/listings/[id]/edit)
│   │   ├── AdminPanelModal.tsx        # Decoupled Host Operational Modal (Bids, Bidders, Settlement)
│   │   ├── HeroMediaCarousel.tsx      # Full-width photo showcase
│   │   ├── PhotoGalleryGrid.tsx       # Categorized photo grid & lightbox
│   │   ├── ShowcaseChaptersEditor.tsx # Curated showcase chapter manager with taxonomy presets
│   │   ├── SpecCardCombobox.tsx       # Context-aware searchable hybrid attribute picker
│   │   ├── InlineShowcaseSection.tsx  # Multi-chapter vehicle narrative & detail cards
│   │   ├── YouTubePlaylistSection.tsx # Video chapters with dynamic metadata fetching
│   │   ├── AuctionHeader.tsx          # Real-time countdown clock & financial badges
│   │   ├── StickyBidBar.tsx           # Floating bid control bar & anti-sniping notices
│   │   ├── Navbar.tsx                 # Header with quick links to Owner & Listing Editor
│   │   ├── ContactSellerModal.tsx     # Consignor private inquiry modal
│   │   └── CommentSection.tsx         # Verified community discussion & seller responses
│   ├── services/
│   │   ├── auctionService.ts          # Firestore CRUD, anti-sniping bid placement, real-time sync
│   │   └── firebase.ts                # Firebase initialization & error handling
│   ├── types.ts                       # Full TypeScript interfaces & ListingDraftSchema
│   ├── App.tsx                        # Primary application shell & workspace route dispatcher
│   └── main.tsx                       # Entry point
├── SYSTEM_BIBLE.md                    # Comprehensive architectural specification
├── CHANGELOG.md                       # Versioned release notes and structural changes
├── firestore.rules                    # Firestore security rules
└── package.json
```

---

## Listing Authoring & Operational Architecture

- **Multi-Car Inventory Workspace (`/dashboard/listings/[id]/edit`)**:
  - **Lot Selector Dropdown**: Switch between any active or upcoming vehicle lot in your catalog instantly from the workspace header.
  - **+ New Listing Creation**: Enter a vehicle lot name to generate a new distinct vehicle document in Firestore (`createNewListing`) with clean placeholders and default CAD financials ($1,000 start, $250 increment, 7-day duration).
  - **Responsive Layout View Modes**: Toggle between 60/40 Split Mode, full-width 100% "Edit Form" mode (`max-w-6xl`), and full-screen "Preview" mode.
  - **Sticky Vertical Stepper**: Anchored left margin navigation (`sticky top-6 z-20`) tracking section completion status (`Complete`, `In Progress`, `Pending`).
  - Viewport switcher toggles between desktop full-width preview and 390px mobile device simulation.
  - 100% feature parity across all 7 listing sections:
    - **Section 1 (Vehicle Identity)**: Standardized Year select (1900–2026), Title & Registration status dropdown, Drivetrain / Gearbox dropdown, structured City / Province / Country location fields.
    - **Section 2 (Overview Narrative)**: Editable heading, multiline prose paragraphs, and featured overview image with local file upload, gallery modal picker, or URL input with lightbox zoom.
    - **Section 3 (Technical Specifications)**: Single-source entry auto-syncing Section 1 fields into the specification table and highlights card, plus custom spec addition, reordering, and deletion.
    - **Section 4 (Showcase Chapters)**: Narrative chapter cards with photo uploader, multiline checkmark bullet points, dynamic key-value spec cards, and chapter reordering.
    - **Section 5 (Hero Carousel & Photo Gallery)**: Drag-and-drop or directional reordering (`← Left` / `Right →`), lead hero badge, categorized gallery with non-clipping category selectors, visible delete actions, and PDF inspection documents.
    - **Section 6 (Videos & Driving Chapters)**: YouTube playlist metadata fetching, driving chapter timeline cards with thumbnail previews, duration timestamps, and chapter management.
    - **Section 7 (Auction Financials & Schedule)**: Canadian Dollar (`CAD $`) starting bid, reserve, minimum increment, lifecycle status, date/time pickers, and Anti-Sniping "Simulate Final 2 Minutes" testing trigger.
  - Real-Time Live Public Preview rendering complete components: `HeroMediaCarousel`, Overview & Highlights Sidebar Card with Zero Buyer Fees banner and Consignor Private Inquiry modal trigger, `InlineShowcaseSection`, `YouTubePlaylistSection`, `PhotoGalleryGrid`, and Auction Financials/Soft-Close Summary Card.
  - Native JSON Import & Export using the standard `ListingDraftSchema`.
- **Decoupled Admin Operational Drawer**:
  - `AdminPanelModal` is reserved for host/admin operations: Live Bids Telemetry Log, Bidder Registry Approval & Banning, Winner Settlement, and Site Branding.
  - Clear navigation links between operational controls and the authoring workspace.

---

## Admin & Listing Control Guide

1. Click the **Admin** button (top navigation bar) to open the **Owner & Listing Control Center**.
2. **Section 1: Vehicle Identity & Header Specs**:
   - Customize listing headline, VIN, and specs.
   - Switch distance unit between `km (CAD)` and `mi`.
   - Update the `highlightsBadge` (e.g. `1978 911`).
3. **Section 5: Media & Gallery**:
   - Upload new hero photos or pick from the existing gallery.
   - Reorder hero images via drag-and-drop or `← Left` / `Right →` buttons.
   - Assign categories on the fly using the inline dropdown on each thumbnail.
   - Upload PDF vehicle inspections or history reports.
4. **Section 7: Auction Dates & Financial Rules**:
   - Set starting bid, reserve price, and minimum increments in CAD.
   - Use high-contrast quick date buttons: **Set to Now**, **+3 Days**, **+7 Days**.
   - Test anti-sniping with **Simulate Final 2 Minutes**.
5. Click **Save All Changes** to atomically persist all updates to Firestore.
6. Use **Create Blank Listing** to generate a clean empty listing template for a new consignment.

---

## Documentation

For full architectural blueprints, Firestore document schemas, and transaction algorithms, refer to [SYSTEM_BIBLE.md](./SYSTEM_BIBLE.md).
