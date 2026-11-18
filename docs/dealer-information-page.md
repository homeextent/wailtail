# Dealer program information page

## Scope

Implemented route: `/dealers` (also accepts a trailing slash), public and shareable without signing in. This provides general program information for prospective Canadian boutique dealers or for an administrator to include in a personal invitation. This change does not send invitations and is not a dealer directory, individual profile, separate dealer-only registration or a new milestone requirement.

The page explains current Phase 1 eligibility, exclusive ownership/no broker inventory, one representative with a verified-email account, separate business verification and vehicle approval, private draft preparation, review/revisions, administrator publication, direct settlement and informational taxes. It states current $0 listing/doc fees and 0% platform commission/buyer premium, without promising approval dates or regulatory endorsement. It explains private records and consent-based contact display, format/size limits, and retention of previously published media copies after withdrawal.

## Application integration

Apply opens the existing combined dealership and vehicle intake form, initialized to Dealer. One vehicle and dealer details are required; this is not a business-only signup. Existing private entry points still default to Private seller. The same form, validation, declarations, terms, authenticated server and manual review pipeline are reused. No automatic role promotion, verification, vehicle approval or publication is added. Opening or reading the page makes no application submission.

The page is selected before mounting the auction application, so it does not poll unrelated auction details/catalog data to explain the program. The Selling on Wailtail guide and footer include dealer links; the standalone header/mobile links are omitted. Standard SPA hosting fallback already supports the route; the isolated harness explicitly serves it. The title identifies the dealer program instead of an auction.

## Review and verification

Local checks: production build/TypeScript, lint and diff review. The existing isolated browser workflow now verifies signed-out catalog discovery, direct page loading/title, 390px layout fit, Dealer radio selection/licence fields, application dialog focus and return after closing, plus trailing-slash navigation. No application is submitted by that new browser coverage.

Jeremy visually/functionally reviewed the page, requested the refinements below, then accepted the combined revision and explicitly approved staging/main promotion. For repeat local review from a clean checkout, with dependencies and Java/emulator prerequisites in the local development guide:

```bash
npm run test:seller-browser
```

Open `http://127.0.0.1:4178/dealers?actor=public`. This is the guarded demo emulator harness, not production. Check desktop and mobile layouts, navigation, FAQ expansion, both Apply buttons, preselected Dealer fields, switching to Private seller, closing/reopening, and legal/selling guidance. Use fictional credentials only if submitting a test in the emulator. On production or a Vercel preview, do not submit sample details merely to review the page: previews do not establish isolated data.

Any Vercel preview is a review artifact, not approval to publish the feature or email dealers. Proposed eventual public sharing URL is `https://www.wailtail.com/dealers`; it must not be represented as live until approved production deployment and verification.

## Owner refinements and privacy URL repair

The offer is described as introductory, without an invented deadline; future platform pricing must be disclosed before listing commitment. The required $0 dealer documentation fee is distinguished from promotional platform prices. Positive selection guidance emphasizes distinctive classics, performance cars, rare specifications and exceptional enthusiast vehicles; curation considers condition/provenance/appeal rather than age alone. No admin invitation button is added: the eventual public /dealers URL is sufficient.

The standalone header/mobile For Dealers links were removed at the owner's request. The Selling on Wailtail guide now links to /dealers, and the footer link remains. The catalog return branch also mounts that existing guide so its header/footer triggers actually render the guide; no unrelated catalog modals were redesigned.

The same PR supplies /privacy-policy/ as static HTML readable without JavaScript, plus /privacy-policy compatibility. A shared JSON policy source feeds both the retained modal and a build-generated HTML document. The HTML is committed for local development and regenerated during build; regression tests reject divergence and unsafe unescaped markup. The policy includes service/provider disclosures, public/private media boundaries, retention and an email request path for access/correction/deletion. This is product disclosure maintenance, not a claim of legal certification or Meta approval.

Explicit Vercel rewrites route the policy before the SPA fallback; the policy namespace is excluded from that fallback and the PWA navigation fallback. Footer policy links are ordinary links. No Meta dashboard changes/submission are performed. After approved production release, verify HTTP 200 and policy content anonymously with and without a crawler user agent, then use Meta's URL debugger and Required actions form. The existing Meta notice identifies November 23, 2026 as its response deadline; do not claim resolution until Meta confirms review.

## Release checkpoint — November 17, 2026

PR #37 accepted head `0e41cac8ba5c0865c427d7fcc18741bf54934df5`, tree `e21449e5cea00061866c9d9de44320698c4cfa27`; exact-head CI run `44214839940` and Vercel passed. Local build/lint and ten focused router/privacy tests passed; full CI included the catalog Selling guide, dealer page/mobile/application and static policy HTTP/body checks. PR #37 merged into staging as `cb76e8355516aebd7a7afa8c791a4bde61503f26`.

Owner explicitly approved staging and main promotion; PR #38 tracks the production release, conditional on final staging/release checks and deployment verification. Do not interpret this source checkpoint as pre-completed production HTTP/browser or Meta approval. Final release SHA, CI/deployment results and live anonymous/crawler checks are recorded in PR #38 once observed.

## Branded badge refinement — proposed

`VerifiedDealerBadge` composes the existing Wailtail whale-tail SVG and styled WAILTAIL wordmark with the contiguous Verified Boutique Dealer label and a small emerald check. Regular and compact sizes share the design. `PublicDealerDisclosure` continues to rely solely on its trusted public `verified` boolean; false/expired/suspended projections retain Dealer-listed vehicle and historical attribution. No new public field, verification check or privilege is introduced. The badge does not assert ownership, mechanical inspection, regulator approval or a guarantee. Existing expanded disclosures remain unchanged.

The dealer information page displays the same badge as an Example credential, with Awarded following manual verification text. It does not confer verification on the visitor. The generic offer-card shield is removed. No exported credential or invitation workflow is added.

Focused rendering tests cover both sizes, missing dealers and current versus historical display. Browser checks verify branded catalog/lot rendering and example qualification while retaining mobile fit and collapsed height ≤270px at a 390px viewport. Owner visual review should inspect both page/catalog sizes, logo clarity, disclosure expansion and the dealer example before merge; use the guarded local harness and fictional data only.
