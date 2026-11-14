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

The successful bundle was created under owner-local temporary storage. It contains private files, snapshots and proposed requests; do not attach it or commit it. Preserve a verified private copy outside temporary storage before reboot or cleanup. A local duplicate is not an off-device backup. The supplied summary does not establish that this preservation has been completed.

| Remaining gate | Required evidence |
|---|---|
| Inherited IAM and original token access | Inspect project/folder/organization policy as applicable; test approved representative original links without printing tokens. Current open rules mean readability alone cannot identify the access mechanism. Record actual denial only after separately approved restrictions/revocation |
| Private backup and recovery | Verify all copied bundle bytes and readability, document original metadata/token backup scope, affected document fields and revision guards. Recovery template remains non-executable until actual post-cutover revisions are known; this is not a tested restore |
| Fresh execution preconditions | Recheck sources, destination absence and document revisions immediately before each approved operation; reconcile drift instead of overwriting |
| Copy and delivery | Separately authorize create-only copies, record destination generations/checksums, verify every copied file and token-free delivery before reference changes |
| Coordinated release | Pin app/rules/index/environment/worker sequencing, compatibility and observation/recovery plan before production authorization |

PR #16 remains preparation-only. Its code head `30d2144` passed full CI run [43602613362](https://github.com/homeextent/wailtail/actions/runs/43602613362), including 22 synthetic preparer tests. Later evidence documentation does not change the executed script or authorize a live cutover. Staging merge and production execution are separate owner decisions.
