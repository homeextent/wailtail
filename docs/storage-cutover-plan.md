# Production Storage cutover preparation — November 13, 2026

Status: planning inventory only, NOT executable and NOT production-authorized. Source baseline: staging `5fe4008`. Project: `studio-apps-483721`; bucket: `studio-apps-483721.firebasestorage.app`; Firestore database: `ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e`.

## Evidence and limits

Jeremy supplied the published Storage rules (unconditional read/write), Firestore rules (older direct-client access), bucket description (US-CENTRAL1, public access prevention inherited, uniform access disabled), an empty composite-index console view, and a read-only media-reference scan. Production application remains main `fef05a5`; staging protections are not live. Current Vercel environment metadata lacks CRON_SECRET, FIREBASE_STORAGE_BUCKET and AUCTION_REVIEW_RECIPIENT. These observations are dated evidence, not proof of an unchanged live state at execution.

[Inventory CSV](storage-cutover-inventory-2026-11-13.csv) contains 226 unique listed JPEG-named objects: 163 referenced and 63 held without a reference in the scanned documents; zero referenced paths were absent from that bucket listing. The scan covered three auction documents, eight settings documents, empty root media/mediaConfig collections, and auction media subcollections. It did not inspect every collection, external consumer, archived version or hardcoded application fallback. A reference is not proof of public eligibility. A later metadata check reports 216 image/jpeg, 3 application/pdf and 7 image/svg+xml objects despite every filename ending in .jpg. MIME metadata is evidence of type, not a byte-level content or image-integrity inspection.

No credentials, download tokens, complete document contents or private contact fields are included. Reference locations are diagnostic Firestore REST field paths, not Firestore update masks.

## Metadata and PDF access classification

The completed metadata scan found 226 objects totaling 26,841,315 bytes, with all required source checksums/generations present. All have download-token metadata; no token values were retained. Bucket IAM reported no direct public-principal bindings, and all object ACLs reported NO_PUBLIC_ENTRY. Inherited IAM, old versions, soft-deleted objects, actual token URL access and file contents remain unverified. Live Firebase Storage rules are still open.

Three objects are application/pdf and seven are image/svg+xml. See the [PDF access review register](storage-pdf-access-review.md) for the three individually preserved PDFs, apparent duplicate and two staging legacy-rule exceptions. The uploaded Porsche/RAM contents have since been reviewed. The RAM owner explicitly accepts the existing invoice's public display for now and plans to replace it; Porsche external-album review remains pending and the apparent duplicate remains held. These decisions are planning classifications, not deployed access changes. SVG content and image public eligibility also require review. The shared logo is an SVG; do not assume every .jpg path can be decoded as a JPEG.

## Preservation contract

Every row is retained. The CSV's dispositions describe inventory handling, not authorization to copy, publish, delete or change references:
- PRESERVE_REFERENCED: 163 source objects with observed references. Preserve the originals and dependencies until any separately approved replacement is verified.
- HOLD_UNCLASSIFIED: 63 objects with no observed reference in this bounded scan. Retain unchanged. No orphan/deletion inference.
- owner_preserve=true: five explicitly protected objects under lot-test-mtur4abv. Never include these in cleanup merely because the folder is test-named.
- publication_approved=true only for the pinned RAM invoice, with approval_scope=PINNED_CONTENT_ONLY_NOT_LIVE_EXECUTION, following its owner's explicit content exception. The remaining 225 rows are not approved for publication. No copy destination has been approved.

The five owner-protected paths are:
1. `auctions/lot-test-mtur4abv/hero/1788998248108-y3vax.jpg`
2. `auctions/lot-test-mtur4abv/hero/1788998248196-p8bie.jpg`
3. `auctions/lot-test-mtur4abv/hero/1788998248258-t8u5f.jpg`
4. `auctions/lot-test-mtur4abv/promotions/1789137336522-2ulye.jpg`
5. `auctions/lot-test-mtur4abv/promotions/1789137444289-1rvho.jpg`

The three hero objects are referenced by the Porsche's inlineShowcase and showcaseChapters settings; the other two are referenced by promotion cards. Folder ownership therefore cannot determine destination assignment. A shared object may have multiple consumers; retain all associations and verify every consuming surface.

## Required read-only enrichment before an executable plan

