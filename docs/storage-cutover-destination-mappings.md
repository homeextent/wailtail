# Approved asset decisions and proposed destination map — November 13, 2026

Planning baseline: staging `4af2c82`. No live operation was performed or authorized by this documentation update.

## Owner decisions

Jeremy selected Keep album link, confirming the intended public scope of the shared Porsche album, and Approve referenced set for the 163 assets referenced in the supplied scan. The 63 unmatched objects remain preserved and excluded from public migration. The prior specific RAM invoice exception and five protected lot-test images remain in effect.

The Porsche PDF's short album link was opened in the read-only browser. It resolves to a Google Photos shared album titled Porsche 928 S4 - 2022/26, available without signing in, with dated photo entries. This establishes public accessibility of the linked album, not exhaustive review of every photo or future album changes. Owner approval to retain the album link resolves the publication decision; it is not a claim of automated privacy assurance. The share key and individual photo URLs are not copied into repository records.

## Mapping totals

| Intended use | Objects | Destination group |
|---|---:|---|
| Porsche gallery/hero/showcase, including three protected test-path images | 135 | auctionPublic/1988-porsche-928-c3uyca60/ |
| RAM gallery and invoice | 24 | auctionPublic/2019-ram-rebel-3a0455wx/ |
| Shared site logo and three promotion images, including two protected test-path images | 4 | auctionPublic/common/ |
| Unmatched retained originals, including the third PDF | 63 | No public destination |

The 163 public candidates comprise 160 JPEG images, two PDF documents and one SVG logo. All 226 originals are retained; this plan contains no deletion. Owner publication decisions are subject to file validation and refreshed source/reference checks.

## Exact mapping contract

The [inventory CSV](storage-cutover-inventory-2026-11-13.csv) contains the per-object proposed destination path, token-free proposed delivery URL, source version/checksums, required content type and reference locations. These are planned identities, not existing copied objects or verified working URLs.

For each approved source:
- Destination group follows its observed consumer, not its source folder. Three test-path hero objects belong to Porsche showcase consumers; two test-path promotion objects belong to common promotions.
- Asset ID is `legacy-{source_generation}-{source_filename_stem}.{verified_metadata_extension}`. The extension is jpg/pdf/svg according to observed MIME metadata; bytes still need validation. Destinations are flat three-segment paths compatible with candidate Storage rules.
- All 163 destinations and delivery URLs are unique. No source is silently deduplicated or overwritten.
- Destination writes must require generation-match zero. Copy exact source generation with metadata preconditions and verify byte size/checksum; stop on drift, invalid content, unexpected existing destination or unsupported consumer.
- Destination metadata is allowlisted: preserve appropriate MIME/cache/disposition fields only after review; never copy download tokens, source ACLs or arbitrary custom metadata. Public PDF disposition must use a proper .pdf filename; validate SVG for active/external content before any public copy.
- Reference locations are diagnostic REST paths, not executable update masks. Collect exact current document update times and build guarded whole-field/array updates before mutation. Replace every observed consumer, preserve roles/order and avoid concurrent edits.
- For the two PDF gallery entries, explicitly set/preserve isPdf=true and document category as appropriate. The existing gallery detector cannot rely on .pdf?alt=media URL suffix detection. Check document preview/download and exclude PDFs from promotional photo trays.
- Validate the SVG logo in its actual branding surfaces; do not attempt to transcode it blindly as a JPEG.

## Retained/private side

The 63 unmatched objects have planned_access=RETAIN_NO_PUBLIC_MIGRATION, no destination/URL and no publication approval. Preserve originals and evidence. Calling them retained/private is an intended end state, not current access: live Storage rules are open and token metadata exists. Privacy requires separately approved legacy-rule closure, relevant token revocation and verification of original links, plus inherited-IAM review. No unmatched object is classified as a deletable orphan.

All original source objects remain preserved, including those with public replacement copies. Token revocation changes metadata and requires its own preconditions and private recovery records; do not perform it implicitly during content copying or before reference cutover is verified.

## Execution prerequisites still outstanding

Owner content/access decisions and proposed destination identities are complete for this bounded snapshot. Execution is not ready:
1. Refresh generations, metagenerations, object inventory and consumer references; obtain Firestore document revisions and current statuses.
2. Validate 160 image byte streams and the SVG logo; review actual inherited access and original-token behavior without exposing token values.
3. Confirm destination absence, exact conditional copy/update commands, durable results, recovery and app/rules/index rollout sequencing.
4. Complete missing environment/worker/mail/index requirements from the production-readiness review, then obtain explicit live-operation authorization.
5. Verify all galleries, heroes, showcases, PDFs, branding and promotion cards after approved cutover; retain originals and held objects.

A demonstrated follow-up: the trusted administrator image-upload endpoint currently accepts JPEG/PNG/WebP only, while the editor advertises PDF selection. Existing PDF presentation is implemented, but a corrected PDF cannot be assumed uploadable through the new trusted image handler. Plan a scoped trusted PDF replacement/upload workflow (with upload privacy guidance) before relying on the owner's later corrected-document upload. This is distinct from one-time migration of existing PDFs; do not weaken image validation or reactivate legacy direct writes as a workaround.

No rules, application code, bucket objects, Firestore references, download tokens or production release state were changed here.
