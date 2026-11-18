# M2.7 — Returning-dealer vehicle submissions

Status: **PLANNED — owner-approved scope, November 18, 2026; implementation and acceptance outstanding.** This is a core Phase 1 readiness requirement before the genuine Founding Dealer Pilot. It supplements the original M2.1–M2.5 definitions; their deployed functionality remains recorded accurately. M2.6 optional initial-application photos remain independently deferred.

## Problem and intended behavior

A currently verified representative encounters the first-time combined dealer/vehicle form again. The existing verification profile is bound to its originating case; duplicate identities and conflicting case associations are rejected. Repeating onboarding is not a supported second-vehicle workflow. This is a business-workflow gap, not merely a missing button.

Provide **Submit another vehicle** from My Vehicle Listings and route existing vehicle submission entry points to the same returning-dealer experience when the authenticated account is eligible. Resolve the canonical dealership from trusted account links and representative UID on the server. Display a read-only business summary; do not require re-entry of business/licence details or create a duplicate profile or verification case. Collect a fresh vehicle application, current terms acceptance and all vehicle-specific exclusive ownership/seller-of-record/no-pass-through declarations. Each vehicle retains separate curator approval, draft creation, restricted authoring, submission and administrator publication.

## Security and lifecycle contract

- Keep Bidder/Seller/Admin roles unchanged. Dealer submission authority comes from the canonical affiliation, representative UID and current verification, not role promotion or client-supplied identity.
- Design and validate a supported application-to-existing-profile association. Do not bypass the originating-case, duplicate-identity, revision, idempotency or audit protections to reuse a profile.
- Recheck canonical verification and expiry on trusted submission and mutation operations; never rely on a cached badge or business summary. Expiry/suspension during an open form or concurrent administrator action must fail safely without an unauthorized application, draft or partial association.
- Expired or suspended representatives see a clear status and administrator-review path. Block new dealer vehicle submissions and dealer authoring/submission actions that require current verification. Administrators retain their existing authorized management operations. Renewal/restoration must reuse the same profile and existing vehicle links.
- Preserve immutable per-listing attribution, CAD $0 dealer documentation fees, confirmed tax handling, private drafts/media, assigned-UID access, protected fields and individual vehicle review. Do not automatically publish, delete or reassign existing lots when verification changes. Preserve existing public historical attribution and suppression of current credentials/contacts.
- No multi-seat access, bulk imports, self-service business identity changes, payment integration, optional initial-application uploads or bidding redesign is included. No new cloud data/rules changes are authorized by this planning document.

## Required acceptance evidence

| Scenario | Required result |
|---|---|
| One current dealership submits vehicles A and B | One canonical dealership/representative; two distinct canonical vehicle applications and independently approved drafts; no repeated business onboarding. |
| Manage A and B | Both appear in the representative portfolio; independent narrative/media persistence after refresh; saving, submitting or reviewing one never changes the other. |
| Individual vehicle curation | Approval of A does not approve B; submitted listings remain read-only to the representative; publication stays an explicit administrator action. |
| Expiry before or during submission/editing | Current eligibility is rechecked server-side; prohibited writes fail clearly without partial records; existing drafts and attribution remain intact. |
| Suspension before or during submission/editing | Same fail-safe boundary; status is distinct from expiry; another dealership/account cannot act on either vehicle. |
| Renewal/restoration | After explicit authorized administrator action, eligible operations resume against the original profile and vehicle links, without duplicate profiles/lots. |
| Tampering, retries and concurrency | Reject forged dealer/representative IDs, protected-field edits and unrelated-account access; retries do not duplicate applications/drafts; concurrent status changes cannot bypass eligibility. |
| Public and private boundaries | Drafts/private media stay inaccessible anonymously; current badges/contacts follow existing canonical verification rules; historical attribution survives expiry/suspension. |

Validate with meaningful endpoint/transaction, rules and emulator/browser checks, including two simultaneous vehicle drafts and refresh persistence. Obtain owner local visual/functional acceptance before staging merge; record exact-head CI and separately authorized production deployment/controlled QA. Use synthetic emulator data first. The existing fictional Jaguar must remain Draft/unpublished and is not authorization for a live second application or publication. Fictional acceptance does not satisfy the genuine 3–5 dealership pilot or its six KPIs.
