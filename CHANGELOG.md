# CHANGELOG

All notable changes to the Wailtail Single-Car Collector Auction Platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Documentation — Local development workflow and housekeeping (2026-11-07)

- Recorded PR #3's independently accepted staging merge at `1bf4d6a` and successful post-merge CI/preview; production release, Firebase rules and Storage migration remain separate.
- Documented the active `wailtail-staging` workspace, task-branch/PR workflow, primary-repository dependency, emulator preview and ordinary Vite/API configuration boundary.
- Added verified private-backup and absolute-path worktree move/removal guidance. Recorded the completed retirement of the worker-test and Storage rehearsal worktrees while preserving their history and local artifacts. GitHub branches and PR #2 remain separate.

### Independent audit follow-up — Stage 3 staging security
- Replaced the one-hour notification cutoff with persisted exponential retries, a 23-hour creation-based safety window, 24-attempt cap and transactional two-minute worker claims. Provider payloads/idempotency keys remain stable; exhausted records are retained for reconciliation.
- Reduced catalog/settings polling to 30 seconds while retaining five-second lot updates; hidden tabs suspend requests, refresh on return and clean up on unsubscribe.
- Clarified oversized reset errors and added no-partial-write, browser deletion-error, retired-service and polling lifecycle coverage. Production rules publication, Storage migration and staging merge approval remain separate.


### Security — Auction Security Gate (implementation review)

- Finished the staging legacy-path compatibility implementation: trusted watchlists and bounded own-account activity, atomic private inquiries with server-derived identity and recipients, public branding projection, trusted platform uploads and administrator-scoped legacy notifications. Branding failures now propagate and global settings no longer mutate the selected auction. New drafts read validated CAD defaults.
- Explicitly disabled broad catalog purge, legacy bidder purge, one-click consignment conversion and client-written promotion counters. Inventory draft creation, selected-listing deletion, member moderation and audited bid retraction remain available.
- Expanded acceptance coverage for member privacy, watch retry safety, inquiry persistence/notifications, branding, promotions, member permissions, gallery order, showcase/video continuity and browser controls with reload persistence. Staging merge acceptance uses required CI and preview checks on the exact PR head; production Storage and rules changes remain separate.

- Fixed native Node ESM module resolution in the consolidated API after preview runtime logs exposed extensionless import failures. Added a regression test that compiles and loads all 28 handlers with native Node rather than the development TypeScript loader.

- Consolidated 28 API handlers behind one allowlisted Vercel Function to resolve the Hobby plan deployment rejection. Existing API URLs and per-handler authorization remain in place. Handler source moved to `server/api/`; browser integration uses the same router. Added focused routing, method, credential, scheduler and deployment-layout regression coverage.

- Added ownership-scoped seller draft discovery, trusted narrative and media operations, private previews, submission for review and designated-administrator return to draft.
- Replaced public canonical reads with field projections for catalog, lot media, bid history and comments. Added server-authorized bidding, comment mutations, inventory edits and bounded deletion, atomic bulk statuses, gallery persistence and published image uploads.
- Added audited bid retraction, draft duplication from saved source data and a selected-auction bid reset that preserves unrelated auctions and ordinary comments. Removed client fallback that reported successful duplication after a failed save.
- Moved start, expiry and settlement decisions to server time. Added a bearer-protected worker for unattended transitions and a private notification outbox with Resend dispatch, stable idempotency keys and reconciliation for expired retry windows. Scheduler activation and real email delivery remain deployment acceptance items.
- CI run 42382737880 passed at `36d539d`, covering build, lint, 97 endpoint tests, 133 rules tests, integrated auction workflows and headless Chrome. Routing consolidation requires fresh head-revision CI and a successful Vercel preview. Notification tests use mocked provider responses and simulate both provider failure and failure after provider acceptance.
- PR #3 remains under review for staging. The staging legacy compatibility audit is documented in `docs/stage3-staging-acceptance.md`; deliberately disabled actions are excluded from staging acceptance. Production Storage migration, PDF-token revocation and demo cleanup are outside this PR's execution scope.

### Security — Server-Authorized Administrator Account Deletion (Staging)

