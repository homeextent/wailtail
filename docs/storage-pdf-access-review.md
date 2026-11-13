# PDF access review register — November 13, 2026

Status: provisional classification from owner-supplied object metadata and reference scan. Jeremy identified the Porsche and RAM PDFs as vehicle reports through the content-review question. Exact report titles, issuer, personal-data/redaction status and public-disclosure approval are not yet established. No PDF bytes or page contents have been inspected. All three are classified PDF_PRIVATE_REVIEW_REQUIRED as a planning hold, not a finding that their contents are confidential and not a deployed access restriction. Current live Storage rules remain open; existing tokenized access has not been tested or revoked.

## Individual records

| ID | Source path | Observed consumer | Provisional disposition |
|---|---|---|---|
| PDF-1 | `auctions/1988-porsche-928-c3uyca60/gallery/1792949925577-tjvc0.jpg` | Porsche settings `fullGallery[124].url`; owner identifies a vehicle report | Preserve; privacy/redaction review required; no automatic public copy |
| PDF-2 | `auctions/2019-ram-rebel-3a0455wx/gallery/1793403168695-t0pxg.jpg` | RAM settings `fullGallery[23].url`; owner identifies a vehicle report | Preserve; privacy/redaction review required; no automatic public copy |
| PDF-3 | `auctions/lot-test-mtur4abv/gallery/1788998403422-049qn.jpg` | No reference found in the bounded scan | Preserve/hold; apparent duplicate of PDF-1; no deletion or public copy |

| ID | Source generation | Metageneration | Bytes | CRC32C | MD5 |
|---|---|---|---|---|---|
| PDF-1 | 1792949926900813 | 1 | 1654228 | /hBoqw== | QzKkM8jzG29d+ln4Lidx8g== |
| PDF-2 | 1793403169152604 | 1 | 101387 | PwFexw== | 45H+8Cm0bqtF7sAZvsnyew== |
| PDF-3 | 1788998405092918 | 1 | 1654228 | /hBoqw== | QzKkM8jzG29d+ln4Lidx8g== |

Content type is application/pdf for all three despite .jpg names. Matching size/MD5/CRC32C makes PDF-3 an apparent duplicate of PDF-1; byte-for-byte identity has not been independently established. A duplicate is still retained.

All three have download-token metadata; values are not recorded. Object ACL reports NO_PUBLIC_ENTRY and bucket-level public IAM bindings are empty. This does not override open Firebase rules or prove denial of token links; inherited project/folder/organization IAM remains unverified.

## Staging rules dependency

PDF-1 and PDF-2 are the two exact legacy read exceptions in `storage.rules`. Their placement or previous exception is not evidence of consent to publish their contents. Do not blindly publish these exceptions or copy the PDFs into auctionPublic. Do not remove them from live references or change live rules independently of the approved application/media cutover. This documentation PR makes no rules changes.

## Content review and final decision required

The owner should privately inspect the pinned versions, identify the document purpose and determine whether the whole document is safe and authorized for public display. Do not paste token-bearing URLs, credentials or unredacted personal documents into a public PR.

Choose and record one disposition per PDF after review:
- PRIVATE_RETAIN: keep original privately; design an authenticated delivery/reference replacement and original-token revocation in an approved live plan.
- PUBLIC_REDACTED_DERIVATIVE: retain original privately; review a separate redacted derivative, approve its exact content/hash, then plan a new public destination. Never publish the original by implication.
- PUBLIC_DOCUMENT_APPROVED: only with explicit owner approval of the reviewed contents and compatible document presentation. Public-image gallery code must not silently treat a PDF as a JPEG.
- HOLD_REVIEW_REQUIRED: retain without public-copy approval while purpose/authority is unclear.

For PDF-3, confirm the duplicate's role and retain it pending a separately approved retention/cleanup decision. The five owner-protected lot-test images are different objects and remain explicitly protected.

No final public/private content decision, production write, copy, deletion, reference update or token revocation is authorized by this register. See [cutover plan](storage-cutover-plan.md).
