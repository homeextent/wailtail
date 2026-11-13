# PDF access review register — November 13, 2026

Status: private content review completed for the uploaded Porsche and RAM PDFs. Their byte sizes and MD5 checksums match the pinned source versions below. All 14 Porsche pages and four RAM pages were visually reviewed, alongside extracted text, metadata, links, annotations, form fields and embedded-file checks. No live access change was made. Production Storage rules remain open; recording a classification does not secure an object.

## Individual dispositions

| ID | Source path | Consumer | Current decision |
|---|---|---|---|
| PDF-1 | `auctions/1988-porsche-928-c3uyca60/gallery/1792949925577-tjvc0.jpg` | Porsche settings `fullGallery[124].url` | Vehicle history summary; public candidate, external album review/removal remains pending |
| PDF-2 | `auctions/2019-ram-rebel-3a0455wx/gallery/1793403168695-t0pxg.jpg` | RAM settings `fullGallery[23].url` | PUBLIC_DOCUMENT_OWNER_EXCEPTION: owner explicitly permits the existing invoice to remain public for now and plans to replace it with a corrected version |
| PDF-3 | `auctions/lot-test-mtur4abv/gallery/1788998403422-049qn.jpg` | No reference found in bounded scan | Preserve/hold apparent duplicate; no deletion or public approval |

| ID | Source generation | Metageneration | Bytes | CRC32C | MD5 |
|---|---|---|---|---|---|
| PDF-1 | 1792949926900813 | 1 | 1654228 | /hBoqw== | QzKkM8jzG29d+ln4Lidx8g== |
| PDF-2 | 1793403169152604 | 1 | 101387 | PwFexw== | 45H+8Cm0bqtF7sAZvsnyew== |
| PDF-3 | 1788998405092918 | 1 | 1654228 | /hBoqw== | QzKkM8jzG29d+ln4Lidx8g== |

All three are application/pdf despite .jpg names. PDF-3 matches PDF-1's observed size/MD5/CRC32C, but its bytes were not downloaded for independent comparison. Retain it. The five owner-protected lot-test images are different objects and remain protected.

## Private review findings — no personal values recorded

Porsche: the supplied file is a 14-page vehicle-history/maintenance summary, not the full receipt history suggested by its table of contents. No owner residential address, phone, email or signature was found in the reviewed pages. It contains vehicle identification, a business address and an external Google Photos album link. The linked album was not inspected; review or remove that link before final public approval. No embedded files, form fields or non-link annotations were found.

RAM: the supplied file is a four-page parts-order invoice. Purchaser name and residential shipping address appear on page 1; the order identifier occurs in the document and title metadata. No personal values are reproduced here or in the manifest. The invoice evidences parts purchased, not installation. No embedded files, form fields or non-link annotations were found. A future sanitized public copy should remove purchaser identifying details, order identifiers and identifying metadata while preserving relevant parts/date/prices.

Owner decision: Jeremy states the RAM listing is his own and explicitly accepts public display of the existing invoice for now, despite the identified personal information. He will remove it and upload a corrected version after this work. Record this as a narrow owner exception, not a general policy permitting other sellers' personal information. No redaction, seller message or live replacement has been performed. The replacement date is not fixed; there is no automatic removal or reminder.

## Approval semantics and rollout boundary

The manifest sets publication_approved=true only for PDF-2, with approval_scope=PINNED_CONTENT_ONLY_NOT_LIVE_EXECUTION. This approves the reviewed content version for the cutover plan; it does not authorize this documentation change to perform a copy, destination creation, reference update, token change, rule publication or production promotion. All destinations remain blank. A changed generation/content or corrected replacement requires a new review and mapping; do not transfer this exception automatically.

PDF-1 remains a candidate pending external album review/removal. PDF-3 remains held. All other images/SVGs retain their previous eligibility review state.

PDF-1 and PDF-2 are the exact legacy read exceptions in staging storage.rules. Any live rules/copy/reference rollout remains coordinated and separately approved. The RAM owner's content exception does not establish privacy or denial of old token links. All three have token metadata; direct bucket IAM showed no public bindings and object ACLs had no public entry, but inherited IAM and actual token access remain unverified.

## Future work: upload guidance and administrator document check

Status: recorded backlog only; no upload UI or new review enforcement is implemented by this documentation change. Applies to existing seller/administrator listing gallery/document uploads; it is not dependent on optional M2.6 intake photos.

Proposed seller-facing guidance, adjacent to the upload control and before file selection:
> Documents may be displayed publicly. Remove personal information before uploading, including names you do not intend to publish, home addresses, phone numbers, email addresses, signatures, account/payment details and order identifiers. Upload a redacted copy and keep the original privately.

Implementation acceptance:
- Guidance is readable on desktop/mobile, associated with the relevant upload control, and appears before upload. It must not claim automated scanning or guaranteed redaction.
- Administrators inspect actual document contents before approving public display; finding personal information leads to holding the document from public publication and requesting a corrected copy, unless a documented, specific owner exception applies.
- Keep useful vehicle identifiers, service details and seller-authorized information only where appropriate; do not imply every identifier must always be removed.
- Corrected documents receive new identity/type/checksum and review, rather than silently overwriting originals or inheriting public approval.
- Preserve original records and record reviewer/decision/reference changes under the approved workflow; do not invent an existing private-document UI or delivery mechanism.
- PDF-aware presentation/type validation and upload guidance should be scoped as a separate implementation PR. Filenames alone must not determine MIME handling.

See [cutover plan](storage-cutover-plan.md). No production operation is authorized by this register.