1. Refresh the whole bucket inventory and bounded Firestore reference scan; reconcile additions, removals and changed references rather than applying this dated CSV blindly.
2. Capture source generation, metageneration, size, MIME type and checksums for every proposed copy. Retain token-bearing metadata only in a private owner-controlled backup, never Git or pasted output.
3. Inspect listing statuses and each consuming field to distinguish approved public galleries/branding/promotions from draft/private content. Audit application defaults and other references; count images by consumer as well as source folder.
4. Inspect IAM, object ACLs and presence (not values) of download tokens. Firebase rules alone do not establish denial of tokenized URLs or IAM/ACL delivery. Preserve private rollback metadata securely.
5. Inspect actual index state and create a per-field mapping from old reference to proposed URL/storage path with document update-time preconditions. Snapshot affected documents privately for recovery. CSV locations must be translated from REST wrappers and array indices into validated whole-field/array updates.
6. Check candidate application readers and media types before selecting destinations. Public image destinations must fit the candidate `auctionPublic/{auctionId}/{assetId}` rule and include a real listing/common association; no rule broadening or automatic publication of all legacy assets.

The owner-supplied metadata scan now populates all 226 source generations, metagenerations, sizes, MIME types, CRC32C and MD5 values in the CSV; no object names were added or removed relative to the earlier inventory. These are dated observations and must be revalidated at execution. All destination paths remain blank. Only the pinned RAM invoice has owner content approval; its scope explicitly excludes live execution. Blank destinations or changed metadata must stop execution, never imply latest-generation copying or a wildcard target.

## Proposed execution phases — each requires explicit live-operation approval

| Phase | Required behavior and stop condition |
|---|---|
| Release preparation | Pin reviewed application/rules/index revisions, complete environment/worker configuration and recovery plan, confirm approved inventory and maintenance/write-freeze strategy. Existing app versions may still issue direct writes; define cutover sequencing before release |
| Private recovery snapshot | Verify recoverable document/reference and Storage metadata backups; do not restore unconditional public writes as a routine rollback |
| Approved public copies | Copy only signed-off public objects with source-generation matching and create-only destination guards. Exclude private tokens from destination metadata. Verify size/checksum, image decoding and intended delivery; retain originals |
| Reference updates | Apply exact approved mappings using inspected document revisions and safe retry/idempotency records. Preserve galleries, showcase/hero selections, ordering, branding, promotion links and all five protected assets. Abort on changed data, missing destination or unexpected field shape |
| Coordinated app/rules/index rollout | Verify index readiness, trusted routes and environment bindings; transition app and rules in the approved order under controlled writes. Do not publish restrictive rules independently against the old frontend |
| Access verification | Confirm intended public media and every consuming surface still load, anonymous/client mutation is denied, private paths are denied, and original private token URLs no longer work after separately approved revocation. A new-path denial test is not original-link revocation evidence |
| Observation and closeout | Monitor errors, broken image requests, queues, delivery and auction lifecycle; record exact revisions and acceptance evidence. Remove temporary exceptions only after dependencies are verified |

This plan contains no deletion phase. All 63 held objects and five protected objects are excluded from cleanup. Later cleanup, private-token revocation, data migration and production promotion require explicit scoped authorization. If interrupted, retain source objects, reconcile completed commands/destinations and resume with guards; never blindly overwrite destinations or replay changed-document updates. Recovery must preserve data while retaining security, rather than reintroducing open rules.

## Acceptance before closing the Storage gate

- Every approved referenced consumer is accounted for; gallery counts/order, hero/showcase images, shared branding and promotion cards are verified.
- Five owner-protected images remain intact and usable; unmatched objects remain intact.
- New public delivery works without copying private tokens; private original token URLs are explicitly checked after approved revocation.
- Trusted uploads/removal and draft/private delivery work; direct unauthorized writes fail.
- All executed rows have pinned generations, checksums, destinations, per-field mappings and recorded results; no uncertain rows were silently skipped.
- App, Firestore rules/index, Storage rules and worker/mail operational QA are recorded separately. M2.6 intake photos remain optional; no dealer backfill or historical snapshot reassignment is included.

See [Phase 1 production-readiness review](phase1-production-readiness.md). This document does not mark production, Storage cutover or Phase 1 complete.


## Owner RAM exception and future upload guidance

Jeremy confirmed the RAM listing is his own and permits the reviewed invoice to remain public temporarily; he plans to remove it and upload a corrected version after this work. Its content approval does not authorize live operations in this planning revision or transfer to changed bytes. Do not reproduce personal details in repository records. The [PDF register](storage-pdf-access-review.md) records review findings, approval scope and a future-work item for seller upload privacy guidance plus administrator content review. That guidance is not implemented yet and does not alter the core M2.6 scope. Original objects and all five protected images remain preserved.
