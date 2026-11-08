# M2.2 dealer application intake

Implementation based on staging `e7de147`. Local visual/functional review and PR merge approval are pending. Production and live Firebase rule publication remain separate.

## Included behavior

The existing `ConsignmentModal` defaults to Private seller. Dealer selection reveals legal business name, optional trade name/DBA, dealer licence number and one of 13 Canadian licensing jurisdictions. Existing contact fields become the primary authorized representative's name, email and required phone. Switching classifications clears declaration selections; private payloads omit dealer fields.

The submit button is gated by the explicit ownership/terms checkbox and all three dealer declarations. Required text/select fields are validated on submission, with native field-specific validation identifying missing/invalid controls; they do not silently disable the button through React state. Submission reads visible named controls through FormData, including browser-autofilled values that may not emit change events, and retains those values on a failed request. The trusted endpoint independently enforces all required details and declarations.

Dealers must explicitly affirm all three declarations, initially unchecked:

1. The dealership is the registered legal owner of this vehicle and holds clean title.
2. The dealership will be the sole legal seller of record and is responsible for its retail sale obligations.
3. This is not brokered inventory, a third-party consignment to the dealership, or a private-owner pass-through sale.

The existing ownership/terms agreement remains required for both flows. `src/config/consignmentIntake.ts` defines the shared wording, jurisdictions and declaration version (`dealer-intake-v1`). Changing declaration wording requires a new version. Existing M2.1 review labels the business details and declarations as applicant-provided, separates canonical verification data and displays the server acceptance timestamp/version. Historical missing fields are not inferred or migrated.

## Trusted submission and privacy

`POST /api/submit-consignment` supports guest and authenticated applicants with the same untrusted-contact contract. It accepts a strict field allowlist; validates required vehicle/contact fields, bounded text, email, dealer details, Canadian jurisdiction, terms/version and literal true declaration booleans; and rejects status, timestamps, roles, UID links, verification fields, dealer IDs and private review metadata.

The server normalizes email and stamps `pending`, `submittedAt` and `declarationAcceptedAt`. It transactionally creates matching `consignment_applications/{submissionId}` and legacy `consignments/{submissionId}` documents, plus a server-only `consignmentIntakeCommands/{submissionId}` payload hash. The browser retains a UUID for unchanged retries: identical concurrent/retried requests create one application; changed content or existing-reference collisions return 409. Failed persistence does not partially save a copy or report success. Deleted applications are not resurrected by replay.

Candidate rules deny direct non-admin writes containing dealer classification, dealer fields or server declaration metadata in both application collections. Existing legacy private submissions and designated-administrator creation privileges are retained. Applicant verified-email reads and administrator-only application modifications remain unchanged. Idempotency records deny all client reads/writes, including administrators. New intake creates no verified profile, trusted seller identity or access grant.

Notifications preserve the existing non-blocking client dispatch after a confirmed new submission. Replays do not resend. If the initial success response is lost, a retry can confirm persistence without dispatching a missed email. Durable email delivery/reconciliation is not added by M2.2; submission success means persisted application, not inbox delivery. Synthetic previews mock the mail endpoint entirely.

## Verification and acceptance

ChatGPT workspace checks passed: build/TypeScript, ESLint, 120 endpoint/native runtime tests, 136 Firestore rules tests and all three integrated demo emulator workflow tests. Exact-head CI browser acceptance remains to be verified in the PR. Focused coverage includes missing/false/string declarations, 13 jurisdictions, invalid contacts, forged fields, direct-write bypass, private-seller continuity, atomic failure, concurrent retries, source-copy equality and no automatic verification.

The browser suite checks actual mouse-wheel reachability of vehicle/contact fields and a visible footer in both modes at desktop and mobile sizes, as well as the actual form in the guarded preview: incomplete dealer declarations block persistence; simulated failed submission retains inputs; complete dealer and private submissions remain pending; dealer details appear in M2.1 without verified status. Local Chromium debugger startup was unavailable in the established ChatGPT environment. Local automated browser success is not claimed; inspect exact-head CI results in the task PR.

**Jeremy must personally verify the local interface before approving its PR merge.** CI browser success is additional evidence, not visual approval. No merge is authorized by implementation approval alone.

## Local visual review

Use a clean checkout of the M2.2 task branch after inspecting `git status -sb`. Follow the active-worktree procedure in `docs/local-development.md`; do not reset, discard edits or overwrite an existing local branch. Install dependencies with `npm ci` if necessary, then run:

```bash
npm run test:seller-browser
```

Open `http://127.0.0.1:4178/intake` to inspect the actual form. This harness-only route is not a new production page. Use synthetic names, email and licence information. Test both applicant selections, missing declarations and a successful dealer submission. In a separate tab, open `http://127.0.0.1:4178/admin?tab=consignments` and inspect the saved application. Check layout at desktop and narrow/mobile widths. Mail is mocked; no real messages are sent. Stop with Ctrl+C.

The guarded harness uses only `demo-wailtail-stage3`, loopback Auth/Firestore/Storage and synthetic data. The normal Vite dev server is not this isolated environment.

## Exclusions

No registry lookup or licence verification, canonical dealer-profile creation, user promotion, dealer attribution/snapshots, listing conversion, public badges/contact display, photo uploads, payments, production deployment or live rules publication. Existing disabled conversion stays disabled. The new endpoint uses the existing single Function router; no dependencies are added.
