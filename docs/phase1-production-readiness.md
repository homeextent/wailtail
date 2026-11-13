# Phase 1 production-readiness review

Review date: November 13, 2026. Source baseline: staging `49efa367e482486a26c597d426b1f927a880accc` (PR #10). Production branch baseline: main `fef05a54dabea0792f9aac468277426c6591df47`. GitHub comparison reports staging ahead by 174 commits and behind by zero. This establishes ancestry, not approval of that whole release or proof of the deployed production revision.

## Current disposition

Core dealer implementation through M2.5 is accepted on staging. Jeremy confirmed local acceptance and clean synchronization to `49efa36`; exact-head and post-merge CI and Vercel checks passed. M1.0/M1.1 and M2.0A have recorded production acceptance. M2.0B and M2.1–M2.5 remain staging work pending a separately authorized production release. M2.6 private intake photo uploads remain optional and separately gated; they do not block the core dealer release.

The separate auction security implementation was already accepted in PR #3 at `1bf4d6a`. Source includes trusted auction mutations, restricted canonical reads/writes, account deletion protections, private draft media and guarded notification workers. Do not classify those completed staging changes as unfinished implementation. Their production publication and live acceptance remain unverified.

This review inspected committed source and prior acceptance records. It did not inspect live Firebase rules, objects, tokens, deployed environment values, scheduler state, provider credentials or mailbox delivery. No production changes, messages, migration or rollout were performed. An absent source configuration is not proof that an external configuration is absent.

## Release evidence and remaining gates

| Area | Verified source/staging evidence | Evidence needed before production acceptance |
|---|---|---|
| Release scope | main is an ancestor of the reviewed staging baseline; M2.5 merge tree matches accepted head; CI and Vercel passed | Review the entire main-to-candidate change set, including security work and deliberate beta exclusions; select/pin the final release SHA and obtain explicit production authorization |
| API and authority | Single `api/router.ts` entry point; native Node import checks; server-derived designated-admin/assigned-UID authority; canonical auction client writes denied by candidate rules | Confirm production Firebase Admin credentials/project/named database, deployed routes and negative authorization checks; never expose credential values in evidence |
| Firestore rules and index | `firebase.json` binds database `ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e`; candidate rules cover dealer profiles/cases/audits/review records; audit index orders `caseId` then descending `revision` | Read deployed rules/index state, compare with candidate, plan compatible publication and verify index readiness. `npm run deploy:rules` publishes Firestore rules only; it does not publish indexes or Storage rules |
| Storage cutover | Trusted upload/delivery paths and emulator coverage exist; candidate public objects live under `auctionPublic/{auctionId}/{assetId}`; `storage.rules` keeps only two exact legacy gallery objects readable | Inventory actual bucket/media and legacy document URLs, plan protected copy/reference updates, generation-guarded recovery, legacy PDF token revocation and approved demo cleanup; verify original private URLs denied and intended gallery URLs readable before declaring cutover complete |
| Storage binding | Server requires `FIREBASE_STORAGE_BUCKET`; recorded bucket is `studio-apps-483721.firebasestorage.app` | Reconfirm actual project/bucket, service authority and deployed Storage rules before any mutation; the recorded binding is not live verification |
| Background workers | Review dispatch, auction clock reconciliation and auction notification dispatch endpoints exist; authentication/retry behavior covered in staging | Verify recurring authenticated callers, cadence and credentials for all three. Checked-in `vercel.json` has no cron entries; external scheduler configuration was not inspected |
| Email and monitoring | Synthetic tests mock transport; durable outboxes, retries and reconciliation states exist | Confirm approved sender/recipient configuration and provider credentials privately; authorize a bounded real-mail test, confirm delivery and establish monitoring/reconciliation ownership. Provider acceptance alone is not inbox delivery |
| Existing records and compatibility | Legacy/malformed dealer snapshots fail closed for badges; historical attribution is preserved; legacy/private one-click conversion and broad purge remain disabled | Review actual production records and intended launch inventory read-only; confirm cutover compatibility and accepted exclusions. No dealer backfill, snapshot refresh or reassignment is implied |
| Production QA/recovery | Staging covers intake → verification → assigned draft → narrative/media → review and public disclosure, alongside auction/security regressions | Prepare recovery/backup and app/rules/Storage sequencing for the pinned release; after authorized rollout record route, identity, privacy, lifecycle, media, bidding/settlement and notification smoke-test evidence |
| Founding Dealer Pilot | System Bible Section 11.6 defines a 3–5 dealer pilot and six KPIs | Recruit approved dealers, execute and record the pilot before broad availability; production deployment alone does not satisfy formal Phase 1 completion |

## Recommended execution order

1. Merge the documentation acceptance synchronization through its own reviewed PR. Refresh source refs afterward.
2. Perform a read-only live release preflight: actual deployment revision, configuration presence (never secret values), deployed rules/indexes, bucket inventory/token exposure and worker schedules. Record access limitations explicitly.
3. Turn the findings into a concrete release/cutover plan with a pinned candidate, compatible sequencing, recovery and bounded production QA. Resolve demonstrated gaps on focused staging PRs.
4. Obtain explicit authorization for production promotion and each live rules/Storage/data operation. This review is not that authorization.
5. Execute the approved rollout, verify live behavior and record production acceptance. Then conduct the Founding Dealer Pilot against the unchanged roadmap criteria.

No extra core dealer feature milestone is required before this release review. Choosing optional M2.6 is a separate product decision. Formal Phase 1 completion remains governed by System Bible Section 11.7, including production QA, the pilot and consistent documentation.


## Owner-supplied live preflight evidence — November 13, 2026

Jeremy confirmed the named project/database and bucket. Published Storage rules allow unconditional read/write; supplied Firestore rules remain the older direct-client baseline. The named database's composite-index console view is empty. Bucket description reports US-CENTRAL1, inherited public access prevention and uniform access disabled. A bounded read-only reference scan found 226 JPEG-named objects, 163 referenced paths and 63 unclassified objects, with no referenced path missing from the supplied listing. Five referenced lot-test images are explicitly preserved by owner instruction. See the [Storage cutover preparation and limits](storage-cutover-plan.md) and its inventory. These observations supersede the earlier source-only unknowns for these specific checks; they do not establish live IAM/token denial, private-file inventory completeness or cutover readiness. No live changes were made.


The subsequent owner metadata check completed: 226 unchanged object paths; 216 image/jpeg, 3 application/pdf and 7 image/svg+xml; generations, metagenerations, sizes and MD5/CRC32C captured for all. Every object has download-token metadata. Direct bucket public-principal IAM bindings were empty; object ACLs had no public entry. Inherited IAM and actual token-link denial remain unverified, and the open Firebase rules remain a separate exposure. The two legacy staging Storage read exceptions are PDFs referenced by Porsche/RAM galleries; a third, held PDF has matching size/checksums to the Porsche PDF. See [PDF review register](storage-pdf-access-review.md). Final content/access decisions remain pending private owner review; no PDF was approved for public copying and no live restriction was applied.


Private review subsequently inspected the checksum-matching Porsche history summary (14 pages) and RAM parts-order invoice (four pages). Jeremy explicitly permits the existing RAM invoice on his own listing to remain public for now despite identifying details and will upload a corrected version later. Only that pinned content version is approved in the planning manifest; no destination/live operation is authorized. Porsche external-album review and the held duplicate remain pending. See the [PDF register](storage-pdf-access-review.md) for findings and the future upload-guidance/administrator-review backlog. No personal values or document contents were committed.
