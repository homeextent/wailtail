# M2.5 public dealer presentation and auction integration

Implemented from accepted staging `4a55362` (M2.4 / PR #9). Exact-head CI and Jeremy's local visual/functional review remain required before explicit staging merge approval. No production promotion, live Firebase publication or migration is included.

## Public contract

The existing public-auctions API returns a dedicated `publicDealer` summary only for well-formed dealer-attributed public lots with canonical M2.4 conversion provenance. Legacy snapshots without that provenance do not establish creation-time contact consent and receive no inferred summary/badge. Catalog and detail share the same projection. Allowed fields are display name, dealership city/province, current verification boolean, CAD $0 dealer documentation fee, known-version informational tax arrangement and permitted business contacts. Raw snapshots, dealer IDs, representative identity, licences/jurisdiction, street/postal addresses, evidence, audits and application provenance are excluded. Existing authenticated own-seller-ID behavior is unchanged.

Identity/location come from the creation-time M2.4 snapshot, not later profile edits. A current canonical profile must be verified, unexpired at server time and assigned to the listing representative before the summary asserts current verification. Missing/unavailable profiles, suspension, expiry or representative mismatch fail closed for badges and contacts; historical attribution remains, without hiding the auction or altering bidding/settlement. Profiles are deduplicated and batch-read per response; no cross-request verification cache is introduced. Responses remain no-store. Public screens use the existing polling cadence; a previously delivered response or exported image cannot be remotely revoked.

Contact display requires both a snapshot contact (captured with creation-time opt-in) and current explicit opt-in for that same value. Changed profile values do not replace old contacts or republish an unmatched old value. Phone links accept bounded telephone characters; websites require HTTPS with no embedded credentials. Missing/malformed contacts are omitted.

## Presentation

Catalog cards show a compact badge or historical dealer attribution. Lot headers show dealership location separately from vehicle location, fee/tax wording, permitted business links and WAILTAIL's verification limitations. Verification describes manual business/representative review and recorded exclusive-ownership declarations; it does not promise regulatory endorsement, condition inspection or a guarantee. Unknown tax/version values show a confirmation-required explanation rather than an invented arrangement. Tax remains informational; no calculation/collection is implemented.

Social-kit dealer copy and graphics use the public summary, never raw private profiles/snapshots. Dealer copy avoids personal ownership/service-history claims and directs readers to actual lot status. Missing public eligibility yields generic dealer inventory without verified claims. The modal refreshes the summary, and copy/export fetch current public data again. Existing private-seller templates remain unchanged. Downloaded/copied content is a point-in-time artifact; no automatic posting or later remote editing is possible.

## Acceptance

Tests cover field privacy, malformed/private records, profile failures, expiry/suspension/representative mismatch, revoked consent, changed/missing contacts, unsafe URLs, known tax versions and dealer promotional wording. Real-app browser checks cover catalog/lot disclosures, permitted links, absence of sensitive data and dealer social copy, alongside prior M2.1–M2.4 flows. Required CI remains build, lint, endpoint/runtime, rules, demo-emulator workflows and browser checks. Results and exact head belong in the PR.

For local review, use the guarded `npm run test:seller-browser` harness on the task branch. The seeded public dealer at `/catalog?actor=public` and its lot show the new badge, location, CAD $0 fee, tax text and synthetic contacts. Check desktop/mobile layout. Use the public lot's editor with `?actor=admin` to open Social Kit and review dealer copy/graphic exports. Only `demo-wailtail-stage3` loopback Auth/Firestore/Storage are permitted. Keep real credentials and customer data out of the harness.

Legacy/malformed dealer records do not receive an inferred verification badge. No historical backfill, snapshot refresh/reassignment, dealer directories, profile pages, registry automation, M2.6 intake uploads, automatic publication, payments or bidding/settlement redesign is included. Source Firestore/Storage rules are unchanged in M2.5; separately approved live deployment gates remain.

Mobile review correction: the synthetic full-app harness now includes the production viewport meta tag. Browser acceptance asserts a 390 CSS-pixel layout viewport and mobile breakpoint, collapsed disclosure height (at most 270px for the fixture), and expandable contacts/verification text without panel overflow. The listing title precedes the dealer panel. Badge, identity/location, documentation fee and tax summary remain visible; contact links and the full explanation use a native, keyboard-accessible disclosure with a 44px summary target. Local visual acceptance is still pending on the corrected revision.

The true-device check also exposed long navigation branding expanding the mobile viewport. Brand text now shrinks/truncates while the sign-in and menu buttons retain their 44px targets; the viewport assertion remains strict.
