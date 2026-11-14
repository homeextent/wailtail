# Owner-authenticated Storage preparation — November 14, 2026

Jeremy supplied the terminal output of `prepare_storage_cutover.py --ipv4-only` at task commit `30d214478637b3ad0a26c6e35849ef4ba5869ee0`. The report was prepared at 2026-11-14T14:12:40.425144Z (9:12 AM America/Toronto). This is owner-executed evidence, not a live run performed by ChatGPT.

Status: **PREPARED_NOT_EXECUTED**. Manifest SHA-256: `4aff72cb53516faffd392f37888a602690439c8e2acc2b08495d6f665a0d7ab0`.

Project: `studio-apps-483721`; bucket: `studio-apps-483721.firebasestorage.app`; named database: `ai-studio-wailtailauction-c952df6d-bb0b-4072-915f-2c67e5ee2b6e`.

| Check | Owner run result |
|---|---|
| Source objects reconciled with pinned manifest | 226 |
| Approved public files validated | 163: 160 JPEGs, two PDFs, one SVG |
| Held objects retained without public migration | 63 |
| Protected source objects retained | Five |
| Proposed reference document writes | Six; proposals only |
| EXIF / GPS flags | None reported |
| Cloud write requests | Zero |

Successful preparation also checks source generations/metagenerations/checksums, destination absence, current bounded reference locations, public listing status and end-of-run document revisions. Request timings in the supplied output were subsecond; no authentication retry was shown in this completed IPv4 run. The earlier IPv6 run was interrupted and is not the accepted successful evidence.

No objects were copied or deleted. No references, tokens, ACLs/IAM, rules, indexes or production application were changed. No EXIF/GPS flag does not prove that photographed or scanned personal information is absent. The pinned RAM invoice remains under the previously recorded owner exception; the Porsche album link is retained as approved. All originals remain retained.

## Evidence retention and remaining work

Jeremy subsequently supplied successful SHA-256 comparison of all 169 copied bundle files in an owner-private home-directory backup outside temporary storage. A private checksum manifest was saved alongside it. The backup contains source files, snapshots and proposed requests; do not attach or commit it. This establishes matching local copies, not an off-device backup, metadata/token backup completeness or a tested restore. The recovery consistency check below remains pending owner execution.

| Remaining gate | Required evidence |
|---|---|
| IAM review and original token access | Owner ancestry output identified organization `941342792525` with no folder. Filtered project/organization policy commands completed without errors and returned no matching `allUsers` or `allAuthenticatedUsers` bindings. Earlier bucket policy/object ACL checks also reported no public entry. This is a bounded dated IAM observation, not denial of token URLs or open Firebase-rule access. Representative original-link checks remain pending; actual private-link denial requires separately approved restrictions/revocation |
| Private backup and recovery | Verify all copied bundle bytes and readability, document original metadata/token backup scope, affected document fields and revision guards. Recovery template remains non-executable until actual post-cutover revisions are known; this is not a tested restore |
| Fresh execution preconditions | Recheck sources, destination absence and document revisions immediately before each approved operation; reconcile drift instead of overwriting |
| Copy and delivery | Separately authorize create-only copies, record destination generations/checksums, verify every copied file and token-free delivery before reference changes |
| Coordinated release | Pin app/rules/index/environment/worker sequencing, compatibility and observation/recovery plan before production authorization |

PR #16 remains preparation-only. Its code head `30d2144` passed full CI run [43602613362](https://github.com/homeextent/wailtail/actions/runs/43602613362), including 22 synthetic preparer tests. Later evidence documentation does not change the executed script or authorize a live cutover. Staging merge and production execution are separate owner decisions.

## Next bounded read-only review

`scripts/review_storage_cutover_evidence.py --backup <private-backup-directory>` rechecks the local backup file set and SHA-256 manifest, regenerates proposed reference writes/recovery fields from the backed-up original snapshot and approved manifest, and checks exact equality with the stored proposals. It also checks pinned copy recipes. No restore or cloud write is executed and no backup file is modified. This checks internal consistency, not freshness, off-device durability or all project data.

With `--check-original-links`, it additionally issues anonymous IPv4 HTTPS GETs with a one-byte Range request to each of the two approved public PDFs, once with the original token from the private snapshot and once without it. Tokens are used in memory only; output contains sample labels and HTTP status codes, not URLs or document values. HTTPS redirects are not followed, TLS verification is retained and no Authorization header is sent. A server may ignore Range; the tool reads only one response byte then closes. Connection errors stop without exposing the URL. Missing/ambiguous snapshot tokens stop rather than guessing. This does not inspect the held PDF or all 63 held links, change tokens, prove which access mechanism allowed a read, or establish private-original denial.

HTTP 200/206 means readable for that request; 401/403 means rejected; 404 alone does not prove access was securely denied. Redirects and other statuses require investigation. Current published open rules are still an exposure regardless of these representative results. Retain this baseline for later separately approved post-restriction comparison.