- **Implementation commit**: [`860042bc35fcc98246f6385a035fc08d3c84d01f`](https://github.com/homeextent/wailtail/commit/860042bc35fcc98246f6385a035fc08d3c84d01f) hardens `api/admin-delete-user.ts` and the production client service `deleteUserRecord()`.
- **Verified administrator authority**: The endpoint accepts POST only, verifies a Firebase ID token with revocation checking, requires `email_verified === true`, and authorizes only the two designated administrator emails through the shared `src/config/adminConfig.ts` allowlist. Administrator UID/email are derived from the verified token; request-body `adminUid` is not trusted.
- **Deletion safeguards**: Rejects self-deletion and protects both designated administrator accounts by checking the target Auth identity and independently resolving current designated administrator Auth UIDs by allowlisted email. Unexpected lookup failures fail closed.
- **Server-owned cleanup**: The server deletes the target Firebase Auth identity and then cleans direct `users/{uid}` and `bidders/{uid}` documents plus legacy documents with an exact matching `uid` field. Email-only deletion queries are not used. The client sends only `{ uid }` with a Bearer token and has no client-side Firestore fallback.
- **Partial-failure and retry behaviour**: Firebase Auth deletion and Firestore cleanup are not atomic. Query or batch failures return HTTP 500 (`admin/incomplete-deletion`); a retry tolerates an already-absent Auth identity and retries Firestore cleanup. Exact-UID query errors are not swallowed.
- **Regression coverage**: 44 administrator account-deletion tests and 41 approved-consignor endpoint tests (85 combined `npm run test:endpoint` tests); 126 Firestore rules tests. Roo Code reported `npm run lint`, `npx tsc --noEmit`, `npm run build`, endpoint tests, rules tests and `git diff --check` passing before the commit. This is reported local verification, not confirmation of a GitHub Actions run for this commit.
- **Known limitation**: If a designated administrator Auth identity is already absent, lookup by email cannot recover its former UID. Protecting orphaned administrator profile documents in that exceptional state requires stable administrator UIDs in protected server configuration.
- **Release boundary**: Committed and pushed to `staging`; not production-deployed. Auction ownership and mutation authorization remains a separate production security blocker.

### Development & Continuous Integration
- **GitHub Actions CI workflow (`.github/workflows/ci.yml`)**: Added automated validation on pushes to `staging` and `main`, pull requests targeting those branches, and manual workflow dispatch. The job uses Node.js 22 and Java 21, installs dependencies with `npm ci`, then runs the production build/TypeScript checks, ESLint, endpoint tests, and Firestore security rules emulator tests.
- **ESLint configuration and dependencies**: Added the ESLint flat configuration (`eslint.config.js`) and required development dependencies. React Hooks Rules of Hooks violations are enforced; broader lint adoption remains progressive, with selected legacy rules intentionally not enforced yet.
- **React Hooks correction (`src/components/YouTubePlaylistSection.tsx`)**: Moved the conditional early return below the component's hooks to preserve consistent hook invocation order.
- **Optional Resend dependency typing (`api/send-consignment-email.ts`)**: Replaced the suppression directive with a documented `@ts-expect-error`, preserving the optional SDK import and existing HTTP API fallback.
- **Verified staging CI run**: GitHub Actions run [#42092748121](https://github.com/homeextent/wailtail/actions/runs/42092748121) completed successfully for commit [`a28f8b0`](https://github.com/homeextent/wailtail/commit/a28f8b0eaabbaeacd285a2b268212884d4c0bb07). The run passed the production build/TypeScript checks, ESLint, **41 endpoint tests**, and **126 Firestore security rules tests**. This is CI validation evidence for the staging commit, not production deployment or production security sign-off.

### Next Milestone
- **M2.1 — Administrative Consignment Application Review**: PLANNED. Dedicated read-only application detail review, applicant declarations versus verified information, review history, and private administrative notes.

### Planned Milestones
- **M2.2 — Dealer Application and Intake**: PLANNED. Dealer applicant classification, licensing information, authorized representative, exclusive ownership and legal seller-of-record declarations, and appropriate validation.
- **M2.3 — Manual Dealer Verification and Canonical Profile Creation**: PLANNED. Manual administrator verification, canonical `dealer_profiles` creation, verification audit records, expiry/suspension handling, and separation of verification from lot curation.
- **M2.4 — Dealer Vehicle Listing Integration**: PLANNED. Approved dealer attribution, protected `dealerId` assignment, `dealerSnapshot` creation, and integration with existing auction draft and listing workflows.
- **M2.5 — Public Dealer Presentation and Auction Integration**: PLANNED. Public dealer identity, approved dealer badges, privacy-conscious disclosures, conditional phone/website visibility, and dealer-specific social marketing templates.
- **M2.6 — Optional Private Application Photo Uploads**: PLANNED — SEPARATELY GATED. Optional JPEG/PNG/WebP uploads, private Firebase Storage access, applicant/admin authorization, secure transfer into listing workflows, and orphan cleanup. Not a prerequisite for completion of the core dealer program.

---

## 2026-11-05 — Trusted Server-Side Role Authorization (M2.0B Milestone & Security Corrections)

### M2.0B — Trusted Server-Side Role Authorization & Security Corrections

> **Release Status**: VERIFIED ON STAGING (M2.0B Security Corrections A–D Applied). Implemented trusted server-side authorization endpoint `/api/authorize-approved-consignor`, hardened Firestore security rules for canonical `users` and `bidders` collections against self-promotion and self-verification, established Firebase Authentication as the sole email-verification authority, added token revocation verification, removed client-side role elevation (`elevateApprovedConsignor`) and legacy demo self-verification (`manualVerifyForDemo`), and aligned administrator authority to the verified explicit email allowlist. Final recorded coverage: 126 Firestore rules emulator tests and 41 isolated endpoint and authority tests. *M2.0B is verified on staging, not production-approved; documented production security blockers remain unresolved.*

- **Correction A — Firebase Authentication Established as Sole Email-Verification Authority (`src/context/AuthContext.tsx`, `src/config/adminConfig.ts`)**:
  - **Authoritative Identity State**: Redefined `isEmailVerified` as `Boolean(user?.emailVerified)` deriving exclusively from authenticated Firebase user state. Eradicated logic where mutable Firestore profile field `userProfile.isEmailVerified` could substitute for Firebase Authentication verified identity.
  - **Administrative Root of Trust**: `isAdmin` requires all four invariants: (1) Authenticated Firebase user, (2) email present, (3) email matches explicit designated administrator allowlist (`jeremygoodmurphy@gmail.com` or `jeremy@theinnovativegroup.ca`), and (4) Firebase Authentication reports `emailVerified === true`. Evaluated deterministically via centralized `evaluateAdminAuthority()`.
  - **Firebase User Refresh Mechanism**: Integrated `await reload(currentUser)` on auth state change and login hydration when unverified, ensuring auth context does not rely indefinitely on a stale Firebase user object after external verification link confirmation.
  - **Eliminated Privilege Bypass in Sign-In**: Removed fallback to `userProfile.isEmailVerified` in `signInEmail()` and `AuthModal.tsx`; unverified credentials cannot hydrate sessions or bypass verification guards.

- **Correction B — Firestore Rules Hardened Against Self-Verification & Workflow Audit (`firestore.rules`, `src/services/auctionService.ts`)**:
  - **Create Locks on Verification Fields**: Rules for `users/{userId}` and `bidders/{bidderId}` enforce that `isEmailVerified: true` can only be stored if `request.auth.token.email_verified == true` (`isTokenEmailVerified()`). Unverified tokens cannot create documents claiming verified status.
  - **Update Locks on Verification Fields**: Non-admin owners are barred from updating `isEmailVerified` to `true` unless their authenticated Firebase token claim has `email_verified == true`. Legitimate profile updates (`displayName`, `phone`, `updatedAt`) remain functional for unverified users.
  - **Administrative Workflow Audit**: Audited `setUserEmailVerified()` in `src/services/auctionService.ts` and administrator Member Directory toggle in `AdminPortalPage.tsx`. Documented that Firestore `isEmailVerified` is strictly an informational and directory management field that cannot establish authentication trust or privileges.
  - **Disabled Insecure Demo Verification**: Deprecated and disabled `manualVerifyForDemo()` in `AuthContext.tsx`, removing the client-side self-verification bypass and removing the "Instant Demo Verification" button from `AuthModal.tsx` and `BidModal.tsx`.

- **Correction C — Revocation-Aware Token Verification (`api/authorize-approved-consignor.ts`)**:
  - **Token Revocation Check**: Updated Firebase Admin SDK token verification to `auth.verifyIdToken(idToken, true)`, actively verifying whether the token has been revoked.
  - **Graceful Error Handling**: Detects `auth/id-token-revoked` and rejects revoked tokens with HTTP 401 and code `auth/id-token-revoked` without executing any Firestore writes or mutating consignor/auction linkages.

- **Separate Production Blockers Identified**:
  - **Administrator account-deletion blocker (subsequently resolved on staging)**: At the M2.0B review point, `api/admin-delete-user.ts` still accepted caller-supplied `uid` and `adminUid` without server-side token verification. This was subsequently corrected in staging commit `860042bc35fcc98246f6385a035fc08d3c84d01f`; the endpoint is not yet production-deployed. The separate auction ownership and mutation authorization blocker remains open.
  - **Production blocker — auction ownership and mutation authorization**: Firestore auction update/delete rules remain overly permissive; ownership-related fields (`sellerId`, `sellerName`) require strict server-side or rules-level mutation locks to prevent unauthorized lot reassignment.

- **Correction D — Transactional Approval Revalidation & Retry-Safe Results (`api/authorize-approved-consignor.ts`, `tests/authorize-approved-consignor.test.ts`)**:
  - Re-reads candidate approval documents inside the Firestore transaction and proceeds only when a document still exists, remains `approved`, and its normalized seller email matches the verified Firebase token email.
  - Derives auction linkage candidates from the freshly revalidated application records; revoked or changed applications cannot authorize profile promotion or auction assignment.
  - Scopes `linkedAuctions`, `missingAuctions`, and `conflicts` to each transaction callback execution so retries cannot accumulate stale or duplicate response data.
  - Adds regression coverage for revocation in the current `consignment_applications` collection and legacy `consignments` fallback, valid approval, retry result isolation, retry-time revocation, existing auction assignment conflicts, and idempotent authorization.
- **Comprehensive Verification & Regression Testing**:
  - **126 Passing Firestore Rules Tests (`npm run test:rules`)**: 112 baseline M2.0A/M2.0B tests + 14 new tests validating self-verification prevention on create and update across `users` and `bidders`, verified user update allowances, and isolation of admin permissions from unverified allowlisted tokens and profile claims.
  - **41 Passing Isolated Endpoint & Authority Tests (`npm run test:endpoint`)**: Includes token revocation rejection (`checkRevoked: true`), zero writes on revoked/expired/unverified tokens, designated administrator evaluation, transactional approval revalidation for current and legacy application collections, retry-safe result isolation, conflict protection, and idempotency.
  - **Clean Build, Lint & Type Check**: The recorded staging validation passed `npm run lint`, `npx tsc --noEmit`, and `npm run build`. The final Correction D report also records 41 endpoint tests and 126 rules tests passing.

---

## 2026-11-05 — Consignment Security & Persistence Hardening (M2.0A Milestone)

### M2.0A — Consignment Security & Persistence Hardening

> **Release Status**: COMPLETE — PRODUCTION QA PASSED. Implemented, verified with emulator test suite, committed, deployed to production, with Cloud Firestore security rules successfully deployed to GCP project `studio-apps-483721` (`ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e`), and required production QA confirmed on November 5, 2026.

- **Consignment Application Security Hardening (`firestore.rules`)**:
  - **Verified-Email Authorization for Applicant Reads**: Restructured read authorization for consignment documents. Applicants must be authenticated, have a non-null email claim in their Firebase Auth token, have `email_verified == true`, and have their lowercased authenticated email claim match `resource.data.sellerEmail`.
  - **Email-Claim Authorization vs. Client-Supplied Identifiers**: Access authorization is strictly derived from the verified Firebase Auth token email claim (`request.auth.token.email.lower()`), not client-supplied or unverified `registeredUserId` attributes on the document.
  - **Strict Creation Safeguards**: Non-admin application creation requires `status == 'pending'` and strictly denies payloads attempting to set administrator-controlled metadata or protected dealer verification fields (`sellerType`, `dealerId`, `dealerSnapshot`, `dealerDocFee`, `taxHandling`, `taxDisclaimerVersion`, `verifiedAt`, `verifierUid`, `verificationStatus`, `verificationMethod`, `verificationExpiresAt`, `verificationRecordVersion`, `reviewedAt`, `reviewedBy`, `convertedAuctionId`, `updatedAt`, `registeredUserId`, `isRegisteredUser`, `registeredUserRole`).
  - **Permitted Guest Submissions**: Unauthenticated (guest) submissions remain permitted, provided they satisfy the `status == 'pending'` requirement and do not include protected administrative or dealer verification fields.
  - **Non-Admin Modification & Deletion Lock**: Completely locked update and deletion privileges for non-admin users (`allow update, delete: if isAdmin();`). Non-admin callers cannot mutate or delete existing consignment applications.
  - **Full Administrator Access**: Administrators retain full read (including collection-wide queries), create, update, and delete privileges across consignment pipelines.
  - **Matching Protections for Dual Collections**: Identical security rules applied symmetrically across both `consignment_applications` and legacy `consignments` collections.

- **Client Persistence & Dispatch Hardening (`src/services/auctionService.ts`)**:
  - **Normalized Lowercase Seller Email**: Standardized `sellerEmail` normalization (`(app.sellerEmail || '').trim().toLowerCase()`) on new submissions in `submitConsignmentApplication()`, guaranteeing case-insensitive alignment with lowercased auth token email claims.
  - **Primary Persistence Error Propagation**: Primary write to `consignment_applications` propagates errors directly to caller. If the primary write fails, the function aborts and does not generate synthetic or fallback application IDs.
  - **Best-Effort Legacy Dual-Write**: Secondary write to the legacy `consignments` collection executes inside an isolated `try/catch` block as non-fatal best effort, ensuring legacy write failures do not invalidate or roll back successful primary application persistence.
  - **Non-Blocking Notification Processing**: Serverless email notification dispatch (`/api/send-consignment-email`) executes asynchronously post-persistence with a 5000ms timeout guard, ensuring SMTP or edge delivery latency cannot falsely report consignment submission failure to the user.

- **Emulator Security Verification & Build Validation**:
  - **83 Passing Firestore Rules Emulator Unit Tests (`tests/firestore.rules.test.ts`)**: Successfully executed full unit test suite targeting named Firestore database instance `ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e` via `npm run test:rules`.
  - **Test Suite Coverage**: Validated guest application creation, authenticated creation, creation status enforcement, rejection of unauthorized creation metadata (11 administrator/role fields + 12 protected dealer fields across both collections), verified-email applicant read authorization, unverified email read rejection, missing email claim read rejection, unrelated applicant read denial, unscoped query rejection, email-scoped query authorization, administrator full query/document access, non-admin update denial, non-admin delete denial, legacy collection parity, and named database isolation.
  - **Testing Boundaries**: Emulator tests validate rule logic within local emulator suites (`@firebase/rules-unit-testing`) and do not constitute live production penetration testing. Production rules were separately deployed and verified with production QA.
  - **Build Verification**: Verified zero TypeScript or bundling errors via `npm run build`.

- **Milestone Scope & Roadmap Distinction**:
  - Implements the M2.0A Consignment Application Security Hardening scope.
  - At the time of the M2.0A release, M2.0B trusted server-side role authorization remained the next milestone. M2.0B has since been implemented and verified on staging; it is not production-approved while separate security blockers remain unresolved.
  - Milestones M2.1 through M2.5 remain planned.
  - Milestone M2.6 remains planned and separately gated (not a prerequisite for core dealer program completion).

---

## [1.15.0] - 2026-11-04 — Verified Boutique Dealer Foundation (M1 & M1.1 Milestones)

### M1 — Verified Dealer Identity Foundation
- **Dealer Schema & Listing Snapshot Contracts (`src/types.ts`)**:
  - Defined `CanadianProvinceOrTerritory` 13-region union type covering all Canadian provinces and territories (`AB`, `BC`, `MB`, `NB`, `NL`, `NS`, `NT`, `NU`, `ON`, `PE`, `QC`, `SK`, `YT`).
  - Defined canonical `DealerProfile` interface for private dealer records (`legalBusinessName`, `dbaName`, `dealerLicenseNumber`, `licensingJurisdiction`, `primaryRepresentativeUid`, address, phone, website, public visibility toggles, and verification metadata).
  - Defined `DealerListingSnapshot` interface capturing immutable verified dealer attributes attached to vehicle auction documents (`dealerId`, `dealershipName`, `displayName`, `dbaName`, `city`, `province`, `phone`, `website`, `verifiedAt`, `verificationRecordVersion`, `dealerLicenseNumber`, `licensingJurisdiction`).
  - Defined `DealerVerificationAudit` interface tracking administrative verification history.
  - Extended core `Auction` interface with optional dealer properties: `sellerType?: 'private' | 'dealer'`, `dealerId?: string`, `dealerSnapshot?: DealerListingSnapshot`, `dealerDocFee?: 0` (strictly enforced $0 documentation fee), `taxHandling?: 'dealer_collects' | 'buyer_pays_at_registration' | 'requires_confirmation'`, and `taxDisclaimerVersion?: string`.
- **User Profile Dealer Identity Linkage (`src/types.ts`)**:
  - Extended `UserProfile` and `BidderProfile` schemas with optional `dealerId?: string`.
  - Established dealer identity linkage mapping individual user accounts to verified dealer entities. Phase 1 model designates one primary authorized representative per dealer.
- **Consignment Application Dealer Declarations (`src/types.ts`)**:
  - Extended `ConsignmentApplication` interface with dealer applicant declarations: `applicantType?: 'private' | 'dealer'`, `submittedDealershipName?: string`, `dealershipName?: string`, `submittedDealerLicenseNumber?: string`, `dealerLicenseNumber?: string`, `submittedLicensingJurisdiction?: CanadianProvinceOrTerritory`, `licensingJurisdiction?: CanadianProvinceOrTerritory`, `dealershipOwnershipDeclaration?: boolean`, and `legalSellerOfRecordDeclaration?: boolean`.
- **Initial Firestore Security Rules Restrictions (`firestore.rules`)**:
  - Restricted `/dealer_profiles/{dealerId}` to administrative read, create, and update access (`allow read, create, update: if isAdmin();`), with document deletion explicitly forbidden (`allow delete: if false;`).
  - Restricted `/dealer_verification_audits/{auditId}` to administrative read and create access (`allow read, create: if isAdmin();`), with updates and deletions forbidden (`allow update, delete: if false;`).
  - Restricted `/users/{userId}` and `/bidders/{bidderId}` so non-admin users cannot set `dealerId` on creation (`(!('dealerId' in request.resource.data) || isAdmin())`) and cannot modify `dealerId` on update (`!request.resource.data.diff(resource.data).affectedKeys().hasAny(['dealerId'])`).
  - Restricted `/auctions/{auctionId}` create and update rules so non-admin users cannot introduce or modify protected dealer fields (`sellerType`, `dealerId`, `dealerSnapshot`, `dealerDocFee`, `taxHandling`, `taxDisclaimerVersion`).

### M1.1 — Dealer Verification Security Hardening
- **Strict Verification Audit Action and Status Unions (`src/types.ts`)**:
  - Hardened `DealerVerificationAudit.action` from loose string unions to strict union literals: `'verified' | 'rejected' | 'suspended' | 'reviewed' | 'updated'`.
  - Hardened `DealerVerificationAudit.status` to strict union literals: `'pending' | 'verified' | 'rejected' | 'suspended'`.
- **Protection of All Six Trusted Verification Metadata Fields (`firestore.rules`)**:
  - Explicitly hardened Firestore security rules to prohibit non-admin users from creating or mutating all six trusted administrator verification metadata fields across consignment applications:
    1. `verifiedAt`
    2. `verifierUid`
    3. `verificationStatus`
    4. `verificationMethod`
    5. `verificationExpiresAt`
    6. `verificationRecordVersion`
- **Dual Collection Coverage (`firestore.rules`)**:
  - Applied complete protection guards to both active consignment application collections: `match /consignment_applications/{appId}` and `match /consignments/{consignmentId}`.
- **Non-Admin Creation and Modification Lock**:
  - `allow create`: Blocked creation if request data keys contain any of the six verification metadata fields or dealer listing snapshot fields (`sellerType`, `dealerId`, `dealerSnapshot`, `dealerDocFee`, `taxHandling`, `taxDisclaimerVersion`), unless caller is `isAdmin()`.
  - `allow update`: Blocked updates if affected keys contain any applicant declarations (`applicantType`, `dealershipName`, `dealerLicenseNumber`, etc.), dealer listing fields, or the six verification metadata fields, unless caller is `isAdmin()`.
  - Permitted ordinary private seller applications and safe updates (such as notes modifications) to proceed unimpeded.

### Security Verification
- **Temporary Authenticated Non-Admin Security Probe**:
  - Designed and executed a structured client-side security probe (`DealerRulesSecurityProbe.tsx`) in an authenticated non-admin browser session against live Cloud Firestore rules.
- **18 Security Checks Passed (18/18)**:
  - Unauthorized protected-field creation rejected (403 Permission Denied) in both `consignment_applications` and `consignments` (2 checks).
  - Ordinary application creation succeeded for unprivileged authenticated user in both collections (2 checks).
  - Six separate individual update attempts targeting each of the six protected verification fields rejected (403 Permission Denied) in `consignment_applications` (6 checks).
  - Six separate individual update attempts targeting each of the six protected verification fields rejected (403 Permission Denied) in `consignments` (6 checks).
  - Ordinary non-protected updates (modifying `notes`) succeeded in both collections (2 checks).
- **Synthetic Test Record Cleanup**:
  - All synthetic probe records created during validation were cleanly purged immediately following test execution.
- **Probe Teardown & Clean Build**:
  - Temporary probe component and developer routes cleanly unmounted and removed from the codebase.
  - Production TypeScript compilation and Vite build succeeded with zero errors (`npm run build`).
- **Test Limitations & Boundaries (Scope Disclaimer)**:
  - *Tests actually performed*: Authenticated non-admin negative authorization probes and baseline non-admin positive creation/notes-update tests against live Firestore rules in dual collections.
  - *Tests NOT performed (not claimed)*:
    - No Firebase Local Emulator Suite testing was conducted (tested against live project rules).
    - No exhaustive full Firestore rules audit across unrelated collections was performed.
    - Positive admin-write authorization tests for protected fields were not performed in this probe pass.
    - End-to-end consignment intake-to-draft conversion workflows for dealer applications were not executed.
    - M2 dealer application intake UI, verification dashboard, and public dealer showroom badges are not yet implemented.
    - Phase 1 Verified Boutique Dealer initiative is in foundational stage and not fully delivered.

### Production Promotion
- **PR #1 Merged**:
  - Pull Request #1 promoting M1 and M1.1 foundation from `staging` to `main` merged cleanly.
- **Production Merge Commit**:
  - `cbae9be76c339a4eb8b03fa13fcebdfe80353dda`.
- **Staging Synchronization**:
  - `staging` branch synchronized with `main` at the promotion baseline.
- **Vercel Production Deployment**:
  - Vercel production deployment confirmed **Ready** with zero build regressions.
- **Production Smoke Tests Completed**:
  - Homepage catalog, vehicle lot detail page, authentication lifecycle, and consignment submission smoke tests completed successfully in production.
  - Production consignment application test successfully submitted through public intake and verified resident in the Admin Consignment Pipeline (`AdminPortalPage.tsx`).
- **Firestore Rules Deployment**:
  - Cloud Firestore security rules separately deployed to named database instance `ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e` on GCP project `studio-apps-483721`.

---

## [1.14.0] - 2026-11-04 — Seller Social Marketing Kit & Canvas Graphic Generator

### Added
- **Seller Social Marketing Kit (`SocialPromoKitModal.tsx`, `App.tsx`)**: Decoupled modal enabling consignors and administrators to generate high-converting promotional assets for Facebook Groups, forums, Instagram, and social channels. Managed via root global state (`isSocialKitOpen`, `socialKitAuction`) and accessible across multiple application surfaces.
- **Static 4:3 Template Canvas Compositor (`public/social-promo-template-4x3.jpg`)**: High-energy HTML5 Canvas graphic generator ($1200 \times 900\text{ px}$) compositing dynamic vehicle content over a pre-rendered static poster template. Renders Slot 1 (hero angle, top-right) and Slot 2 (detail/cockpit, lower-left) with vibrant orange framing (`#ff5e00`), condensed automotive headline typography (`Impact` / condensed heavy italic), intelligent two-line title wrapping without ellipsis truncation, text drop shadows, and baked Wailtail branding.
- **Campaign Stage Reactivity**: Dynamic stage switcher supporting `Upcoming` (`UPCOMING AUCTION`), `Live Now` (`AUCTION IS LIVE`), and `Ending Soon` (`ENDING SOON`), updating the graphic headline gradient and copy templates in real time.
- **Visual Photo Slot Selector**: Two interactive visual slot cards above the media tray with active selection rings (`Slot 1: Hero Angle`, `Slot 2: Cockpit / Detail`) and quick 1-2 pairing, replacing blind text dropdowns.
- **Enthusiast Copy Generator**: 3 channel-specific copy templates ("Enthusiast Group Deep-Dive", "Marketplace Pitch", "X / Twitter Thread") using an authentic, grounded gearhead tone with itemized vehicle specs, mechanical highlights, and closing admin courtesy notes.
- **Tracked Referral UTM Engine**: Automatically generates canonical campaign URLs (`?utm_source=seller_social&utm_medium=social_kit`) with one-click clipboard copying (`🔗 Copy Link`) and external URL testing (`↗ Test URL`).
- **Multi-Surface Triggers**: Integrated `Social Kit` / `🚀 Social Marketing Kit` action triggers in the Listing Editor Workspace top header, the Seller Activity Hub (`UserAccountHubModal.tsx`), and the Admin Vehicle Inventory table (`AdminPortalPage.tsx`).
- **Google Cloud Storage Bucket CORS Configuration**: Configured cross-origin resource sharing (`Access-Control-Allow-Origin: *`) on `gs://studio-apps-483721.firebasestorage.app` via `cors.json`, enabling browser canvas PNG exports (`handleDownloadGraphic`) without security tainting errors.
- **Phase 2 Roadmap Architecture**: Documented planned multi-format aspect ratios (`social-promo-template-9x16.jpg` for Stories/Reels and `social-promo-template-1x1.jpg` for Square Feed) and seller referral analytics.

---

## [1.13.0] - 2026-11-02 — Platform Trust, Educational Onboarding & Collector Shot Guide

### Added
- **Platform Trust & "How It Works" Modal (`HowItWorksModal.tsx`, `App.tsx`)**: Global tabbed educational modal with dark slate styling (`bg-slate-900 border-slate-700/60`), amber accents, and backdrop blur. Provides dedicated tabs for "Buying on Wailtail" (0% buyer fees in CAD, 2-minute anti-sniping soft closes, Pre-Purchase Inspections), "Selling on Wailtail" (retail enthusiast marketplace vs. wholesale dealer clearinghouses, no 3rd-party inspector bottlenecks, no post-sale green/red light arbitration, direct private-party CAD wire settlement), and "Trust & Security" (zero-tolerance anti-shill defense, verified bidder identities, upfront transparency).
- **Global Educational State & Handlers (`App.tsx`)**: Introduced `isHowItWorksModalOpen: boolean`, `howItWorksTab: 'buying' | 'selling' | 'trust'`, and standardized trigger handler `handleOpenHowItWorks(tab?: 'buying' | 'selling' | 'trust')` hoisted at the root level alongside `LegalModal`.
- **Desktop & Mobile Navigation Triggers (`Navbar.tsx`, `Footer.tsx`)**: Integrated desktop header text trigger (>= 1024px) and mobile slide-out action (< 768px) in `Navbar.tsx`, plus a dedicated footer navigation link in `Footer.tsx`.
- **Contextual Consignment FAQ Accordion (`ConsignmentModal.tsx`)**: Injected "Seller FAQ & Settlement Details" collapsible accordion directly above the clickwrap agreement checkbox and submission button. Addresses top seller friction points (no OMVIC dealer arbitration/middleman, direct 100% cleared funds settlement before vehicle release, consignor-provided photography) with a secondary deep-link trigger to the global selling guide.
- **Collector Photography Guide & Recommended Shot List (`PhotoGuideDrawer.tsx`)**: Built a collapsible helper drawer in Section 5 ("Hero Carousel & Full Photo Gallery") across `ListingEditorWorkspace.tsx` and `AdminPanelModal.tsx`. Details the 5 core visual pillars (Exterior Walkaround [30–40 photos], Cabin & Cockpit [20–30 photos], Powertrain & Mechanical [10–15 photos], Undercarriage & Suspension [15–20 photos], Transparency, Flaws & Paint Depth [10–15 photos]) along with golden hour composition and 45° front wheel alignment pro-tips.

---

## [1.12.0] - 2026-10-31 — Platform Social Metadata Rebrand & Generic Auction Preview Card

### Added
- **Platform Social Preview Card (`public/og-wailtail-platform.jpg`)**: Added `public/og-wailtail-platform.jpg` high-contrast static social preview asset ($1200 \times 630\text{ px}$, 1.91:1 aspect ratio) featuring the dark-slate architectural automotive showcase, smartphone listing UI preview, and platform differentiator badges (0% Buyer Fees, Transparent CAD Bidding, Active Lots, Nationwide Logistics 🇨🇦).

### Changed
- **Platform Open Graph & Twitter Card Rebrand (`index.html`)**: Rebranded static Open Graph and Twitter Card `<meta>` tags in `index.html` from the legacy 1988 Porsche 928 single lot to overarching platform metadata (`Wailtail — Canada's Digital Vehicle Auctions | Buy & Sell in CAD`, 0% buyer fees, AI-powered listing creation, canonical absolute asset URL `https://www.wailtail.com/og-wailtail-platform.jpg`, explicit `og:image:secure_url`, and `og:image:type`).

---

## [1.11.0] - 2026-10-31 — AI Assistant Provenance Engine & Editor UI Consolidation

### Added
- **Structured Provenance Drawers (`AiAssistantModal.tsx`)**: Replaced raw text injection with interactive, tab-navigable accordion drawers for Ownership, Services, Flaws, and Modifications.
- **Collector Disclosure Fields (`AiAssistantModal.tsx`)**: Enriched the AI intake state with dedicated inputs for Odometer Integrity & Cluster Disclosures (TMU), Accident & Insurance Claims, and Known Mechanical Needs to ensure absolute platform transparency.
- **Sticky Provenance Dock (`AiAssistantModal.tsx`)**: Added a `sticky top-0 z-20` dock for guided header pills to prevent UI displacement during vertical scrolling.
- **Step 3 Photo Handoff Guidance (`AiAssistantModal.tsx`)**: Added a post-apply informational callout card and updated toast notifications guiding sellers to Section 5 for high-resolution photo uploads.
- **Hagerty Canada Guidance (`ListingEditorWorkspace.tsx`)**: Added descriptive helper text and a `[🔍 Look up on Hagerty Canada ↗]` quick-link directly beneath the Hagerty input in Section 1, Row 10.

### Changed
- **Master AI Trigger Consolidation (`ListingEditorWorkspace.tsx`)**: Anchored the primary `✨ AI Writing Assistant` button exclusively in the Section 1 card header. Purged redundant triggers from the top navbar, Section 2 header, and Section 4 header to prevent fragmented workflows and destructive overwrites.
- **AI Step 1 Reordering (`AiAssistantModal.tsx`)**: Reordered the intake layout for natural cognitive flow: (1) Vehicle Taxonomy, (2) Seller Notes & Provenance, (3) Multimodal Document Dropzone.

---

## [1.10.0] - 2026-10-30 — Platform Feedback Pipeline, Dynamic Floating Dock & Intake CRO Alignment

### Added
- **Dynamic Admin-Governed Floating Feedback Dock (`src/components/FloatingFeedbackWidget.tsx`)**: Built an ergonomic floating pill button (`FloatingFeedbackWidget`) anchored across all viewports with dark slate backdrop blur styling, hover micro-animations, and dynamic prompt text/badge support.
- **Mobile Bid Bar Collision Avoidance (`src/components/FloatingFeedbackWidget.tsx`)**: Engineered route-aware and viewport-aware collision avoidance that dynamically shifts the widget to `bottom-24 right-4` on single-car lot pages (`/auctions/[id]`), preventing obstruction of the mobile `StickyBidBar.tsx` high-bid indicator and bidding CTA button.
- **Floating Feedback Configuration Schema (`src/types.ts`)**: Defined `FloatingFeedbackConfig` (`enabled`, `label`, `badgeText`) and extended `PlatformPromoSettings` with `feedbackWidget?: FloatingFeedbackConfig;` stored in the `settings/promotions` singleton.
- **Admin Campaign Manager Feedback Controls (`src/components/AdminPortalPage.tsx`)**: Added a dedicated "Floating Feedback & Bug Report Dock" management card in the Promotional & Launch Campaign Manager (`activeTab === 'branding'`) featuring an Emerald/Slate toggle switch and custom label/badge inputs backed by `handleUpdateFeedbackWidget()` and persistent to Firestore.
- **Platform Feedback & Bug Reporting Modal (`src/components/FeedbackModal.tsx`)**: Built a collector-grade dialog supporting 3 feedback categories (`bug`, `suggestion`, `general`), 10–1,500 character counter, and auto-populated member contact credentials with unauthenticated guest support.
- **Automatic Client Diagnostic Capture (`src/components/FeedbackModal.tsx`)**: Integrated zero-friction client telemetry recording the active route URL (`window.location.href`), viewport dimensions (`window.innerWidth x window.innerHeight`), browser User Agent, and user UID/role without requiring manual user input.
- **Cloud Firestore `/feedback` Collection ACL (`firestore.rules`)**: Added security match block permitting public document creation (`allow create: if true;`) while restricting read, update, and deletion permissions strictly to administrators (`allow read, update, delete: if isAdmin();`).
- **Serverless Feedback HTML Email Dispatcher (`api/send-consignment-email.ts`)**: Added `type: 'feedback_report'` proxy support generating a high-contrast dark HTML digest email with dynamic category badges (`BUG / TECHNICAL ISSUE`, `SUGGESTION`, `GENERAL FEEDBACK`), reporter metadata, client diagnostic table, formatted message text, and 1-click `mailto` reply button.
- **Global Footer Trigger (`src/components/Footer.tsx`)**: Added a permanent, compliant "Feedback & Bug Report" action trigger in the footer bottom bar adjacent to Terms and Privacy Policy.

### Changed
- **Top-of-Funnel Conversion Copy Standardization (`src/components/ConsignmentModal.tsx`, `src/components/Footer.tsx`, `src/services/auctionService.ts`)**: Standardized public-facing copy from "Consign" to the Modern Digital Auction model ("Sell a Vehicle", "Sell Your Vehicle", "Vehicle Submission & Listing Application", "Submit Vehicle Application") to reduce seller onboarding friction while preserving legal terminology in Terms of Service and backend curation ledgers.

---

## [1.9.1] - 2026-10-30 — Catalog Grid Promotional Launch Mode & Omnipresent Campaign Injection

### Added
- **Catalog Grid Cadence Launch Mode (`src/types.ts`)**: Documented `cadenceInterval: -1` on `PlatformPromoSettings.cadenceInterval` representing "Launch Mode: Show All Active Cards" (alongside `0` [Low Inventory Only], `6`, `9`, `12` lots) to maximize campaign exposure during startup inventory phases.
- **Admin Portal Launch Mode Cadence Option (`src/components/AdminPortalPage.tsx`)**: Added `<option value={-1}>Show All Active Cards (Launch Mode)</option>` to the Catalog Grid Cadence dropdown in the Promotional & Launch Campaign Manager with clean signed integer parsing (`parseInt(..., 10)`).
- **Omnipresent Grid Promotional Injection Engine (`src/components/VehicleCatalogGrid.tsx`)**: Upgraded promotional injection pipeline with `isLaunchMode = promoSettings?.cadenceInterval === -1`. When active during low inventory (≤ 2 lots), bypasses single-row slot-capping (`slice(0, 3 - auctions.length)`) to inject and wrap all active, audience-matched campaign cards into secondary grid rows; when active on populated catalogs (> 2 lots), evenly interleaves all active promotional cards across inventory rows for 100% impression reach.

---

## [1.9.1] - 2026-10-30 — Bi-Directional Seller Attribution & Member Inventory Ledger

### Added
- **Auction.sellerId Typing (`src/types.ts`)**: Confirmed `sellerId?: string;` on the core `Auction` interface alongside `sellerEmail` and `sellerPhone`.
- **In-Memory Seller Portfolio Resolution (`src/components/AdminPortalPage.tsx`)**: Built `getSellerLots(memberUid, memberEmail)` performing zero-read in-memory filtering against resident inventory state matching `lot.sellerId === memberUid` or normalized `lot.sellerEmail.toLowerCase() === memberEmail.toLowerCase()`.
- **Inventory Table Seller Attribution & Cross-Tab Deep-Linking (`src/components/AdminPortalPage.tsx`)**: Appended clickable seller attribution sub-line (`Seller: ${sellerName || sellerEmail}`) beneath VIN in the SPECIFICATIONS column of the Vehicle Inventory & Lots table that switches `activeTab` to `'bidders'`, seeds the search input with seller credentials, and scrolls into view, with a fallback for unassigned lots (`Seller: Direct / Wailtail`).
- **Member Directory Vehicle Portfolio Ledger (`src/components/AdminPortalPage.tsx`)**: Added interactive `🚗 Lots (${sellerLots.length})` accordion button in member rows beside the bid ledger trigger, backed by independent `expandedSellerLotUids` reactive Set state, expanding an inline vehicle portfolio drawer with thumbnail, vehicle title, VIN, CAD financial metrics, status pills, and direct CTA actions (`Open in Listing Editor →` and `View in Inventory ↗`).

---

## [1.9.0] - 2026-10-29 — AI Listing Writing Assistant & Editorial Synthesis Engine

### Added
- **Vercel Serverless AI Gateway Migration (`api/ai-assistant.ts`)**: Migrated to `gemini-2.5-flash` with a resilient fallback chain (`gemini-flash-latest`, `gemini-2.0-flash`). Configured `maxDuration = 60` and `maxOutputTokens: 8192`.
- **Serverless Payload Expansion (`api/ai-assistant.ts`)**: Configured Vercel edge `bodyParser` to `sizeLimit: '4.5mb'` to support multi-page PDF ingestion without HTTP 413 constraints.
- **Client Canvas Micro-Compression (`src/components/AiAssistantModal.tsx`)**: Automated client-side HTML5 canvas downscaling (max 1200px, 75% quality JPEG) for uploaded document photos, crushing 5MB smartphone snapshots to ~150KB.
- **Cumulative Payload Budgeting (`src/components/AiAssistantModal.tsx`)**: Enforced a strict 3.0MB cumulative limit guard across all AI intake documents to safely clear Vercel's Base64 expansion threshold.
- **3-Tier Vehicle Taxonomy Integration (`src/components/AiAssistantModal.tsx`)**: Replaced free-text AI intake fields with cascading dropdowns (Year, Make, Model, Generation) backed by `src/data/vehicleTaxonomy.json` with `TAXONOMY_OTHER_CUSTOM` text fallbacks and safe draft hydration.

### Changed
- **Vehicle Context UI Repositioning**: Moved "Vehicle Identification & Details" to the permanent top of Step 1, removing conditional unmounting bugs that previously destroyed input state.
- **Intake Dropzone Guidance**: Added an explicit Section 5 Photo Gallery redirection banner to prevent users from uploading oversized vehicle exterior photography to the AI assistant.
- **Gateway HTTP Error Normalization (`src/services/aiService.ts`)**: Hardened fetch interceptors to catch HTTP 413 ("Request Entity Too Large") and 502 gateway errors, preventing unhandled `JSON.parse` exceptions (Unexpected token 'R').

---

## [1.8.0] - 2026-10-29 — Google Analytics 4 (GA4) SPA Telemetry & High-Intent Conversion Pipeline

### Added
- **Google Analytics 4 Global Bootstrap (`index.html`)**: Asynchronous `gtag.js` script bootstrap targeting Measurement ID `G-GQZ2L1RQ9M` initialized with `{ send_page_view: false }` to prevent duplicate, unhydrated landing hits in a single-page application.
- **Typed Telemetry Service Utility (`src/utils/analytics.ts`)**: Built `trackPageView()`, `trackBidPlaced()`, `trackConsignmentSubmitted()`, and `trackProvenanceClick()` with safe window typing, fail-open ad-blocker checks, and `import.meta.env.DEV` routing isolation (diverting local and staging traffic to console debug logs to prevent test inflation of production metrics).
- **Reactive SPA Route Tracking Lifecycle (`src/App.tsx`)**: Bound `trackPageView()` directly beneath `App.tsx`'s centralized `document.title` synchronization `useEffect`, with `authLoading` suppression filtering to ensure real-time lot inspection pageviews capture fully hydrated vehicle titles (e.g., 1988 Porsche 928 S4 — Wailtail) across all navigation transitions.
- **High-Intent Collector Conversion Tracking**:
  - `bid_placed`: Instrumented in `src/components/BidModal.tsx` upon successful bid submission, capturing lot ID, vehicle title, and CAD financial value.
  - `consignment_submitted`: Instrumented in `src/components/ConsignmentModal.tsx` capturing vehicle year, make, and model dimensions on completed intake applications.
  - `provenance_view`: Instrumented in `src/components/AuctionHeader.tsx` and `src/App.tsx` tracking high-intent outbound clicks to external cloud service dossiers and Hagerty Canada market appraisal reports.

---

## [1.7.0] - 2026-10-25 — Provenance Cloud Dossiers, PDF Canvas Overhaul & Pinned Announcements

### Added
- **`serviceRecordsUrl` Property on Auction and ListingDraftSchema (`src/types.ts`)**: Added optional `serviceRecordsUrl?: string;` property on `Auction` and `ListingDraftSchema` interfaces for external service records and provenance documentation.
- **Section 1 Cloud Dossier Authoring Controls (`src/components/ListingEditorWorkspace.tsx`, `src/components/AdminPanelModal.tsx`)**: Authoring inputs in Section 1 (Row 10) for external cloud dossiers (Google Drive, Dropbox, OneDrive) with complete form state hydration, URL protocol sanitization via `formatExternalUrl()`, and JSON import/export roundtripping.
- **Featured Cloud Dossier Card in Gallery Records Tab (`src/components/PhotoGalleryGrid.tsx`)**: Dedicated high-contrast featured card in Section 5 ("Records & Title") with external provider detection (Google Drive, Dropbox, OneDrive, or generic cloud storage) and direct `target="_blank"` external navigation.
- **Public Vehicle Highlights Cloud Dossier Button (`src/App.tsx`)**: Synchronized "Historical Records & Invoices (Cloud Dossier) ↗" button in the public Vehicle Highlights sidebar specs card matching the listing editor preview pane.
- **Client-Side Upload Guards (`src/components/ListingEditorWorkspace.tsx`, `src/components/AdminPanelModal.tsx`)**: Implemented pre-flight file size upload guards enforcing a strict 25MB limit on PDF inspection documents and 20MB limit on raw photo uploads before network transmission.
- **Pinned Comment Metadata & Single-Pin Constraint (`src/types.ts`, `src/services/auctionService.ts`, `src/components/CommentSection.tsx`)**: Extended `Comment` schema with `isPinned?: boolean;`, `pinnedAt?: number;`, and `pinnedBy?: string;`. Enforced single-pinned announcement constraint in Firestore (`pinComment()` atomically unpinning existing pinned comments on the lot) and prioritized sorting lifting pinned announcements to the top of the discussion feed with high-contrast styling and an unpin trigger.
- **Discussion Stream Regex URL Linkifier (`src/components/CommentSection.tsx`)**: Regex linkifier helper (`renderLinkedText`) converting raw HTTP/HTTPS URLs within community comments into secure, clickable hyperlinks (`target="_blank"`, `rel="noopener noreferrer"`).
- **Repository Knowledge Base Sync Post-Commit Hook (`scripts/post-commit`)**: Tracked repository post-commit hook script that mirrors core documentation files (`README.md`, `CHANGELOG.md`, `SYSTEM_BIBLE.md`) and database security rules (`firestore.rules`) to the local Google Drive Knowledge Base ingestion directory (`/home/jeremy/GoogleDrive/06_WEBSITES/WailTail.com/auction`) with non-blocking error tolerance (`2>/dev/null || true`).
- **Knowledge Base Ingestion Pipeline Documentation (`README.md`, `SYSTEM_BIBLE.md`)**: Documented the Git post-commit hook activation workflow (`cp scripts/post-commit .git/hooks/post-commit && chmod +x .git/hooks/post-commit`), the operational distinction between continuous Google Drive syncing and session-frozen Gemini Gem Knowledge Bases, and the clear separation between local Knowledge Base mirroring and live database security rule deployments (`npm run deploy:rules`).

### Changed
- **Top Header Ergonomics (`src/components/AuctionHeader.tsx`)**: Removed the Cloud Dossier button from `AuctionHeader.tsx` LOT ACTIONS to eliminate mobile clutter and preserve above-the-fold bidding telemetry.
- **Lightbox Document Canvas Maximization (`src/components/PhotoGalleryGrid.tsx`, `src/components/ListingEditorWorkspace.tsx`)**: Expanded the PDF inspection report lightbox canvas across `PhotoGalleryGrid.tsx` and `ListingEditorWorkspace.tsx` to `max-w-5xl` / `max-w-6xl` at `h-[78vh]`.
- **Consolidated PDF Utility Toolbar (`src/components/PhotoGalleryGrid.tsx`, `src/components/ListingEditorWorkspace.tsx`)**: Collapsed 4-row vertical header and detached bottom buttons into a single unified horizontal top bar featuring document icon, truncated title, category badge, ghost "Open in New Tab" link, and amber "Download" CTA.
- **Native PDF Viewport Parameters (`src/components/PhotoGalleryGrid.tsx`, `src/components/ListingEditorWorkspace.tsx`)**: Injected `#toolbar=1&navpanes=0&view=FitH` URL parameters into embedded iframe URLs for automatic container width fitting and native browser zoom controls.

### Fixed
- **Gallery Image Picker Aspect Ratio (`src/components/ListingEditorWorkspace.tsx`, `src/components/AdminPanelModal.tsx`)**: Restructured cards in photo picker modals to `aspect-[4/3]` with `object-cover`, eliminating vertical squishing and image distortion.
- **Floating Category Badges & Caption Scrims (`src/components/ListingEditorWorkspace.tsx`, `src/components/AdminPanelModal.tsx`)**: Added floating category badge pills and bottom caption scrim overlays on gallery picker hover states.
- **Filtered Non-Image PDF Documents from Photo Pickers (`src/components/ListingEditorWorkspace.tsx`, `src/components/AdminPanelModal.tsx`)**: Excluded PDF documents from photo picker modals, ensuring only valid image assets can be selected for hero and showcase covers.
- **Category Lightbox Scoping (`src/components/PhotoGalleryGrid.tsx`)**: Scoped photo cycling, thumbnail strip navigation, and counter metrics (Photo X of [subset]) strictly to the active category subset in `PhotoGalleryGrid.tsx`.

---

## [1.6.2] - 2026-10-25 — AuthModal Password Visibility & Backup Infrastructure

### Added
- **AuthModal Password Visibility Toggle (`src/components/AuthModal.tsx`)**: Implementation of the `Eye`/`EyeOff` (`lucide-react`) toggle for password inputs with `tabIndex={-1}` for ergonomic tabbing, dynamic `type="password"|"text"` binding, and automatic hidden-state resets on tab switching and modal closure.
- **Production Backup & Disaster Recovery Posture**: Activation of native Google Cloud safeguards on project `studio-apps-483721`, including 7-day Firestore Point-in-Time Recovery (PITR), 30-day automated daily Firestore backup schedules, and Firebase Cloud Storage Object Versioning (14-day expiration, max 2 versions).
## [1.6.1] - 2026-10-24 — Brand Favicon & Reactive Document Title Synchronization

### Added
- **Brand Favicon Asset (`public/favicon.svg`)**: Extraction of the canonical whale-tail vector path into a standalone high-contrast SVG asset, with a `?v=2` cache-busting query parameter in `index.html`.

### Changed
- **Reactive Route Title Synchronization (`src/App.tsx`)**: Implementation of a dynamic `useEffect` hook to synchronize `document.title` across Catalog (*Wailtail — Curated Collector Car Auctions*), Single Lot Detail (`${year} ${make} ${model} — Wailtail`), Admin Portal, and Listing Editor Workspace views, eliminating the legacy 1988 Porsche 928 hardcoded fallback.

---

## [1.6.0] - 2026-10-24 — Runaway Listing Creation Loop Guard, Consignment Gating & Dual-Slot Promotional Cadence Engine

### Added
- **Configurable Catalog Grid Cadence Schema (`src/types.ts`)**: Added `cadenceInterval?: number;` to `PlatformPromoSettings` supporting admin-configurable catalog grid promotional injection (0, 6, 9, 12 lots) with safe modulo cycling.
- **Dual-Slot Independent Banner Schema & Type Alias (`src/types.ts`)**: Extended `PlatformPromoSettings` with `catalogBanner?: LotHeaderBannerConfig;` and exported `BannerConfig` type alias (`export type BannerConfig = LotHeaderBannerConfig;`), enabling independent announcement banners for both the catalog homepage and direct single lots.
- **Default Persistence & Safe Fallback Hydration (`src/services/auctionService.ts`)**: Added default configurations, persistence, and safe fallback hydration for `cadenceInterval` (defaulting to 6) and `catalogBanner` in `DEFAULT_PROMO_SETTINGS` and `subscribeToPromoSettings()`.
- **Catalog Homepage Announcement Banner Control Suite (`src/components/AdminPortalPage.tsx`)**: Built a dedicated "Catalog Homepage Announcement Banner" management suite under Platform Branding in `AdminPortalPage.tsx` with master toggle, copy inputs, audience segmentation, CTA action routing, and live `'catalog_banner'` click telemetry tracking via `promo_analytics`.
- **Full-Bleed Catalog Homepage Announcement Ribbon (`src/components/VehicleCatalogGrid.tsx`)**: Embedded a full-bleed announcement ribbon pinned flush beneath `Navbar.tsx` featuring an edge-to-edge dark slate container (`bg-slate-900 border-b border-amber-500/20`), inner `max-w-7xl` alignment, warm amber badge/CTA styling, and non-blocking telemetry logging.
- **Listing Editor Fallback Route Guarding (`src/App.tsx`, `src/components/ListingEditorWorkspace.tsx`)**: Engineered safe fallback route guarding redirecting `'new'`, missing, or invalid listing IDs to `/catalog` (or `/admin?tab=inventory` for administrators) accompanied by a high-visibility "Listing lot not found" toast notification.

### Changed
- **Unified Catalog Cadence Injection Pipeline (`src/components/VehicleCatalogGrid.tsx`)**: Transformed catalog in-grid promotional cards from low-inventory fillers into a unified injection pipeline supporting low-inventory row padding ($\le 2$ lots) and populated cadence splicing ($> 2$ lots) at admin-selected intervals (6, 9, 12 lots).
- **Collector Car Design System Alignment (`src/components/VehicleCatalogGrid.tsx`, `src/components/AuctionHeader.tsx`)**: Realigned homepage promotional banner aesthetics to match Wailtail's collector car design system, purging neon emerald tones in favor of slate-900 backdrops and warm amber accents.

### Fixed
- **Runaway Listing Creation Loop (`src/App.tsx`, `src/components/ListingEditorWorkspace.tsx`)**: Eradicated un-guarded programmatic `createNewListing()` `useEffect` invocations on `'new'` / invalid IDs, eliminating the recursive Firestore `onSnapshot` re-render echo that previously spawned 150+ duplicate lots.
- **Consignment Curation Gating Bypass (`src/components/ConsignmentModal.tsx`)**: Purged the "Open Listing Workspace" CTA button and `onLaunchDirectListing` prop, restricting applicants strictly to "Close & Return to Catalog" and enforcing mandatory administrative approval before draft workspace provisioning.
- **Permanent Client-Side Promotional Suppression (`src/components/VehicleCatalogGrid.tsx`, `src/components/AuctionHeader.tsx`)**: Completely eradicated ✕ dismiss buttons, dismissal handlers, and permanent `localStorage` caching (`wailtail_dismissed_promos`, `LOT_HEADER_BANNER_ID`), making campaign visibility 100% deterministic based on admin toggles, audience targeting, and schedule dates.

---

## [1.5.0] - 2026-10-19 — Winning Bidder Settlement Loop Guard & Consignor Credential Pipeline

### Added
- **Consignor Credential Schema Extension (`src/types.ts`)**: Added optional `sellerEmail?: string;` and `sellerPhone?: string;` to `Auction` and `ListingDraftSchema` interfaces.
- **Permanent Session Settlement Mutex (`src/services/auctionService.ts`)**: Introduced module-level `settledAuctionSessionIds = new Set<string>()` to permanently lock lots from recurring settlement passes within an active browser tab session.
- **Hierarchical Consignor Contact Fallback Resolution Chain (`src/services/auctionService.ts`)**: Built 4-tier fallback for consignor credentials (`sellerEmail`: `freshAuction.sellerEmail` → `users/{sellerId}.email` → `consignment_applications.sellerEmail` → `'contact@wailtail.com'`; `sellerPhone`: `freshAuction.sellerPhone` → `users/{sellerId}.phone` → `consignment_applications.sellerPhone` → `undefined`).
- **Consignor Contact Editor Controls (`src/components/ListingEditorWorkspace.tsx`)**: Added Consignor Email (`sellerEmail`) and Consignor Phone (`sellerPhone`) form inputs under Section 1 (Row 9) with telephone digit sanitization (`[^0-9+\-() ]`), full workspace state hydration, and JSON import/export support.
- **Consignment Intake Conversion Mapping (`src/services/auctionService.ts`)**: Mapped `app.sellerEmail` and `app.sellerPhone` to newly created `Auction` drafts in `convertConsignmentToDraftListing()`.

### Changed
- **Database-First Atomic Settlement Sentinel (`src/services/auctionService.ts`)**: Refactored `reconcileAuctionClosureAndNotifyWinner` to execute a Firestore `runTransaction` that reads fresh document state directly from the database (`transaction.get(auctionRef)`) instead of relying on stale in-memory React props. Aborts immediately if `winningEmailSent === true`, and commits `winningEmailSent: true` and terminal status (`sold` / `ended`) atomically before triggering the outbound HTTP fetch to `/api/send-consignment-email`.

### Fixed
- **Winning Bidder Multi-Dispatch Email Storm**: Eliminated the infinite loop where expired lots triggered repeated dispatches on every countdown clock tick due to ephemeral mutex release and stale in-memory props.
- **Clock Interval Reconciler Guard (`src/components/AuctionHeader.tsx`)**: Replaced loose interval tracking with `settledLotsRef = useRef(new Set<string>())`, preventing the 1-second countdown effect from repeatedly invoking status updates and reconciliation passes on expired lots.
- **Unpopulated Consignor Credentials in Settlement Emails**: Fixed schema and state hydration gaps that previously caused the 4-Stage Offline Settlement Checklist to render Seller Email as "Not specified" and Seller Phone as "Not provided".

---

## [1.4.0] - 2026-10-04 — Bidding Concurrency, Transaction Locks & Settlement Email Engine

### Added
- **Transactional Bidding & Settlement Email Notifications (`api/send-consignment-email.ts` & `src/services/auctionService.ts`)**:
  - Implemented `type: 'outbid_notification'` and `type: 'winning_bid_confirmation'` serverless email templates.
  - Built 4-tier winning email resolution fallback chain: `winningBid.bidderEmail` → `users/{bidderId}.email` → `bidders/{bidderId}.email` → `auctionData.highBidderEmail`.
  - Built dual-path bid query in settlement logic evaluating `auctions/{auctionId}/bids` subcollection first with fallback to root `bids`.
  - Integrated manual force-close settlement hooks in `updateAuctionConfig()` and `updateAuctionStatus()`.
- **In-Tab Settlement Mutex & Transaction-Gated Email Dispatch (`src/services/auctionService.ts`)**:
  - Implemented module-level in-tab mutex lock (`inFlightSettlementIds`) to short-circuit duplicate settlement triggers across parallel components.
  - Gated serverless HTTP email `fetch('/api/send-consignment-email')` strictly *after* successful Firestore transaction commits (`winningEmailSent: true`).
- **Bid Modal Confirmation Lock State Machine (`src/components/BidModal.tsx`)**:
  - Explicit step state machine (`step: 'input' | 'submitting' | 'success'`) locking confirmation view and confetti animations until user dismissal.
- **Listing Editor Workspace Navigation (`src/components/ListingEditorWorkspace.tsx`)**:
  - Added high-contrast `← Back to Dashboard` navigation CTA button in the workspace top header bar.
- **Google OAuth Popup Mutex & Rate Limit Error Mapping (`src/context/AuthContext.tsx` & `src/components/AuthModal.tsx`)**:
  - Introduced `isGoogleSigningIn` mutex state lock and mapped `auth/quota-exceeded` errors to clean user banner prompts.
- **Platform Legal Infrastructure & PIPEDA Compliance (`src/components/LegalModal.tsx`, `src/components/Footer.tsx`, `src/App.tsx`)**:
  - Created `LegalModal.tsx` supporting tabbed navigation for Terms of Service (legally binding CAD bids, 0% buyer premium, 3-day direct offline settlement, as-is inspection disclaimers, consignor clean-title warranties) and Privacy Policy (PIPEDA compliance, winner disclosure, FCM token usage).
  - Integrated global state and opener handlers in `App.tsx` (`isLegalModalOpen`, `legalModalTab`).
- **Mandatory Clickwrap Agreement Checkboxes (`src/components/BidModal.tsx`, `src/components/ConsignmentModal.tsx`)**:
  - Integrated un-checked controlled checkboxes requiring explicit agreement to Wailtail Terms of Service and Privacy Policy before submitting bids or consignment inquiries, disabling submission buttons until checked.
- **Footer Overhaul & Legacy Marketplace Integration (`src/components/Footer.tsx`)**:
  - Updated primary copy to reflect curated Canadian classic & enthusiast vehicle auctions, updated national tagline to "Consigning & Bidding Nationwide Across Canada 🇨🇦", and added direct links for Legacy Marketplace ([https://marketplace.wailtail.com](https://marketplace.wailtail.com)), Consign a Vehicle, Terms of Service, and Privacy Policy.
- **SEO-Friendly URL Document Slugs (`src/services/auctionService.ts`)**:
  - Implemented `slugifyTitle()` and `generateShortHash()` in `createNewListing()` to generate human-readable lot document IDs (e.g., `1988-porsche-928-s4-automatic-mtur4abv`).
- **Section 1 Required Field Error Highlighting (`src/components/ListingEditorWorkspace.tsx`)**:
  - Added red error rings (`border-red-500/80`) and text badges (`* VIN Required`, `* Make Required`, etc.) on empty required inputs in Section 1 to resolve seller confusion around the "1 needed" stepper badge.
- **Universal Gearbox Taxonomy (`src/components/ListingEditorWorkspace.tsx`, `src/components/ConsignmentModal.tsx`)**:
  - Standardized transmission choices to a 12-entry universal automotive gearbox taxonomy (4-Speed Manual, Dual-Clutch Automatic (DCT), Sequential / Dog-Leg, Other / Custom Gearbox...) with custom text input surfacing across workspace editors and consignment intake.
- **Automated Real-Time Auction Lifecycle Transitions (`src/utils/formatters.ts`, `src/components/AuctionHeader.tsx`, `src/components/VehicleCatalogGrid.tsx`)**:
  - Implemented `getEffectiveAuctionStatus()` evaluating real-time timestamps against `startTime` and `endTime` to dynamically resolve auction states (`upcoming`, `active`, `ending_soon`, `ended`, `sold`).
  - Refactored `formatAuctionCountdown()` to dynamically trigger status changes without requiring page reloads when `startTime` or `endTime` thresholds are crossed.
  - Added background status reconciliation in `AuctionHeader.tsx` executing `updateAuctionStatus()` when Firestore stored status diverges from real-time effective status.
  - Refactored `VehicleCatalogGrid.tsx` status predicates (`isLive`, `isUpcoming`, `isEnded`) and added a 1-second interval tick to auto-update filter tab counts and lot buckets in real time.
- **Hagerty Canada Valuation Link Integration (`src/types.ts`, `src/utils/formatters.ts`, `src/services/auctionService.ts`, `src/components/ListingEditorWorkspace.tsx`, `src/components/AuctionHeader.tsx`)**:
  - Added optional `hagertyValuationUrl?: string;` property to `Auction` and `ListingDraftSchema` interfaces.
  - Exported `formatExternalUrl(url?: string): string` in `formatters.ts` ensuring case-insensitive `https://` protocol prefixing to prevent browser relative URL path resolution errors.
  - Integrated "Hagerty Canada Valuation Link" text input under Section 1 (Vehicle Identity) in `ListingEditorWorkspace.tsx`, with persistence across workspace save, JSON export (`handleExportJson`), and JSON import (`handleApplyImportJson`).
  - Added conditional high-contrast branded Hagerty® Valuation Report CTA buttons (`TrendingUp` icon, `target="_blank"`, `rel="noopener noreferrer"`) in `AuctionHeader.tsx` and the workspace live preview pane.
- **Static Open Graph & Twitter Card Social Metadata (`index.html`)**:
  - Injected pre-rendered Open Graph (`og:site_name`, `og:type`, `og:title`, `og:description`, `og:url`, `og:image`, `og:image:width`, `og:image:height`, `og:image:alt`) and Twitter Card (`twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`, `twitter:image:alt`) metadata tags into `index.html`.
  - Configured social preview assets pointing directly to canonical domain `https://www.wailtail.com/` and the 1988 Porsche 928 hero photograph hosted on Firebase Cloud Storage (`1200x630` dimensions).
  - Guarantees 100% preview card rendering fidelity for web crawlers and messaging platforms (`facebookexternalhit`, X/Twitterbot, WhatsApp, iMessage) without requiring client-side JavaScript execution or edge server-side rendering (SSR) overhead.
- **Automated Consignment Rejection Email Workflow (`api/send-consignment-email.ts` & `src/services/auctionService.ts`)**:
  - Implemented `type: 'consignment_rejected'` serverless HTML template dispatching `[Wailtail] Consignment Application Update — ${vehicleTitle}` notifications to sellers upon consignment rejection.
  - Added robust seller recipient property fallbacks (`sellerEmail` vs `email`), vehicle taxonomy fallback hydration, and staff/seller notes pass-through.
  - Wired automated, non-blocking single rejection (`updateConsignmentStatus`) and bulk rejection (`batchUpdateConsignmentStatus`) dispatches with error resiliency to prevent rejection UI state blockages.
- **Deep-Link Auth Preservation & Admin Triage Pipeline (`src/App.tsx`, `src/components/AuthModal.tsx`, `src/components/AdminPortalPage.tsx`)**:
  - Engineered `/admin` route guard suspension while `authLoading` resolves, avoiding premature redirect bounces to `/`.
  - Added pending deep-link query parameter preservation via `sessionStorage` key `wailtail_pending_admin_deeplink` (`tab`, `id`, `action`) when unauthenticated users access admin deep-links.
  - Displayed contextual emerald admin authentication banner in `AuthModal.tsx` (`"Admin Authentication Required — Please sign in with an administrator account to review this consignment deep-link."`).
  - Implemented automated triage restoration post-login, routing to `/admin` with preserved parameters, surfacing the triage modal, and sanitizing URL history via `clearUrlParams()`.
- **Seller Workspace Claim Onboarding & Role Elevation (`src/context/AuthContext.tsx` & `src/components/AuthModal.tsx`)**:
  - Integrated approval claim link routing (`action=claim_seller&appId=...&lotId=...&email=...`) targeting `/dashboard/listings/${lotId}/edit`.
  - Added pre-filled registration email, dedicated emerald onboarding banner (`"Seller Onboarding & Listing Claim — Create your Wailtail account or sign in with your approved consignment email..."`), and automatic seller role elevation.
  - Updated `AuthContext.tsx` to automatically elevate verified user claims (`role: 'seller'`) across `users/{uid}` and `bidders/{uid}` in Firestore, linking `sellerId` and `sellerName` to `auctions/{convertedAuctionId}` and updating the consignment application with `sellerId`.
- **Consignment Intake Email Deduplication (`src/services/auctionService.ts` & `src/components/ConsignmentModal.tsx`)**:
  - Removed redundant client-side seller receipt invocations from `ConsignmentModal.tsx`, consolidating intake and acknowledgment into a single-pass serverless execution within `submitConsignmentApplication()`.
  - Added case-insensitive admin recipient deduplication in `api/send-consignment-email.ts` preventing duplicate email deliveries when staff and applicant addresses overlap.
- **Listing Editor Draft Lifecycle Option (`src/components/ListingEditorWorkspace.tsx`)**:
  - Added `'draft'` status to the Section 7 Auction Lifecycle Status select dropdown, enabling administrators and sellers to isolate in-progress listings before publishing to preview, upcoming, or live states.
- **Serverless Admin User Deletion Endpoint (`api/admin-delete-user.ts`)**:
  - Implemented `/api/admin-delete-user` endpoint using the `firebase-admin` SDK with static import and ESM interop resolution (`const firebaseAdmin = (admin as any).default || admin;`) to permanently delete user identities from Firebase Authentication (`admin.auth().deleteUser(uid)`).
  - Integrated private key newline unescaping (`replace(/\\n/g, '\n')`) for environment credentials (`FIREBASE_SERVICE_ACCOUNT_KEY` / `FIREBASE_PRIVATE_KEY`) to prevent ASN.1/OpenSSL parse failures.
  - Added self-deletion protection guards (`cleanUid === cleanAdminUid`) and non-blocking `auth/user-not-found` handling paired with atomic batch purging across `users/{uid}` and `bidders/{uid}` in `src/services/auctionService.ts` (`deleteUserRecord`).
- **Orphaned Auth Session Revocation Guard (`src/context/AuthContext.tsx`)**:
  - Engineered orphaned session revocation guard in `AuthContext.tsx` executing immediate `signOut(auth)` when a user's `users/{uid}` document is missing or deleted in Firestore.
  - Integrated both initial `onAuthStateChanged` hydration verification and a real-time `onSnapshot` profile listener on `users/{uid}`, displaying an instant toast alert (`"This account has been deleted by an administrator."`), clearing user profile state, and redirecting orphaned sessions to `/`.
- **Strict Email Verification Enforcement & Credentialed Status Check (`src/components/AuthModal.tsx` & `src/context/AuthContext.tsx`)**:
  - Added post-signup auto-logout: calling `signOut(auth)` immediately after email/password registration to prevent unverified sessions from auto-authenticating into the platform.
  - Implemented unverified login blocking across `AuthModal.tsx` and `AuthContext.tsx` requiring email confirmation link or staff administrative override (`setUserEmailVerified`) prior to granting platform access.
  - Added credentialed unauthenticated status checks (`checkEmailVerification(email, pass)`) allowing logged-out users to verify confirmation status via credentials and reload session state.
  - Built atomic auto-sync of `isEmailVerified: true` across `users` and `bidders` collections in Firestore upon confirmed verification.
- **Google OAuth Direct State Hydration (`src/context/AuthContext.tsx`)**:
  - Implemented direct state hydration in `signInGoogle()`, removing listener suppression flags and hydrating `user` and `userProfile` UI states instantly without requiring a page refresh.
  - Automatically sets `isEmailVerified: true` for pre-verified Google accounts, enforces ban checks (`profile.isBanned || profile.bannedFromBidding`), and assigns `role: 'admin'` for designated `ADMIN_EMAILS` (or default `bidder` role).
- **Deferred Welcome Email Dispatch (`src/services/auctionService.ts` & `src/context/AuthContext.tsx`)**:
  - Suppressed welcome email dispatch during initial unverified registration, deferring `sendWelcomeBidderEmail()` (`type: 'welcome_bidder'`) to fire strictly upon confirmed email verification (`user.emailVerified || data.isEmailVerified`) or staff manual override (`setUserEmailVerified`) in `/admin`.
  - Deduplicated welcome dispatches via persistent `localStorage` sentinel keys (`wailtail_welcome_sent_${uid}`).
- **Dual-Branded Wailtail HTML Email Templates (`api/send-consignment-email.ts`)**:
  - Implemented dual-branded HTML email templates in `/api/send-consignment-email`:
    - `welcome_bidder`: Comprehensive onboarding email for newly verified bidders detailing transparent CAD bidding, anti-sniping soft closes, zero buyer fees, and catalog exploration links.
    - `consignment_receipt`: Official submission acknowledgment email for seller applicants confirming receipt of their vehicle details, review SLA timelines (1–2 business days), and link to the member dashboard.
- **Dynamic Launch Promotional Subsystem**:
  - Implemented catalog promotional cards for low-inventory grid positions (`VehicleCatalogGrid.tsx`) and direct-lot header banners (`AuctionHeader.tsx`) for deep-linked social traffic.
  - Added dynamic CTA actions (`consignment_modal`, `auth_modal`, `contact_modal`, `external_url`), audience segmentation filters (`all`, `guests_only`, `authenticated_only`), start/expiry date window scheduling, and client dismissal tracking (`wailtail_dismissed_promos`).
- **Promo Card Image Asset Uploader**:
  - Added support for direct image URLs and local file uploads (`imageUrl`, `imageAlt`) in `AdminPortalPage.tsx` with canvas micro-compression and Cloud Storage streaming.
  - Renders responsive top media banners (`aspect-[16/9]`, `object-cover`) on catalog promotional cards matching standard catalog vehicle listings.
- **Decoupled Guest Telemetry Engine (`promo_analytics`)**:
  - Decoupled click tracking from admin settings into `promo_analytics/{promoId}` using atomic `increment(1)` writes, resolving 403 (Forbidden) security errors for unauthenticated guests while keeping `settings/promotions` locked to administrators.
  - Added real-time telemetry listener (`subscribeToPromoAnalytics`) streaming live click counts to admin badges.
- **Admin Campaign Control Suite**:
  - Built real-time promotional campaign editor in `src/components/AdminPortalPage.tsx` under Platform Branding with master switches, live analytics badges, expandable card accordions, and card reordering.
- **Named Firestore Database Binding**:
  - Bound `firebase.json` directly to instance `ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e` for zero-drift terminal deployments via `npm run deploy:rules`.
- **FCM Web Push Notification Subsystem**: Integrated `usePushNotifications.ts` hook with VAPID key configuration (`VITE_FIREBASE_VAPID_KEY`) and interactive outbid alert toggles in `UserAccountHubModal.tsx`.
- **Diagnostic FCM Error State Reporting**: Implemented structured `[FCM Setup]` console tracing and high-visibility monospace diagnostic callout cards in `UserAccountHubModal.tsx` for surfacing raw FCM error codes.
- **Root-Scoped Service Worker (`firebase-messaging-sw.js`)**: Aligned Service Worker registration to root scope (`/`) with explicit `self.registration.showNotification()` handlers for background OS desktop toasts and window focus (`clients.openWindow('/')`).
- **Phase 1 Progressive Web App (PWA) & Offline Workbox Caching**:
  - Integrated `vite-plugin-pwa` in `vite.config.ts` with `registerType: 'autoUpdate'`, standalone web app manifest (`name: 'Wailtail Auctions'`, `short_name: 'Wailtail'`, Slate-900 `#0f172a` theme color, `#020617` background color, 192x192 and 512x512 maskable PWA icons).
  - Configured Workbox runtime caching strategies: `StaleWhileRevalidate` for application scripts, styles, and web workers (30-day cache ceiling, 100 entries); `NetworkFirst` for Firebase Cloud Storage assets, vehicle imagery, and Firestore data queries (3-second network timeout, 7-day cache ceiling, 150 entries).
  - Added native PWA viewport theme tags (`<meta name="theme-color" content="#0f172a" />`) and Apple touch icons (`<link rel="apple-touch-icon" href="/icons/icon-192x192.png" />`) in `index.html`.
- **Firebase Cloud Messaging (FCM) Web Push Infrastructure**:
  - Built background service worker (`public/firebase-messaging-sw.js`) utilizing Firebase v10 compat SDKs (`firebase-app-compat.js`, `firebase-messaging-compat.js`) to listen for `onBackgroundMessage` events.
  - Generates rich native push notifications for live outbid alerts, closing countdown warnings, and auction status changes when the web application is inactive or in the background, with app icon badge (`/icons/icon-192x192.png`), lot tags, and window focus/open navigation handling on `notificationclick`.
  - Engineered `usePushNotifications` custom React hook (`src/hooks/usePushNotifications.ts`) encapsulating VAPID public key token exchange (`getToken`), browser permission status tracking (`NotificationPermission`: `'granted'`, `'denied'`, `'default'`), service worker registration verification, and iOS Safari PWA standalone mode detection (`window.navigator.standalone`).
  - Added atomic Firestore FCM token persistence: synchronizes device push tokens into `users/{uid}.fcmTokens` via `arrayUnion` on permission grant and `arrayRemove` on unsubscription or token deletion.
- **User Account Notification Control Panel**:
  - Integrated dedicated notification preferences panel in `src/components/UserAccountHubModal.tsx`.
  - Added "Enable Live Outbid Alerts" toggle switch with real-time browser permission status badges (`Active`, `Blocked`, `Disabled`).
  - Embedded context-aware installation instructions guiding iOS Safari users to install the PWA via "Add to Home Screen" to unlock Apple Push Notification service (APNs) Web Push capabilities.
- **Mobile Photo Gallery 8-Photo Truncation**:
  - Implemented responsive mobile gallery truncation in `src/components/PhotoGalleryGrid.tsx`: capped initial mobile thumbnail display to an 8-photo grid (2x4) controlled via `isMobileExpanded` state.
  - Added interactive "Show All [X] Photos" / "Collapse Gallery" expansion button for mobile viewports, dramatically reducing mobile DOM weight and scroll fatigue while preserving uninterrupted full-gallery swiping and keyboard/touch navigation within the lightbox modal from any thumbnail.
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
- **Option B Administrative Soft Bid Retraction Engine**:
  - Extended the core `Bid` schema (`src/types.ts`) with audit metadata fields: `status?: 'active' | 'retracted'`, `retractedAt?: number`, `retractionReason?: string`, `retractedBy?: string`, and `retractedByName?: string`.
  - Implemented atomic `retractBid(auctionId, bidId, reason, adminUserId, adminDisplayName)` in `src/services/auctionService.ts` executing inside a Firestore transaction to preserve historical bid records for complete legal audit trails while atomically re-evaluating remaining active bids to recalculate `currentBid`, `bidCount`, `highBidder`, and reserve met status.
  - Added expandable member bid history ledger in `src/components/AdminPortalPage.tsx` under the Bidder Registry tab, enabling administrators to inspect all bids placed by a user, distinguish active vs. retracted bids, and initiate administrative soft retractions with mandatory reason prompts.
- **Human-Readable Admin Identity Resolution**:
  - Added persistence of moderator display names (`retractedByName`) directly onto retracted bid documents alongside `retractedBy` UIDs during retraction transactions.
  - Implemented dynamic fallback resolution via `getAdminIdentifier()` in `src/components/AdminPortalPage.tsx` to resolve raw UIDs to human-readable identities against loaded users and active sessions, rendering transparent moderation attribution across the ledger and retraction modals.
- **Cascading Lot Deletion & Orphaned Bid Moderation Fallback**:
  - Enhanced `deleteListing()` and `batchDeleteAuctions()` in `src/services/auctionService.ts` to perform 400-item chunked batch deletions across auction root documents, child media subcollections, settings, and bid documents, staying well below Firestore's 500-operation ceiling while guaranteeing zero orphaned subcollection records.
  - Built resilient orphaned bid moderation fallback in `src/components/AdminPortalPage.tsx`: if a bid's parent vehicle lot is missing or was deleted prior to cascading cleanup, the interface tags the record with an amber `ORPHANED BID (LOT DELETED)` badge and allows administrators to safely execute soft retractions on the orphaned bid without throwing missing parent document errors.

### Changed
- **Firestore Welcome Email Sentinel (`src/services/auctionService.ts` & `src/context/AuthContext.tsx`)**:
  - Moved `welcomeEmailSent: true` sentinel flag directly onto Firestore user profiles (`users/{uid}` and `bidders/{uid}`).
- **Firestore Outbox Queue Security Rules (`firestore.rules`)**:
  - Updated security rules for `/mail/{mailId}`, `/emails/{emailId}`, and `/emailLogs/{logId}` to permit public creation (`allow create: if true;`).
- **Starting Bid Financial Logic & First Bid Calculations (`src/services/auctionService.ts`, `src/components/BidModal.tsx`, `src/components/AuctionHeader.tsx`, `src/components/StickyBidBar.tsx`)**:
  - Synchronized `currentBid` to `startingBid` when `bidCount === 0`.
  - Calculated minimum required bid as `startingBid` (instead of `startingBid + increment`) for zero-bid listings, labeled opening bids as "Starting Bid" / "Opening Bid", and fixed hardcoded modal title to render dynamic `auction.title`.
- **Inline Auto-Generate Title Trigger (`src/components/ListingEditorWorkspace.tsx`)**:
  - Relocated ⚡ Auto-generate from Specs button directly inline adjacent to the "Listing Title" label text.
- **Strict Input Sanitization (`src/components/ConsignmentModal.tsx`, `src/components/ListingEditorWorkspace.tsx`)**:
  - Restricted Odometer Reading inputs to numeric digits (`[^0-9]`) and Phone Number inputs to valid telephone characters (`[^0-9+\-() ]`).
- **Admin Portal "Member Directory" Tab & Header Rename**:
  - Renamed Admin Portal "Bidder Registry" tab and section headers in `src/components/AdminPortalPage.tsx` to "Member Directory" / "Member Directory Management".
  - Preserved role dropdown filter (`ALL`, `ADMIN`, `SELLER`, `BIDDER`) while updating navigation and header terminology to represent universal platform membership.

### Fixed
- **Instantaneous Bid Modal Reset Glitch**: Locked bid success view and confetti graphics until explicitly dismissed.
- **Transient Bidding Concurrency Delays & Error Translation**: Wrapped `placeBidWithAntiSnipe()` in a fast 3-pass exponential backoff retry loop (50ms, 150ms, 300ms) with clean user error translation.
- **Expired Auction Catalog Disappearance & Terminal Status Lock**: Enforced strict terminal status rules in `updateAuctionStatus()` and `reconcileAuctionClosureAndNotifyWinner()`.
- **Background Ticker Document Contention**: Suppressed redundant background `updateAuctionStatus()` writes when status values match.
- **Showcase Chapter Lightbox Isolation (`src/components/InlineShowcaseSection.tsx`)**:
  - Isolated showcase chapter photo lightboxes into a self-contained modal state (`activeLightboxPhoto`), allowing directly uploaded chapter images (outside `fullGallery`) to enlarge cleanly with caption and title presentation, backdrop blur, Escape key dismissal, and window scroll locking.
- **Parent Gallery Index Safeguard (`src/App.tsx`)**:
  - Updated `handleOpenLightboxByUrl()` to verify `idx !== -1` before opening the primary `PhotoGalleryGrid` lightbox, suppressing accidental gallery resets to photo index 0 when clicking isolated chapter images.
- **Role-Gated Editor Header Tools & Lifecycle Overrides (`src/components/ListingEditorWorkspace.tsx`)**:
  - Gated administrative controls (Import JSON, Export JSON, + New Listing) and manual status overrides (Ended - Manual Force Close, Sold - Settled Offline) behind `isAdmin` check, restricting non-admin sellers to Draft and Scheduled / Live (Automated Clock).
- **Legacy Porsche Fallback String Purge (`src/components/ListingEditorWorkspace.tsx`, `src/components/AuctionHeader.tsx`, `src/components/StickyBidBar.tsx`)**:
  - Stripped hardcoded demo fallback strings (`9118200142`, `126,200 km`, `Guards Red`, `3.0L Flat-Six CIS`) across live preview and public components so unentered fields render cleanly as '—'.
- **Unvetted Draft Workspace Consignment Bypass (`src/components/ConsignmentModal.tsx`)**:
  - Purged the "Ready to draft your listing right now?" bypass card, enforcing mandatory admin approval before listing draft provisioning.
- **Seller Lot Selection Filtering (`src/components/ListingEditorWorkspace.tsx`)**:
  - Derived `visibleAuctions` filtering the header lot selector dropdown to show only listings owned by the logged-in seller account (`lot.sellerId === user.uid || lot.sellerEmail === user.email`).
- **Sticky Stepper Positioning in Listing Editor Workspace (`src/components/ListingEditorWorkspace.tsx`)**:
  - Adjusted sticky stepper container CSS to `sticky top-16 max-h-[calc(100vh-4.5rem)]` and removed clipping `overflow-hidden` classes on parent wrappers, ensuring the LISTING SECTIONS sidebar remains pinned below the header during scrolling.
- **FCM Console Cleanup**: Stripped verbose `[FCM Setup]` informational logs from `src/hooks/usePushNotifications.ts` to maintain clean browser console diagnostics while preserving actionable error warnings.
- **Firestore FCM Token Persistence Failure**: Replaced `updateDoc` with `setDoc(..., { merge: true })` in `usePushNotifications.ts` to prevent document-missing exceptions when saving tokens.
- **Service Worker Subscription Race Condition**: Added `await navigator.serviceWorker.ready` prior to `getToken()` execution, ensuring the worker is fully active before push subscription attempts.
- **Hero Lightbox Dataset Isolation & Index Alignment**:
  - Scoped hero lightbox state in `src/components/HeroMediaCarousel.tsx` strictly to `heroImages` (`validImages` / `safeImages`), resolving critical index mismatch bugs where clicking hero carousel slides triggered the full categorized photo gallery lightbox modal instead of the focused hero sequence.
  - Added self-contained keyboard navigation (`Escape`, `ArrowLeft`, `ArrowRight`), touch swipe gesture support (`onTouchStart`, `onTouchEnd`), and modal zoom toggling directly inside `HeroMediaCarousel.tsx`.
- **Mobile Hero Viewport Overlay Cleanup & CTA Relocation**:
  - Cleared obtrusive mobile hero overlays on `src/components/HeroMediaCarousel.tsx`: hidden the "Fullscreen Lightbox" button (`hidden sm:flex`) and bottom photo count indicator bar (`hidden sm:block`) on mobile viewports.
  - Relocated mobile "Watch Video Playlist" CTA button directly beneath the horizontal hero thumbnail strip (`sm:hidden`), eliminating viewport clutter and thumb-tap obstruction on compact screens.
- **Canonical ListingDraftSchema JSON Export**:
  - Standardized JSON export formatting in `src/components/ListingEditorWorkspace.tsx` (`handleExportJson`) to adhere strictly to the canonical `ListingDraftSchema`.
  - Stripped deprecated legacy keys (`featureBullets`, `bottomAttributeCards`) from exported showcase chapters in favor of canonical keys (`category`, `narrative`, `highlights`, `specCards`), ensuring full round-trip import/export compatibility and eliminating schema mismatch errors.
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
