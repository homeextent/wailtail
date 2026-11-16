# Private draft image upload correction

Owner production acceptance on November 16, 2026 exposed an administrator upload failure: the full editor called the public image endpoint for a draft (HTTP 409), and a rejected asynchronous FileReader callback did not reject the outer promise or show feedback.

## Behavior

- The administrator draft/pending-review editor embeds a private Draft images panel. The panel is inside Section 5; existing photo upload buttons open its file picker without scrolling away. JPEGs up to 2 MiB are staged immediately in `auctionDraft/{auctionId}/{assetId}` and registered in `draftAssets`.
- Administrators can read/preview draft assets. Upload/remove still require draft state, revision equality and a verified designated administrator token. Pending-review images are preview-only. Existing seller UID, verification and revision checks remain for non-admin callers.
- The representative route already selects SellerDraftWorkspace and its seller draft endpoint; no global seller promotion or public uploader routing is added.
- Public uploader protections, anonymous Storage denial and private no-store responses remain unchanged. Upload progress and errors are visible. No tokens, signed public links or credentials are generated for draft objects.
- Draft asset registration is separate from the administrator Save Draft button and public hero/gallery configuration. This fix does not promote private images into public gallery URLs or implement PDF uploads.

## Acceptance

Automated coverage: administrator private upload/read/preview, stale revisions, pending-review upload denial, unauthorized account denial and anonymous object denial; asynchronous upload/compression error propagation; browser administrator upload followed by representative asset visibility.

Owner visual review and production retest remain pending. Keep the simulated dealer listing unpublished and unsubmitted until the correction is reviewed. Production data, Storage rules and scheduler state are unchanged by preparing this PR.

Owner local review confirmed real JPEG upload, authenticated preview and persistence across refresh on the initial candidate. Review exposed an unstyled native file input and unwanted jump to a top-level panel. The revised candidate embeds the panel in Section 5 and provides styled keyboard-accessible Upload draft photos, Preview and Remove controls in both workspaces. Revised visual acceptance remains pending.
