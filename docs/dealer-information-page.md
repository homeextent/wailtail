# Dealer program information page

## Scope

Proposed route: `/dealers` (also accepts a trailing slash), public and shareable without signing in. This provides general program information for prospective Canadian boutique dealers or for an administrator to include in a personal invitation. This change does not send invitations and is not a dealer directory, individual profile, separate dealer-only registration or a new milestone requirement.

The page explains current Phase 1 eligibility, exclusive ownership/no broker inventory, one representative with a verified-email account, separate business verification and vehicle approval, private draft preparation, review/revisions, administrator publication, direct settlement and informational taxes. It states current $0 listing/doc fees and 0% platform commission/buyer premium, without promising approval dates or regulatory endorsement. It explains private records and consent-based contact display, format/size limits, and retention of previously published media copies after withdrawal.

## Application integration

Apply opens the existing combined dealership and vehicle intake form, initialized to Dealer. One vehicle and dealer details are required; this is not a business-only signup. Existing private entry points still default to Private seller. The same form, validation, declarations, terms, authenticated server and manual review pipeline are reused. No automatic role promotion, verification, vehicle approval or publication is added. Opening or reading the page makes no application submission.

The page is selected before mounting the auction application, so it does not poll unrelated auction details/catalog data to explain the program. Public navigation and footer include For Dealers links. Standard SPA hosting fallback already supports the route; the isolated harness explicitly serves it. The title identifies the dealer program instead of an auction.

## Review and verification

Local checks: production build/TypeScript, lint and diff review. The existing isolated browser workflow now verifies signed-out catalog discovery, direct page loading/title, 390px layout fit, Dealer radio selection/licence fields, application dialog focus and return after closing, plus trailing-slash navigation. No application is submitted by that new browser coverage.

Owner visual/functional review is required before merge. From a clean checkout of the proposed feature branch, with dependencies and Java/emulator prerequisites in the local development guide:

```bash
npm run test:seller-browser
```

Open `http://127.0.0.1:4178/dealers?actor=public`. This is the guarded demo emulator harness, not production. Check desktop and mobile layouts, navigation, FAQ expansion, both Apply buttons, preselected Dealer fields, switching to Private seller, closing/reopening, and legal/selling guidance. Use fictional credentials only if submitting a test in the emulator. On production or a Vercel preview, do not submit sample details merely to review the page: previews do not establish isolated data.

Any Vercel preview is a review artifact, not approval to publish the feature or email dealers. Proposed eventual public sharing URL is `https://www.wailtail.com/dealers`; it must not be represented as live until approved production deployment and verification.
