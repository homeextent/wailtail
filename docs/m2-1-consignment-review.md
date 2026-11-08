# M2.1 administrative consignment review

Implementation proposed from staging `9c64b68`; staging acceptance and owner merge authorization remain pending. Production deployment, Firebase rules publication and Storage work are separate.

## Behavior and data boundaries

The Consignment Pipeline's **View application** opens a dedicated inspection modal. All captured vehicle identity, transmission, contact, location, reserve expectation and applicant condition notes are shown read-only. Optional dealer declarations are displayed if present; missing information is explicit. Additional submitted fields are surfaced for historical compatibility. Existing linked `dealer_profiles` verification fields are fetched separately, labelled as canonical recorded information and never modified. Applicant assertions do not establish verified status.

Opening, closing, reloading and paging history perform no writes. Explicit **Save internal note** and **Save assignment** commands never change application status or grant seller/dealer privileges. Existing rejection, reopening and listing-editor controls remain separate; one-click conversion remains disabled. Current intake captures condition narratives in applicant `notes`; no structured condition questionnaire is added.

`POST /api/admin-consignment-review` uses the shared verified-token wrapper (including revocation checking), then checks the designated-administrator email allowlist. Payloads are strictly bounded; assignees are restricted to those two administrator emails or unassigned. Author UID/email and timestamps come from the server. Unknown fields, client-supplied authors/status and non-administrator assignees are rejected.

Private metadata lives in `consignmentReviews/{source}:{applicationId}`. The `source` is explicitly either `consignment_applications` or legacy `consignments`, preserving same-ID source separation. The paginated pipeline assigns this source after reading persisted data so an application cannot override it or its document ID.

Each explicit save transaction checks the application still exists, checks the review revision, appends an immutable `events/{commandId}` record, and advances the private revision. Stale concurrent writes return 409. Retrying the same command by the same author with the same content returns success without another event; reuse with different content/author is rejected. Notes are append-only; corrections use another note. The UI retains unsaved note text on failures and supports reload before retry.

Events contain action, value, revision, server timestamp and authenticated administrator UID/email. Assignment events retain their historical value. History pages contain at most 50 events, newest first, with an explicit older-page control. Existing application timestamps/reviewer metadata are labelled as legacy information. Missing historical events are not reconstructed; this feature records new note/assignment actions, not the separate existing status controls.

Candidate Firestore rules allow only designated administrators to read private roots/events and deny every direct client write, including administrator writes. Applicants retain existing access to their own application documents, which never receive these private notes. No public projection includes review records. Private review history is retained separately; this scope adds no purge or historical-data migration.

## Verification

Performed in ChatGPT's isolated workspace using synthetic demo emulators:

- Production build/TypeScript and ESLint passed.
- Endpoint suite: 114 tests passed, including authority, revoked/unverified credentials, strict input validation, forged metadata rejection, read-only inspection, canonical verification projection, atomic save construction, conflict/failure behavior and idempotency. Native Node loading covers all 31 routed handlers.
- Integrated emulator suite passed: existing seller/auction lifecycle plus M2.1 real Firestore transactions. M2.1 covers concurrent note conflicts and retry preservation, assignment validation, same-ID source isolation, unchanged applications and a 54-event pagination fixture. Authentication is injected in that focused transaction test; the browser harness uses real emulator Auth.
- Firestore privacy-rule coverage checks guest/applicant/unrelated/unverified denial, both designated administrators' reads, applicant application-read continuity and denial of direct private-record writes/deletions.
- Browser acceptance was extended for inspection, unchanged pending status, failed-save text retention, note/assignment persistence across full navigation and continued seller editing/disabled conversion. Local Chromium debugger startup was unavailable, so local browser acceptance is **not claimed**. Exact-commit GitHub CI must pass before staging acceptance.

Required CI runs build, lint, endpoint, rules, emulator and browser suites. Consult the PR's checks on its actual head for the final CI result; this document does not claim future checks have passed.

## Exclusions and release implications

No dependencies added; no production writes, notifications, Storage migration, live rules publication, dealer intake redesign, dealer verification decisions, canonical profile creation, listing conversion, multi-seat roles or application photo uploads.

The new API is routed through the existing single Vercel Function. It uses server access for private reads/writes. Candidate rules add administrator-only direct read visibility and deny client mutations; they must remain part of the separately authorized Firebase rollout. An old ruleset's default denial is not a substitute for verifying the actual deployed rules. Source integration and preview hosting do not establish production deployment or backend isolation.
