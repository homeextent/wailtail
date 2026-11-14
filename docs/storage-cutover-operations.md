# Read-only file validation and guarded operation preparation

This tool prepares a private cutover evidence bundle. It has no apply command and makes only authenticated GET requests to the fixed Cloud Storage/Firestore APIs. It never copies cloud objects, submits a Firestore write, changes tokens, deletes anything, publishes rules/indexes or promotes production. gcloud supplies a token in memory; it is never printed or persisted by the tool.

The reviewed manifest SHA-256 is pinned in `scripts/prepare_storage_cutover.py`. It covers all 226 sources, the 163 approved public destinations and the 63 retained/unmigrated sources. The five owner-protected objects are preserved. A changed manifest must be deliberately reviewed and its pin updated through a PR, not bypassed to make validation pass.

## Checks performed

- Reconcile the live 226-object set and each generation, metageneration, size, MIME type, MD5 and CRC32C with the approved inventory; repeat metadata checks after downloads. Stop on additions/removals or drift.
- Require all 163 proposed destinations to be absent; 403 or other permission errors are not absence. Never overwrite or automatically reuse an existing destination.
- Download the pinned approved objects into the new private output directory. Decode every JPEG, check format/checksums, flag EXIF and GPS metadata presence without disclosing their values, render each approved PDF page and require the reviewed PDF SHA-256/page count. PDF encrypted/forms/embedded or detected active content stop preparation.
- Validate the SVG logo against a conservative static SVG allowlist. Scripts, event handlers, foreign content, external resource references, entities and unsafe CSS are blocked. Unsupported constructs require inspection, not loosening validation blindly. Byte-level checks do not establish that photographed/scanned personal information is absent.
- Scan current auctions/settings/mediaConfig/media and auction media subcollections. Exact observed Storage-reference locations must match the bounded manifest; any added/removed reference stops preparation. The two mapped listings must have a public status. Read raw documents only into owner-private local files.
- Build whole-top-level-field replacement proposals, preserving arrays/order and unrelated data; set `isPdf=true` for PDF gallery objects. Each proposed Firestore write carries its inspected `currentDocument.updateTime`. Recheck document revisions at preparation end. A race after preparation still requires fresh execution checks and native preconditions.

## Local setup and execution

Requirements: Python 3.12, the authenticated owner-side Google Cloud CLI and the two pinned validation packages. Use a private virtual environment outside Git. Run only the reviewed task revision or its accepted staging merge. Do not use a service-account key copied into the repository.

```bash
umask 077
prep_dir="$(mktemp -d /tmp/wailtail-cutover-XXXXXX)" &&
python3 -m venv "$prep_dir/venv" &&
"$prep_dir/venv/bin/python" -m pip install -r scripts/storage-cutover-requirements.txt &&
"$prep_dir/venv/bin/python" scripts/prepare_storage_cutover.py \
  --output "$prep_dir/evidence"
```

The command downloads the approved public-candidate bytes locally and incurs read requests. It does not download the 63 held objects. Their versions/metadata are still checked and originals retained. Live inspection is not an emulator test: it must use the exact project/bucket/database named in the tool. No output directory may be inside this repository, and an existing output path is rejected. Directory permissions are 0700; persisted evidence/files are 0600. These permissions are not disk encryption or an off-device backup; use an owner-controlled location with appropriate retention.

If token acquisition times out, test `gcloud auth print-access-token >/dev/null` before a fresh run. Never print/paste the token. A blocked run returns a nonzero exit status and does not emit a successful summary or final operation proposals. Retain private partial evidence and use a new output directory for a deliberate retry. Do not bypass changed-source, unsafe-file or reference-drift checks.

Only attach `shareable-summary.json` (successful run) or `blocked-summary.json` (blocked run) to the conversation. Do not attach the whole evidence directory or commit it. If the script cannot create an output directory or dependencies are missing, send the short terminal error instead.

## Evidence bundle

