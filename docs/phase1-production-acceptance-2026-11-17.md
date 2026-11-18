# Phase 1 controlled production acceptance — November 17, 2026

## Disposition and provenance

Core dealer implementation through M2.5 is deployed and the controlled dealer workflow passed. This record combines owner-reported production UI, mailbox and authenticated Google Cloud outputs with independently inspected release CI, deployment metadata, signed-out browser and anonymous HTTP checks. These are separate evidence sources; no owner-machine command is represented as executed by ChatGPT.

Formal Phase 1 remains open: the 3–5 genuine dealership pilot and all six System Bible Section 11.6 KPIs remain outstanding/ongoing. M2.6 initial-application private photos are explicitly deferred and decoupled, not implemented by listing draft uploads. Original milestone definitions and Section 11.7 completion criteria are unchanged. A dealer information/application landing page is proposed separately and has not been implemented.

## Released revisions

| Release | Production main | Evidence |
|---|---|---|
| [PR #28](https://github.com/homeextent/wailtail/pull/28) | `f773ca7af4dace3e356cace24434688db11d727d` | Private draft upload/placement publication and compact photo controls, PNG/PDF support; release CI 44096423362 and main CI 44097170522 passed. |
| [PR #32](https://github.com/homeextent/wailtail/pull/32) | `a46acf491bd71adb272c1d726a369d26536c4c9e` | Representative tab-title fix, administrator Save Draft protected-field repair, explicit non-bidding public preview and browser save-readiness repair; release CI 44171369561 and main CI 44171986843 passed. |
| [PR #34](https://github.com/homeextent/wailtail/pull/34) | `9e132c65cd1072625072c6c5a18967390164afa7` | Explicit /lot, /vehicle and /auctions route isolation; unavailable-page handling. [Release CI 44200814079](https://github.com/homeextent/wailtail/actions/runs/44200814079) and [main CI 44201455630](https://github.com/homeextent/wailtail/actions/runs/44201455630) passed. |

Current staging `7f8c233aa78312ae66adf809ce89f53812a618bd` and main `9e132c65cd1072625072c6c5a18967390164afa7` share tree `491a42acf8e651077c0fa57d8a8f0fb142c02ced`. Production deployment `dpl_4PN8ujvFgt68GbeaYRXvpMdEacXy` was READY with www.wailtail.com and wailtail.com aliases. Owner confirmed local staging fast-forward to `7f8c233`; no local main synchronization is claimed.

The prior rules/index/Storage cutover evidence remains in [November 16 acceptance](storage-cutover-acceptance-2026-11-16.md). Vercel source releases do not publish Firebase rules. No rules or Storage migration was rerun for these fixes or this closeout.

## Controlled dealer workflow

The fictional TEST — Haier Fine Autos / 2020 Jaguar F-Type exercised the same assigned-representative flow. It is not a real licensed/ownership-verified dealership and does not count toward the genuine pilot. Its representative retained bidder status; assigned UID access did not promote an account role.

| Check | Recorded result / source |
|---|---|
| Intake, verification and assigned draft | Owner exercised existing dealer application, administrator verification/profile controls and assigned representative workspace. Verification expiry blocked changes, and administrator renewal restored eligibility. |
| Narrative and media persistence | Owner confirmed uploaded images persisted after refresh; Save narrative persisted; administrator full Save Draft succeeded after PR #32 and persisted after refresh. |
| Review/revisions | Owner submitted, confirmed pending_review and read-only state; administrator Request Revisions returned Draft; revision email arrived; representative editing, save/reload and resubmission succeeded. Administrator could inspect uploaded photos. |
| Protected attribution/tax | Owner used dedicated draft-only tax control and received saved confirmation. Historical attribution/representative remained protected; simulated dealer_collects indicator and CAD $0 documentation fee were used. This was no actual tax or licensing determination. |
| Public preview | Owner explicitly published the clearly labelled fictional listing as Public Preview (Bidding Disabled). Independent anonymous API returned preview with one hero and three gallery copies; all four public copies returned HTTP 206 ranged reads. Public summary included business/city/province, verified flag, CAD $0 doc fee and tax handling. |
| Privacy projection | Independent response inspection excluded private contacts, reserve amount, dealer licence/address, representative UID, private verification details and auctionDraft paths. Current private source URLs for those four uploads were not individually probed in this live test; private-object denial also has rules/emulator coverage and prior cutover evidence. |
| Withdrawal | Owner returned listing to Draft. Anonymous detail API returned 404 and catalog excluded it. After PR #34, a signed-out production browser displayed Listing unavailable with matching tab title at the Jaguar /lot URL; no unrelated RAM fallback. Home/catalog returned 200; unauthenticated administrator update returned 401. |

Final listing is **Draft/unpublished**. Its saved test title is `TEST ONLY — Fictional 2020 Jaguar F-Type`; narrative explicitly says fictional details, not offered for sale, no bids or purchases. No actual bid, purchase or settlement was performed. Preview bidding rejection/clock exclusion and date-boundary behavior have source/CI coverage; this is not proof of a real financial transaction.

Private uploads support multiple JPG/JPEG/PNG images; gallery also supports PDF, each up to 2 MiB. Owner accepted the restored compact category/delete/order controls and click-to-preview. PNG/PDF support has automated and owner local acceptance; the four-file live publication check here does not claim an actual production PDF upload/download test.

**Public-copy retention:** returning to Draft hides the listing/API but does not revoke previously published image-copy URLs. Private originals remain retained. Storage and Firestore publication cannot commit atomically; attempt-copy reconciliation limitations remain documented in [publication behavior](draft-image-publication.md). No cleanup/deletion is implied or performed.

## Recurring auction notifications

Scheduler: `wailtail-auction-notifications`, project `studio-apps-483721`, region `us-central1`, GET `https://www.wailtail.com/api/dispatch-auction-notifications`, cron `* * * * *`, timezone Etc/UTC, deadline 60s. No secret/header value is recorded here.

1. Controlled record `phase1-winner-delivery-test-20261117` was delivered once through the worker to the owner's approved mailbox. Owner output: processed 1, pending 0, reconciliationRequired 0; persisted accepted, attempts 1, acceptedAt 1794943579073. Owner separately confirmed actual inbox receipt at 14:26 Eastern November 17. It was explicitly a test with no auctionId, win, payment or listing settlement.
2. Manual Cloud Scheduler RunJob attempts while PAUSED failed with FAILED_PRECONDITION (job must be ENABLED); the successful bounded delivery used the authenticated worker directly. This is distinguished from the later scheduled run.
3. Immediately before activation, owner read-only query found exactly one accepted record and no queued/retrying/reconciliation backlog. Job was PAUSED with no lastAttemptTime. Owner explicitly authorized activation and ran `gcloud scheduler jobs resume` successfully.
4. Owner subsequent read-only Cloud Scheduler output: state ENABLED, schedule `* * * * *`, lastAttemptTime `2026-11-18T00:20:10.661960Z` (**November 17, 19:20:10 Eastern**), status `{}` (successful), next scheduled time `2026-11-18T00:21:01.242703Z`. This confirms actual recurring invocation after activation, not merely a manual run or configured schedule.

Clock/review schedules were already enabled per the prior acceptance. Notification dispatch now processes future bid confirmations, outbid alerts, seller inquiries and winner messages; the accepted test is not requeued or resent. Provider acceptance is distinct from inbox receipt. The successful empty-queue scheduled invocation plus the controlled inbox test do not establish an actual settlement-generated winner email; observe that during normal operation without inventing an auction win.

The worker uses bounded retry/lease/idempotency handling; expired/exhausted records remain reconciliation_required and must not be blindly replayed. Operator responsibility remains with the platform administrator: inspect Scheduler failures and undelivered/reconciliation records, investigate before replay, and retain accepted evidence. This closeout adds no alerting service or background monitoring claim.

## Remaining completion boundary

- Conduct the genuine 3–5 dealership pilot and record verification average ≤48h, curation average ≤72h, 100% exclusive ownership/no broker inventory, 100% zero-fee compliance, zero regulatory/disclosure disputes and the specified ≥90% dealer satisfaction KPI. No pilot outcomes have been measured by fictional testing.
- Observe actual settlement-to-inbox delivery during normal operation. No live financial test was conducted.
- Retain the fictional lot unpublished; profile/listing/assets/test-record retirement requires separately scoped cleanup. The short test-profile verification renewal was not an indefinite genuine verification.
- M2.6 remains optional/deferred. The informational landing page is separate proposed work.

This documentation PR changes no application code, permissions, cloud configuration, rules, messages or production data. Its preparation does not merge staging or authorize a new production release.