| File | Contents and handling |
|---|---|
| shareable-summary.json | Sanitized counts, manifest hash, timestamp, paths with EXIF/GPS flags and remaining gates; no tokens/document values |
| blocked-summary.json | Safe failure reason and zero cloud write count, only on failure |
| files/ | Actual downloaded approved candidates, including the owner-exception invoice; private, never Git |
| private-file-validation.json | Byte checksums/SHA-256, dimensions/page counts, local filenames and validation flags |
| private-firestore-snapshot.json | Original scanned document fields, including existing URLs and potentially personal information; private recovery evidence, never share publicly |
| proposed-copy-operations.json | Non-executed Storage rewrite request recipes: pinned source generation/metageneration and destination generation-match zero; allowlisted MIME/cache/disposition metadata, empty custom metadata and no source ACL propagation |
| private-proposed-reference-commit.json | Non-executed, atomic Firestore commit body with changed top-level fields only, exact masks and per-document update-time preconditions; contains document data, keep private |
| private-recovery-template.json | Original affected fields; explicitly non-executable until actual post-cutover document update times are recorded and recovery is approved |

The Storage recipes are POST descriptions written to disk, not requests performed by this tool. Their empty custom metadata is intended to exclude legacy download tokens; actual destination metadata/ACL and delivery must be checked after any separately approved copy. Multi-request rewrites require preserving and checking the same parameters and continuation token; there is no automatic execution/resume implementation here.

## Gates before any live write

`PREPARED_NOT_EXECUTED` means local preparation completed, not permission to execute. No arbitrary curl/pasted request should be issued from these files without the approved execution procedure. Before copies or references can be applied:

1. Review the sanitized result, every indicated EXIF/GPS issue and any privacy/content limitation. Inspect inherited IAM and actual old-token access; this tool does not prove privacy or revoke links.
2. Verify private backups/recovery and the intended document set. Scope any omitted collections, application defaults and external consumers; bounded scanning is not a whole-project proof.
3. Refresh source/destination/reference checks immediately before execution. Freeze affected writes as approved; native generation/update-time guards are mandatory. A changed source or existing destination requires reconciliation, never a force overwrite.
4. Obtain explicit authorization for exact copy operations. Record each destination generation/checksum/metadata. Verify **all** copied bytes, PDF/SVG handling and token-free public delivery before permitting the reference commit. A recipe's existence is not proof a destination exists.
5. Obtain explicit authorization for the guarded reference commit and coordinated app/rules/index rollout. Preserve full galleries, ordering, heroes, showcases, branding and promotion consumers. Verify resulting document revisions and use those for any separately approved recovery. Never blindly replay/revert after an uncertain commit.
6. Complete explicit token/rules cutover, original-link denial tests and production QA. Do not restore open writes as routine rollback. No source deletion is part of this plan.

Trusted PDF replacement uploads, missing production environment/worker/index configuration and all other [release requirements](phase1-production-readiness.md) remain separate. This tool does not resolve those gaps.

## Tests and current evidence

```bash
python -m pip install -r scripts/storage-cutover-requirements.txt
python -m unittest discover -s tests -p test_storage_cutover.py -v
```

CI runs the synthetic tests with no gcloud authentication or live requests. They cover manifest pinning, source corruption/drift, public-status/reference drift, destination collision, late document revision drift, native copy/update preconditions, PDF flags/field continuity, SVG blocking, private output permissions and a GET-only synthetic preparation. No private source PDFs are committed as fixtures.

ChatGPT-local checks rendered and verified both uploaded PDFs (14 Porsche pages and four RAM pages) against the approved source checksums and SHA-256. The 160 approved JPEG files and one SVG require the owner-side live run above. Do not mark all 163 files validated from synthetic tests or successful CI alone. Record exact-head CI and the owner-side summary in the PR; keep this distinction when merging.

Authentication recovery: each rejected HTTP 401 read refreshes the local gcloud token and retries that GET once. A second 401 stops preparation; 403 and other errors are not retried. Tokens and gcloud error output are never displayed. Use a fresh output directory when rerunning after a blocked run; retain previous evidence privately.

For networks where IPv6 connection attempts time out, pass `--ipv4-only`. This affects only this script’s HTTPS connections, preserves TLS certificate/hostname verification and does not change operating-system DNS or network settings. Each request prints only its service hostname, elapsed seconds and attempt number, never the object URL or token. Google Cloud CLI authentication is a separate subprocess and is not affected by this option. Ctrl+C writes a private `cancelled-summary.json`, exits 130 without a traceback, and preserves partial evidence; restart with a new output directory (no resume support).
